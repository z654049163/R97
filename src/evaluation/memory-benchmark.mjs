/**
 * 内存占用基准。
 *
 * 回答一个论文里会被问到的问题：R97 处理真实语料时需要多少内存？
 *
 * 三个场景：
 *   1. 语料流式读取 + 分层抽样（120 万行 jsonl）
 *   2. 表达式模式分析（记录重建出来的单条表达式）
 *   3. 文件级分析（原始 app-service.js，默认取前 100 个文件）
 *
 * 用 `--expose-gc` 跑可以让 `global.gc()` 生效，数字更接近真实驻留：
 *   node --expose-gc src/evaluation/memory-benchmark.mjs --source-root "<语料目录>"
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzeSource } from "../analyzer.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import {
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "./run-benchmark.mjs";

const args = process.argv.slice(2);
const argValue = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};

const corpusPath = path.resolve(
  argValue("--corpus", "datasets/real-miniapp-full/real-miniapp-candidates.jsonl"),
);
const perEntityCap = Number.parseInt(argValue("--per-entity-cap", "5"), 10);
const sourceRoot = argValue("--source-root", process.env.R97_SOURCE_ROOT ?? null);
const fileLimit = Number.parseInt(argValue("--file-limit", "100"), 10);
const gcEvery = Number.parseInt(argValue("--gc-every", "25"), 10);
const outDir = path.resolve(argValue("--out", "datasets/memory-benchmark"));

const MB = 1024 * 1024;
const sample = () => {
  const m = process.memoryUsage();
  return {
    rss: +(m.rss / MB).toFixed(1),
    heap: +(m.heapUsed / MB).toFixed(1),
  };
};
const settle = () => {
  if (typeof global.gc === "function") global.gc();
  return sample();
};

const results = [];

console.log(`语料：${path.basename(path.dirname(corpusPath))}/${path.basename(corpusPath)}`);
console.log(`每实体上限：${perEntityCap}${sourceRoot ? `，文件级最多 ${fileLimit} 个文件` : ""}`);
console.log(`GC 可用：${typeof global.gc === "function" ? "是（--expose-gc）" : "否（数字偏保守）"}`);
console.log("");

// ---- 场景 1：语料流式读取 ----
const beforeRead = settle();
const records = await readDeduplicatedCorpusRecords(corpusPath, null, {
  perEntityCap,
});
const afterRead = sample();
const readSettled = settle();
results.push({
  scenario: "语料流式读取 + 分层抽样",
  detail: `${records.length} 条样本 / ${new Set(records.map((r) => r.file)).size} 个文件`,
  before: beforeRead.rss,
  peak: afterRead.rss,
  delta: +(afterRead.rss - beforeRead.rss).toFixed(1),
  steadyDelta: +(readSettled.rss - beforeRead.rss).toFixed(1),
  steadyHeapDelta: +(readSettled.heap - beforeRead.heap).toFixed(1),
});

// ---- 场景 2：表达式模式分析 ----
const mapped = records
  .map((record) => ({ ...record, generatedSource: sourceForRecord(record) }))
  .filter((record) => record.generatedSource !== null);
const beforeExpression = settle();
let expressionPeak = beforeExpression.rss;
for (let index = 0; index < mapped.length; index += 1) {
  analyzeAndDecide({
    source: mapped[index].generatedSource,
    filePath: mapped[index].file,
    targetRuntimeIds: [],
    targetRuntimeSource: "unknown",
  });
  if ((index + 1) % 500 === 0) {
    const current = sample();
    if (current.rss > expressionPeak) expressionPeak = current.rss;
  }
}
const afterExpression = sample();
const expressionSettled = settle();
results.push({
  scenario: "表达式模式分析",
  detail: `${mapped.length} 条记录`,
  before: beforeExpression.rss,
  peak: Math.max(expressionPeak, afterExpression.rss),
  delta: +(Math.max(expressionPeak, afterExpression.rss) - beforeExpression.rss).toFixed(1),
  steadyDelta: +(expressionSettled.rss - beforeExpression.rss).toFixed(1),
  steadyHeapDelta: +(expressionSettled.heap - beforeExpression.heap).toFixed(1),
});

// ---- 场景 3：文件级分析 ----
if (sourceRoot) {
  const files = [...new Set(records.map((record) => record.file))].slice(0, fileLimit);
  const beforeFile = settle();
  let filePeak = beforeFile.rss;
  let fileSteady = beforeFile.rss;
  let fileSteadyHeap = beforeFile.heap;
  let analyzed = 0;
  for (const file of files) {
    let source;
    try {
      source = readFileSync(path.join(sourceRoot, file), "utf8");
    } catch {
      continue;
    }
    const sourceMB = source.length / MB;
    analyzeSource({ source, filePath: file });
    analyzed += 1;
    const current = sample();
    if (current.rss > filePeak) filePeak = current.rss;
    if (gcEvery > 0 && analyzed % gcEvery === 0) {
      const settled = settle();
      if (settled.rss > fileSteady) fileSteady = settled.rss;
      if (settled.heap > fileSteadyHeap) fileSteadyHeap = settled.heap;
    }
    if (analyzed === 1) {
      console.log(`  首个文件 ${file}（${sourceMB.toFixed(2)} MB 源码）`);
    }
  }
  results.push({
    scenario: "文件级分析（原始 app-service.js）",
    detail: `${analyzed} 个文件`,
    before: beforeFile.rss,
    peak: filePeak,
    delta: +(filePeak - beforeFile.rss).toFixed(1),
    steady: fileSteady,
    steadyDelta: +(fileSteady - beforeFile.rss).toFixed(1),
    steadyHeapDelta: +(fileSteadyHeap - beforeFile.heap).toFixed(1),
  });
}

console.log("| 场景 | 明细 | 起始 RSS | 峰值 RSS | 峰值增量 | 周期 GC 后稳态 heap / RSS 增量 |");
console.log("|---|---|---:|---:|---:|---:|");
for (const item of results) {
  const steady =
    item.steadyDelta === undefined
      ? "—"
      : `**+${item.steadyHeapDelta} MB** heap / +${item.steadyDelta} MB RSS`;
  console.log(
    `| ${item.scenario} | ${item.detail} | ${item.before} MB | ${item.peak} MB | **+${item.delta} MB** | ${steady} |`,
  );
}

if (global.gc) global.gc();
console.log("");
console.log(`结束时 RSS：${sample().rss} MB`);

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  totalMemoryMB: +(os.totalmem() / MB).toFixed(0),
  corpus: path.relative(process.cwd(), corpusPath).split(path.sep).join("/"),
  perEntityCap,
  fileLimit: sourceRoot ? fileLimit : null,
  gcEvery: sourceRoot ? gcEvery : null,
  sourceRootProvided: Boolean(sourceRoot),
  finalRss: sample().rss,
  scenarios: results,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "memory-benchmark.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(`已生成 ${path.join(outDir, "memory-benchmark.json")}`);
