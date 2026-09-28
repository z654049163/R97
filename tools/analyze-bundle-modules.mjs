/**
 * 实测微信 app-service.js 的模块表自洽率。
 *
 * 背景：R97 语料里每个小程序项目只有一个 app-service.js，它是 wcc 编译后的
 * bundle，用微信自己的 AMD 风格模块系统：
 *
 *   define("pages/index/index.js", function (require, module, exports, ...) { ... })
 *   require("pages/index/index.js")
 *
 * 如果 require 的路径能在同文件的 define 表里找到，说明这是「bundle 内部模块
 * 引用」，可以解析；找不到的是真正的外部依赖（npm 包、wx-server-sdk 之类）。
 * 这个比例决定「解析模块表」这条路的收益上限。
 *
 * 用法：
 *   node tools/analyze-bundle-modules.mjs --limit 100
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const sourceRoot = path.resolve(
  argValue("--source") ??
    "E:\\复现\\sample_collector\\可用于实验的干净源码包",
);
const limit = Number.parseInt(argValue("--limit") ?? "100", 10);

const normalize = (value) =>
  value.replace(/\.js$/u, "");

const resolveRequest = (request, ownerPath) => {
  if (!request.startsWith(".")) {
    return normalize(request);
  }
  const baseDir = ownerPath ? path.posix.dirname(ownerPath) : "";
  return normalize(path.posix.normalize(path.posix.join(baseDir, request)));
};

const projects = readdirSync(sourceRoot)
  .filter((name) => {
    try {
      return existsSync(path.join(sourceRoot, name, "app-service.js"));
    } catch {
      return false;
    }
  })
  .slice(0, limit);

const summary = {
  projects: 0,
  defineCount: 0,
  requireCount: 0,
  resolved: 0,
  unresolved: 0,
  byKind: {
    relativeResolved: 0,
    relativeUnresolved: 0,
    bareResolved: 0,
    bareUnresolved: 0,
  },
  unresolvedExamples: {},
};

for (const project of projects) {
  const filePath = path.join(sourceRoot, project, "app-service.js");
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  summary.projects += 1;

  const defines = [
    ...source.matchAll(/define\s*\(\s*["']([^"']+)["']/gu),
  ].map((match) => ({ path: normalize(match[1]), index: match.index }));
  const defineSet = new Set(defines.map((entry) => entry.path));
  const requires = [
    ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']/gu),
  ].map((match) => ({ path: match[1], index: match.index }));

  summary.defineCount += defineSet.size;
  let ownerIndex = 0;
  for (const request of requires) {
    while (
      ownerIndex + 1 < defines.length &&
      defines[ownerIndex + 1].index < request.index
    ) {
      ownerIndex += 1;
    }
    const owner = defines[ownerIndex] ?? null;
    summary.requireCount += 1;
    const isRelative = request.path.startsWith(".");
    const resolved = resolveRequest(request.path, owner?.path ?? null);
    const hit = defineSet.has(resolved);
    if (hit) {
      summary.resolved += 1;
      summary.byKind[isRelative ? "relativeResolved" : "bareResolved"] += 1;
    } else {
      summary.unresolved += 1;
      summary.byKind[
        isRelative ? "relativeUnresolved" : "bareUnresolved"
      ] += 1;
      const key = `${request.path} (owner=${owner?.path ?? "?"} → ${resolved})`;
      if (!summary.unresolvedExamples[key]) {
        summary.unresolvedExamples[key] = 0;
      }
      summary.unresolvedExamples[key] += 1;
    }
  }
}

const total = summary.resolved + summary.unresolved;
console.log(`抽样项目：${summary.projects}`);
console.log(`define 去重模块：${summary.defineCount}`);
console.log(`require 调用点：${summary.requireCount}`);
console.log(
  `可解析（同文件 define 命中）：${summary.resolved} / ${total} = ${total === 0 ? "—" : ((summary.resolved / total) * 100).toFixed(2) + "%"}`,
);
console.log(`不可解析（真正外部依赖）：${summary.unresolved}`);
console.log("按路径类型：", JSON.stringify(summary.byKind));
console.log("");
console.log("未命中最多的模块名（前 20）：");
for (const [name, count] of Object.entries(summary.unresolvedExamples)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 20)) {
  console.log(`  ${name}: ${count}`);
}
