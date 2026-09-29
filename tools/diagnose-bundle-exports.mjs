/**
 * 诊断模块表里导出形态的分布，回答迭代 3 该往哪儿追。
 *
 * 对每个 app-service.js：
 *   - 模块总数
 *   - 有 defaultExport（`module.exports = <expr>`）的模块数
 *   - 只有命名导出（`exports.foo = ...`）的模块数
 *   - 动态导出（`exports[key] = ...`）的模块数
 *   - 无任何静态导出的模块数
 *
 * 同时统计「模块变量被直接使用」（origin 为 `bundle:`）的 finding 落在哪一类模块上
 * ——这类 finding 是迭代 3 要处理的主要对象。
 *
 * 用法：node tools/diagnose-bundle-exports.mjs --limit 30
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseJavaScript } from "espree";

import { analyzeSource } from "../src/analyzer.mjs";
import {
  buildBundleModuleTable,
  extractModuleExports,
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
const limit = Number.parseInt(argValue("--limit") ?? "30", 10);

const projects = readdirSync(sourceRoot)
  .filter((name) => existsSync(path.join(sourceRoot, name, "app-service.js")))
  .slice(0, limit);

const stats = {
  files: 0,
  modules: 0,
  withDefaultExport: 0,
  namedOnly: 0,
  dynamicOnly: 0,
  empty: 0,
  bundleRefFindings: 0,
  refOnDefaultExportModule: 0,
  refOnNamedOnlyModule: 0,
  refOnDynamicModule: 0,
  refOnEmptyModule: 0,
  refOnMissingModule: 0,
};

for (const project of projects) {
  const filePath = path.join(sourceRoot, project, "app-service.js");
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  let ast;
  try {
    ast = parseJavaScript(source, {
      ecmaVersion: "latest",
      sourceType: "script",
      range: true,
    });
  } catch {
    continue;
  }
  stats.files += 1;
  const { modules } = buildBundleModuleTable(ast);
  const shapes = new Map();
  for (const [key, entry] of modules.entries()) {
    const exported = extractModuleExports(entry.factoryNode);
    stats.modules += 1;
    let shape;
    if (exported.dynamic && exported.named.size === 0 && !exported.defaultExport) {
      stats.dynamicOnly += 1;
      shape = "dynamic";
    } else if (exported.defaultExport) {
      stats.withDefaultExport += 1;
      shape = "default";
    } else if (exported.named.size > 0) {
      stats.namedOnly += 1;
      shape = "named";
    } else {
      stats.empty += 1;
      shape = "empty";
    }
    shapes.set(key, shape);
  }

  const analysis = analyzeSource({ source, filePath });
  for (const finding of analysis.findings) {
    const origin = finding.bindingRef.bindingOrigin ?? "";
    if (!origin.startsWith("bundle:")) continue;
    stats.bundleRefFindings += 1;
    const modulePath = origin.slice("bundle:".length);
    const shape = shapes.get(modulePath);
    if (shape === "default") stats.refOnDefaultExportModule += 1;
    else if (shape === "named") stats.refOnNamedOnlyModule += 1;
    else if (shape === "dynamic") stats.refOnDynamicModule += 1;
    else if (shape === "empty") stats.refOnEmptyModule += 1;
    else stats.refOnMissingModule += 1;
  }
}

const pct = (value, total) =>
  total === 0 ? "—" : `${((value / total) * 100).toFixed(1)}%`;

console.log(`分析文件：${stats.files}`);
console.log(`模块总数：${stats.modules}`);
console.log(
  `  有 defaultExport：${stats.withDefaultExport}（${pct(stats.withDefaultExport, stats.modules)}）`,
);
console.log(
  `  仅命名导出：${stats.namedOnly}（${pct(stats.namedOnly, stats.modules)}）`,
);
console.log(
  `  仅动态导出：${stats.dynamicOnly}（${pct(stats.dynamicOnly, stats.modules)}）`,
);
console.log(`  无导出：${stats.empty}（${pct(stats.empty, stats.modules)}）`);
console.log("");
console.log(`模块变量被直接使用的 finding：${stats.bundleRefFindings}`);
console.log(
  `  落在有 defaultExport 的模块：${stats.refOnDefaultExportModule}（${pct(stats.refOnDefaultExportModule, stats.bundleRefFindings)}）`,
);
console.log(
  `  落在仅命名导出的模块：${stats.refOnNamedOnlyModule}（${pct(stats.refOnNamedOnlyModule, stats.bundleRefFindings)}）`,
);
console.log(
  `  落在动态导出模块：${stats.refOnDynamicModule}（${pct(stats.refOnDynamicModule, stats.bundleRefFindings)}）`,
);
console.log(
  `  落在无导出模块：${stats.refOnEmptyModule}（${pct(stats.refOnEmptyModule, stats.bundleRefFindings)}）`,
);
console.log(
  `  找不到模块：${stats.refOnMissingModule}（${pct(stats.refOnMissingModule, stats.bundleRefFindings)}）`,
);
