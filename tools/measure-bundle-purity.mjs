/**
 * 估算「解析 bundle 模块表」这条路的收益上限。
 *
 * 对每个 app-service.js：
 *   1. 建模块表；
 *   2. 判断每个模块的 factory 体内是否出现宿主引用（wx./window./process./Page( 等）；
 *   3. 遍历 require 调用点，解析目标模块，统计指向「纯语言模块」的比例。
 *
 * 纯语言模块 = 模块体内看不到宿主 API 的模块。命中的 require 如果指向纯语言
 * 模块，理论上可以把结果从「未知边界」升级为可分析的模块内绑定。
 * 这是收益上限的粗估，不是精确值；精确值要接入 analyzer 之后才能测。
 *
 * 用法：node tools/measure-bundle-purity.mjs --limit 50
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseJavaScript } from "espree";

import {
  buildBundleModuleTable,
  findOwningModule,
  isRequireCall,
  resolveBundleRequest,
} from "../src/bundle-modules.mjs";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const sourceRoot = path.resolve(
  argValue("--source") ??
    "E:\\复现\\sample_collector\\可用于实验的干净源码包",
);
const limit = Number.parseInt(argValue("--limit") ?? "50", 10);

// 宿主引用启发式：模块体内出现任一模式即视为「涉及宿主」。
const HOST_PATTERN =
  /\b(wx\.|window\.|document\.|process\.|getApp\s*\(|Page\s*\(|Component\s*\(|Behavior\s*\(|getCurrentPages\s*\(|my\.)/u;

const projects = readdirSync(sourceRoot)
  .filter((name) => existsSync(path.join(sourceRoot, name, "app-service.js")))
  .slice(0, limit);

const stats = {
  projects: 0,
  parseFailed: 0,
  modules: 0,
  pureModules: 0,
  requires: 0,
  resolvedRequires: 0,
  pureResolvedRequires: 0,
  hostResolvedRequires: 0,
  unresolvedRequires: 0,
};

const walk = (node, visitor) => {
  if (!node || typeof node.type !== "string") return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor);
    } else if (value && typeof value.type === "string") {
      walk(value, visitor);
    }
  }
};

for (const project of projects) {
  const filePath = path.join(sourceRoot, project, "app-service.js");
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  stats.projects += 1;

  let ast;
  try {
    ast = parseJavaScript(source, {
      ecmaVersion: "latest",
      sourceType: "script",
      range: true,
    });
  } catch {
    stats.parseFailed += 1;
    continue;
  }

  const { modules } = buildBundleModuleTable(ast);
  stats.modules += modules.size;

  const pure = new Map();
  for (const [key, entry] of modules.entries()) {
    const range = entry.factoryNode?.range;
    if (!range) {
      pure.set(key, null);
      continue;
    }
    const code = source.slice(range[0], range[1]);
    const isPure = !HOST_PATTERN.test(code);
    pure.set(key, isPure);
    if (isPure) stats.pureModules += 1;
  }

  walk(ast, (node) => {
    if (!isRequireCall(node)) return;
    const owner = findOwningModule(node, { modules });
    const target = resolveBundleRequest(node.arguments[0].value, owner);
    stats.requires += 1;
    if (!modules.has(target)) {
      stats.unresolvedRequires += 1;
      return;
    }
    stats.resolvedRequires += 1;
    if (pure.get(target) === true) {
      stats.pureResolvedRequires += 1;
    } else {
      stats.hostResolvedRequires += 1;
    }
  });
}

const pct = (value, total) =>
  total === 0 ? "—" : `${((value / total) * 100).toFixed(2)}%`;

console.log(`抽样项目：${stats.projects}（解析失败 ${stats.parseFailed}）`);
console.log(`模块总数：${stats.modules}`);
console.log(
  `纯语言模块：${stats.pureModules}（${pct(stats.pureModules, stats.modules)}）`,
);
console.log(`require 调用点：${stats.requires}`);
console.log(
  `  命中模块表：${stats.resolvedRequires}（${pct(stats.resolvedRequires, stats.requires)}）`,
);
console.log(
  `  其中指向纯语言模块：${stats.pureResolvedRequires}（${pct(stats.pureResolvedRequires, stats.resolvedRequires)}）`,
);
console.log(
  `  其中指向含宿主模块：${stats.hostResolvedRequires}（${pct(stats.hostResolvedRequires, stats.resolvedRequires)}）`,
);
console.log(
  `  真正外部依赖：${stats.unresolvedRequires}（${pct(stats.unresolvedRequires, stats.requires)}）`,
);
