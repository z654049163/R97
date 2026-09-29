/**
 * 迭代 4 诊断：细分「导出溯源返回 unknown」的原因。
 *
 * analyzeSource 开 collectProvenanceDiagnostics 后，每次 resolveBundleExport
 * 没解析出来都会记录 { modulePath, exportName, reason }。这个脚本统计原因分布。
 *
 * 用法：node tools/diagnose-unknown-reasons.mjs --limit 30
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
const limit = Number.parseInt(argValue("--limit") ?? "30", 10);

const projects = readdirSync(sourceRoot)
  .filter((name) => existsSync(path.join(sourceRoot, name, "app-service.js")))
  .slice(0, limit);

const byCategory = {};
const byDetail = {};
const byExportName = {};
let total = 0;
let files = 0;

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
    result = analyzeSource({
      source,
      filePath,
      collectProvenanceDiagnostics: true,
    });
  } catch {
    continue;
  }
  files += 1;
  for (const diagnostic of result.provenanceDiagnostics ?? []) {
    total += 1;
    const category = String(diagnostic.reason).split(":")[0];
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    byDetail[diagnostic.reason] = (byDetail[diagnostic.reason] ?? 0) + 1;
    const key = `${diagnostic.modulePath}.${diagnostic.exportName}`;
    byExportName[key] = (byExportName[key] ?? 0) + 1;
  }
}

const pct = (value) =>
  total === 0 ? "—" : `${((value / total) * 100).toFixed(1)}%`;

console.log(`分析文件：${files}`);
console.log(`未解析的导出溯源：${total}`);
console.log("");
console.log("按原因分类：");
for (const [category, count] of Object.entries(byCategory).sort(
  (left, right) => right[1] - left[1],
)) {
  console.log(`  ${category}: ${count}（${pct(count)}）`);
}
console.log("");
console.log("具体原因（前 15）：");
for (const [reason, count] of Object.entries(byDetail)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 15)) {
  console.log(`  ${reason}: ${count}`);
}
console.log("");
console.log("出现最多的导出（前 12）：");
for (const [name, count] of Object.entries(byExportName)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 12)) {
  console.log(`  ${name}: ${count}`);
}
