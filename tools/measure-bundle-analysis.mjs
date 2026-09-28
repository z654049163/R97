/**
 * 在**真实 app-service.js** 上验证 bundle 模块解析是否生效。
 *
 * 主基准分析的是语料记录重建出来的单条表达式，里面没有 define/require
 * 上下文，所以基准数字看不出这项改动的效果。这个脚本直接对原始文件跑
 * analyzeSource，统计新增解析覆盖了多少 finding。
 *
 * 用法：node tools/measure-bundle-analysis.mjs --limit 10
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { analyzeSource } from "../src/analyzer.mjs";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const sourceRoot = path.resolve(
  argValue("--source") ??
    "E:\\复现\\sample_collector\\可用于实验的干净源码包",
);
const limit = Number.parseInt(argValue("--limit") ?? "10", 10);

const projects = readdirSync(sourceRoot)
  .filter((name) => existsSync(path.join(sourceRoot, name, "app-service.js")))
  .slice(0, limit);

const stats = {
  files: 0,
  parseFailed: 0,
  findings: 0,
  byBindingKind: {},
  bundleModuleRefs: 0,
  bundleExportPure: 0,
  bundleExportHost: 0,
  hostRoots: {},
  examples: [],
};

const increment = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

for (const project of projects) {
  const filePath = path.join(sourceRoot, project, "app-service.js");
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  let result;
  try {
    result = analyzeSource({ source, filePath });
  } catch (error) {
    stats.parseFailed += 1;
    continue;
  }
  stats.files += 1;
  for (const finding of result.findings) {
    stats.findings += 1;
    increment(stats.byBindingKind, finding.bindingRef.bindingKind);
    const origin = finding.bindingRef.bindingOrigin ?? "";
    if (
      origin.startsWith("bundle-export:") ||
      origin.startsWith("bundle-default:")
    ) {
      stats.bundleExportPure += 1;
    } else if (origin.startsWith("bundle:")) {
      stats.bundleModuleRefs += 1;
    } else if (finding.bindingRef.bindingKind === "runtime_global") {
      const root = finding.runtimeEntity.entityId.split(".")[0];
      increment(stats.hostRoots, root);
      if (stats.examples.length < 10) {
        stats.examples.push({
          entityId: finding.runtimeEntity.entityId,
          origin,
          file: project,
        });
      }
    }
  }
}

console.log(`分析文件：${stats.files}（解析失败 ${stats.parseFailed}）`);
console.log(`finding 总数：${stats.findings}`);
console.log(`按 bindingKind：${JSON.stringify(stats.byBindingKind)}`);
console.log("");
console.log(`bundle 模块引用（require 命中模块表）：${stats.bundleModuleRefs}`);
console.log(`bundle 导出解析为纯语言：${stats.bundleExportPure}`);
console.log(`bundle 导出解析为宿主：${stats.bundleExportHost}`);
console.log("");
console.log(`runtime_global finding 的根分布（前 15）：`);
for (const [root, count] of Object.entries(stats.hostRoots)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 15)) {
  console.log(`  ${root}: ${count}`);
}
