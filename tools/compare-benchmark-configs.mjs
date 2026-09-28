/**
 * 比较两个基准的逐条决策结果，回答「换一套判卷/目标配置后，决策到底怎么变」。
 *
 * 典型用法：比较三宿主与四宿主（+真实微信）口径。
 *   node tools/compare-benchmark-configs.mjs --base datasets/benchmark-stratified-v1/benchmark-results.jsonl --target datasets/benchmark-wechat/benchmark-results.jsonl
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const basePath = path.resolve(
  argValue("--base") ?? "datasets/benchmark-stratified-v1/benchmark-results.jsonl",
);
const targetPath = path.resolve(
  argValue("--target") ?? "datasets/benchmark-wechat/benchmark-results.jsonl",
);

for (const filePath of [basePath, targetPath]) {
  if (!existsSync(filePath)) {
    console.error(`找不到逐条结果文件：${filePath}`);
    process.exit(1);
  }
}

const load = (filePath) =>
  readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

const baseRows = load(basePath);
const targetRows = load(targetPath);
const targetById = new Map(targetRows.map((row) => [row.sampleId, row]));

const transitions = {};
const changedByRoot = {};
let matched = 0;
let missing = 0;
for (const row of baseRows) {
  const other = targetById.get(row.sampleId);
  if (!other) {
    missing += 1;
    continue;
  }
  matched += 1;
  const transition = `${row.actualState} → ${other.actualState}`;
  transitions[transition] = (transitions[transition] ?? 0) + 1;
  if (row.actualState !== other.actualState) {
    const root = String(row.entityId).split(".")[0];
    changedByRoot[transition] = changedByRoot[transition] ?? {};
    changedByRoot[transition][root] =
      (changedByRoot[transition][root] ?? 0) + 1;
  }
}

console.log(`base   = ${path.relative(process.cwd(), basePath)}（${baseRows.length} 条）`);
console.log(`target = ${path.relative(process.cwd(), targetPath)}（${targetRows.length} 条）`);
console.log(`匹配 ${matched} 条，缺失 ${missing} 条`);
console.log("");
console.log("状态转移矩阵：");
for (const [transition, count] of Object.entries(transitions).sort(
  (left, right) => right[1] - left[1],
)) {
  console.log(`  ${transition}: ${count}`);
}
console.log("");
console.log("发生变化的记录按实体根聚合：");
for (const [transition, roots] of Object.entries(changedByRoot)) {
  console.log(`  ${transition}:`);
  for (const [root, count] of Object.entries(roots)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 15)) {
    console.log(`    ${root}: ${count}`);
  }
}
