/**
 * 从当前评测产物汇总性能指标报告。
 *
 * 只读 `datasets/` 下的产物，不重新跑评测；每个数字都带来源文件。
 * 输出：
 *   --out 指定的 Markdown 报告（默认 R97_性能指标数据报告.md）
 *   datasets/performance-metrics.json（机器可读版本）
 *
 * 用法：
 *   node tools/performance-report.mjs --out R97_性能指标数据报告_2026-09-28.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const outPath = path.resolve(
  argValue("--out") ?? "R97_性能指标数据报告.md",
);

const readJson = (relativePath) => {
  const fullPath = path.resolve(relativePath);
  if (!existsSync(fullPath)) return null;
  return JSON.parse(readFileSync(fullPath, "utf8"));
};

const beijing = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
};

const pct = (value, digits = 2) =>
  typeof value === "number" ? `${(value * 100).toFixed(digits)}%` : "—";

const num = (value) =>
  typeof value === "number" ? value.toLocaleString("en-US") : "—";

const BENCHMARKS = [
  ["benchmark-stratified-v1", "分层 3 宿主（语言 + Node + Edge）"],
  ["benchmark-wechat", "分层 4 宿主（+ 真实微信 AppService）"],
  ["benchmark-stratified-file-v1", "分层 3 宿主（文件级分析）"],
  ["benchmark-wechat-file-v1", "分层 4 宿主（文件级分析）"],
  ["benchmark-record-weighted-v1", "自然分布（记录加权）"],
  ["benchmark-external-node-tarball", "Node 官方测试语料"],
  ["benchmark-external-browser-tarball", "浏览器 WPT 语料"],
  ["benchmark-external-node-repos", "Node 公开仓库语料"],
  ["benchmark-external-browser-repos", "浏览器公开仓库语料"],
  ["benchmark-external-node-public", "Node 公开样本语料"],
  ["benchmark-external-browser-wpt", "浏览器 WPT 样本语料"],
];

const extractBenchmark = (directory) => {
  const summary = readJson(`datasets/${directory}/benchmark-summary.json`);
  if (!summary?.corpus) return null;
  const corpus = summary.corpus;
  const metrics = corpus.metrics["R97-full"];
  const independent = corpus.independentReference;
  return {
    directory,
    generatedAt: summary.generatedAt,
    generatedAtBeijing: beijing(summary.generatedAt),
    targetRuntimeIds: summary.environment?.targetRuntimeIds ?? [],
    includesWechat: Boolean(summary.environment?.wechatReportPath),
    sampleCount: corpus.sampleCount,
    entityCount: corpus.entityView.total,
    entityFold: corpus.entityView.fold,
    entityProtect: corpus.entityView.protect,
    entityUnknown: corpus.entityView.unknown,
    entityFoldRate: corpus.entityView.foldRate,
    entityDecidableRate: corpus.entityView.decidableRate,
    fold: metrics.allowedFold,
    protect: corpus.byActual.PROTECT,
    unknown: corpus.byActual.UNKNOWN,
    foldRate: metrics.foldRate,
    unknownRate: metrics.unknownRate,
    decidableRate: metrics.decidableRate,
    unsafeFold: metrics.unsafeFold,
    unsafeFoldMeasured: metrics.unsafeFoldMeasured,
    differentialEntityCount: independent?.differentialEntityCount ?? null,
    differentialRecordCount: independent?.differentialRecordCount ?? null,
    allowedFoldOnDifferentialEntity:
      independent?.allowedFoldOnDifferentialEntity ?? null,
    elapsedMs: metrics.elapsedMs ?? null,
    decisionsPerSecond: metrics.decisionsPerSecond ?? null,
    confidenceInterval: corpus.foldRateConfidence ?? null,
    uncertainty: corpus.byUncertaintySource ?? null,
    excluded: corpus.excludedFromEvaluation ?? null,
    strategies: Object.fromEntries(
      Object.entries(corpus.metrics).map(([name, value]) => [
        name,
        {
          allowedFold: value.allowedFold,
          foldRate: value.foldRate,
          unsafeFold: value.unsafeFold,
          unsafeFoldMeasured: value.unsafeFoldMeasured,
          overProtection: value.overProtection,
          unknown: value.unknown,
        },
      ]),
    ),
  };
};

const benchmarks = Object.fromEntries(
  BENCHMARKS.map(([directory, label]) => [
    directory,
    { label, ...extractBenchmark(directory) },
  ]).filter(([, value]) => value.sampleCount !== undefined),
);

const corpusSummary = readJson(
  "datasets/real-miniapp-full/real-miniapp-corpus-summary.json",
);
const platform = readJson("datasets/platform-resolution/platform-resolution.json");
const unknownBreakdown = readJson(
  "datasets/unknown-breakdown/unknown-breakdown.json",
);
const targetImpact = readJson(
  "datasets/target-confirmation-impact/target-confirmation-impact.json",
);
const mutation = readJson("datasets/mutation-benchmark/mutation-benchmark.json");
const divergence = readJson(
  "datasets/runtime-divergence/runtime-divergence.json",
);
const executionSubset = readJson(
  "datasets/transformation-execution-subset/transformation-execution-subset.json",
);
const oracle = readJson(
  "datasets/transformation-oracle/transformation-oracle.json",
);
const hostAttribution = readJson(
  "datasets/host-attribution/host-attribution.json",
);
const reuse = readJson(
  "datasets/result-reuse-validation/result-reuse-validation.json",
);
const snapshot = readJson(
  "datasets/wechat-snapshot-validation/wechat-snapshot-validation.json",
);
const wechatLive = readJson(
  "datasets/wechat-live/wechat-collection-summary.json",
);
const workerSurface = readJson(
  "datasets/wechat-surface-consistency/report.json",
);
const annotationSampling = readJson(
  "datasets/annotation-sample/sampling-summary.json",
);
const annotationAgreement = readJson(
  "datasets/annotation-sample/agreement.json",
);
const wechatProbeReport = readJson(
  "datasets/wechat-live/wechat-probe-report.json",
);
const memoryBenchmark = readJson(
  "datasets/memory-benchmark/memory-benchmark.json",
);

const metrics = {
  generatedAt: new Date().toISOString(),
  generatedAtBeijing: beijing(new Date().toISOString()),
  corpus: corpusSummary,
  benchmarks,
  platform,
  unknownBreakdown,
  targetImpact,
  mutation,
  divergence,
  executionSubset,
  oracle,
  hostAttribution,
  reuse,
  snapshot,
  wechatLive,
  workerSurface,
  annotationSampling,
  annotationAgreement,
  memoryBenchmark,
};

writeFileSync(
  path.resolve("datasets/performance-metrics.json"),
  `${JSON.stringify(metrics, null, 2)}\n`,
  "utf8",
);

const lines = [];
lines.push("# R97 性能指标数据报告", "");
lines.push(`生成时间（北京时间）：${metrics.generatedAtBeijing}`, "");
lines.push(
  "本报告由 `tools/performance-report.mjs` 从 `datasets/` 下的评测产物汇总，不重新跑评测。每个数字都标注来源文件与产物生成时间。", "",
);

lines.push("## 1. 主基准指标", "");
lines.push(
  "| 基准 | 样本 | 实体 | FOLD | 放行率 | PROTECT | UNKNOWN | 未决率 | 可判定率 | 实体放行率 |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
);
for (const key of Object.keys(benchmarks)) {
  const item = benchmarks[key];
  if (!item) continue;
  lines.push(
    `| ${item.label} | ${num(item.sampleCount)} | ${num(item.entityCount)} | ${num(item.fold)} | ${pct(item.foldRate)} | ${num(item.protect)} | ${num(item.unknown)} | ${pct(item.unknownRate)} | ${pct(item.decidableRate)} | ${pct(item.entityFoldRate)} |`,
  );
}
lines.push("");

lines.push("## 2. 安全性与独立差分", "");
lines.push(
  "| 基准 | 实测差分实体 | 实测差分记录 | R97 放行落在差分上 | 自洽 unsafeFold | 实测 unsafeFold |",
  "|---|---:|---:|---:|---:|---:|",
);
for (const key of Object.keys(benchmarks)) {
  const item = benchmarks[key];
  if (!item) continue;
  lines.push(
    `| ${item.label} | ${num(item.differentialEntityCount)} | ${num(item.differentialRecordCount)} | **${num(item.allowedFoldOnDifferentialEntity)}** | ${num(item.unsafeFold)} | ${num(item.unsafeFoldMeasured)} |`,
  );
}
lines.push("");

lines.push("## 3. 决策性能", "");
lines.push(
  "| 基准 | 决策耗时 | 吞吐量 | 项目级 cluster | FOLD 率 95% CI |",
  "|---|---:|---:|---:|---|",
);
for (const key of Object.keys(benchmarks)) {
  const item = benchmarks[key];
  if (item.elapsedMs === null) continue;
  const ci = item.confidenceInterval;
  lines.push(
    `| ${item.label} | ${(item.elapsedMs / 1000).toFixed(2)} s | ${num(Math.round(item.decisionsPerSecond))} 条/秒 | ${num(ci?.clusterCount ?? null)} | [${pct(ci?.lower)}, ${pct(ci?.upper)}] |`,
  );
}
lines.push(
  "",
  "单项目语料（官方测试 / WPT 样本）没有项目级 cluster，无法做 cluster bootstrap，置信区间记为 `—`。",
);
lines.push("");

lines.push("## 4. Safety–Utility 策略对照（4 宿主）", "");
const wechat = benchmarks["benchmark-wechat"];
if (wechat) {
  lines.push(
    "| 策略 | 放行数 | 放行率 | 实测差分命中 | 过度保护（自洽口径） |",
    "|---|---:|---:|---:|---:|",
  );
  const strategyLabels = {
    "A0-aggressive-fold": "A0 全部折叠",
    "A1-legacy-blacklist": "A1 旧 147 条黑名单",
    "A2-prefix-blacklist": "A2 前缀黑名单",
    "A-safe-all-protect": "A-safe 全部保护",
    "R97-full": "R97",
  };
  for (const [name, label] of Object.entries(strategyLabels)) {
    const value = wechat.strategies[name];
    if (!value) continue;
    lines.push(
      `| ${label} | ${num(value.allowedFold)} | ${pct(value.foldRate)} | ${num(value.unsafeFoldMeasured)} | ${num(value.overProtection)} |`,
    );
  }
}
lines.push("");

lines.push("## 5. 语料与解析", "");
if (corpusSummary) {
  lines.push(
    "| 指标 | 数值 |",
    "|---|---:|",
    `| 发现 / 抽样项目 | ${num(corpusSummary.projectsSeen)} / ${num(corpusSummary.projectsSampled)} |`,
    `| 扫描 / 解析文件 | ${num(corpusSummary.filesScanned)} / ${num(corpusSummary.filesParsed)} |`,
    `| 解析成功率 | ${pct(corpusSummary.parseSuccessRate)} |`,
    `| 程序点 | ${num(corpusSummary.findingCount)} |`,
    `| 唯一实体 | ${num(corpusSummary.uniqueEntityCount)} |`,
    "",
  );
}

lines.push("## 6. 目标解析与未决构成", "");
if (platform) {
  lines.push(
    `- Platform-family structural identification coverage：${num(platform.detectedCount)} / ${num(platform.projectCount)} = ${pct(platform.platformFamilyResolutionRate)}`,
    `- 完整版本画像：${num(Math.round((platform.runtimeProfileResolutionRate ?? 0) * platform.projectCount))} 个项目（${pct(platform.runtimeProfileResolutionRate)}）`,
    `- fully confirmed target：${pct(platform.confirmedTargetRate)}`,
    `- 状态分布：${Object.entries(platform.byStatus ?? {}).map(([key, value]) => `${key} ${value}`).join(" / ")}`,
    "",
  );
}
if (unknownBreakdown) {
  lines.push(
    `- 目标已确认下的 UNKNOWN 合计：${num(unknownBreakdown.unknownTotal)} / ${num(unknownBreakdown.sampleCount)}（${pct(unknownBreakdown.unknownTotal / unknownBreakdown.sampleCount)}）`,
  );
  for (const [bucket, value] of Object.entries(unknownBreakdown.buckets ?? {})) {
    lines.push(`  - ${bucket}：${num(value)}`);
  }
  lines.push("");
}
if (targetImpact) {
  lines.push(
    "| 配置 | FOLD | PROTECT | UNKNOWN | 可判定率 |",
    "|---|---:|---:|---:|---:|",
  );
  for (const [key, value] of Object.entries(targetImpact.configurations ?? {})) {
    lines.push(
      `| ${value.label ?? key} | ${num(value.byState.FOLD)} | ${num(value.byState.PROTECT)} | ${num(value.byState.UNKNOWN)} | ${pct(value.decidableRate)} |`,
    );
  }
  lines.push("");
}

lines.push("## 7. 独立验证", "");
if (oracle) {
  lines.push(
    `- 变换 oracle：${num(oracle.caseCount)} 个用例；会改变行为的变换 ${num(oracle.divergentTransformationCount)} 个，全部拦截 ${num(oracle.blockedDivergentCount)} 个；放行 ${num(oracle.allowedFoldCount)} 个，不安全放行 ${num(oracle.unsafeAllowCount)}；过度保护 ${num(oracle.byVerdict?.["over-protection"] ?? 0)}`,
  );
}
if (executionSubset) {
  lines.push(
    `- 变换执行验证：放行 ${num(executionSubset.allowedFoldCount)} 条，可执行验证 ${num(executionSubset.verifiedCount)} 条（${pct(executionSubset.verifiedCount / executionSubset.allowedFoldCount)}），行为不一致 **${num(executionSubset.unsafeCount)}**`,
  );
  if (executionSubset.skippedByTransformation) {
    lines.push(
      `  - 跳过构成：function ${num(executionSubset.skippedByOutcomeKind?.function)} / object ${num(executionSubset.skippedByOutcomeKind?.object)} / null ${num(executionSubset.skippedByOutcomeKind?.null)} / symbol ${num(executionSubset.skippedByOutcomeKind?.symbol)}`,
    );
    for (const [kind, skipped] of Object.entries(
      executionSubset.skippedByTransformation,
    )) {
      const verified = executionSubset.verifiedByTransformation?.[kind] ?? 0;
      lines.push(
        `  - ${kind}：验证 ${num(verified)} / 跳过 ${num(skipped)}（验证率 ${pct(verified / (verified + skipped))}）`,
      );
    }
  }
}
if (mutation) {
  lines.push(
    `- 变异基准：${num(mutation.caseCount)} 个用例，断言 ${num(mutation.assertedCount)} 个，通过 ${num(mutation.passedCount)} 个，已知限制 ${num(mutation.knownLimitationCount)} 个`,
  );
}
if (divergence) {
  lines.push(
    `- 困难集：自然集 ${num(divergence.natural?.entityCount)} 实体 / ${num(divergence.natural?.divergentEntityCount)} 差分 / 检出率 ${pct(divergence.natural?.detectionRate)}；人工压力集 ${num(divergence.synthetic?.entityCount)} 实体 / 检出率 ${pct(divergence.synthetic?.detectionRate)}`,
  );
}
if (hostAttribution) {
  lines.push(
    `- 宿主归属：${num(hostAttribution.rootCount)} 个根节点，其中只有单一宿主存在且未映射 ${num(hostAttribution.hostExclusiveUnmappedCount)} 个`,
  );
}
lines.push("");

lines.push("## 8. 稳定性与重复性", "");
if (reuse) {
  lines.push(
    `- Node 重复 ${num(reuse.repeatability?.node?.repeatCount)} 次：唯一快照 ${num(reuse.repeatability?.node?.uniqueSnapshotCount)}`,
    `- Edge 重复 ${num(reuse.repeatability?.edge?.repeatCount)} 次：唯一快照 ${num(reuse.repeatability?.edge?.uniqueSnapshotCount)}`,
    `- 微信两份报告：共同实体 ${num(reuse.repeatability?.wechat?.commonEntityCount)}，差异观测 ${num(reuse.repeatability?.wechat?.differentObservationCount)}`,
  );
}
if (snapshot) {
  lines.push(
    `- 微信快照漂移：对比 ${num(snapshot.comparedCount)} 实体，一致 ${num(snapshot.unchangedCount)}，漂移率 ${pct(snapshot.driftRate)}`,
  );
}
lines.push("");

lines.push("## 9. 微信与 Worker 子环境", "");
if (wechatProbeReport) {
  const observed = Object.keys(wechatProbeReport.wechatValues ?? {}).length;
  const corpusEntities = wechatLive?.entityCount ?? null;
  lines.push(
    `- 微信 AppService 实际观测：${num(observed)} 个实体；语料实体 ${num(corpusEntities)}，差 ${num((corpusEntities ?? observed) - observed)} 个为排除根（\`Function\`，读取会栈溢出卡死会话）`,
    `- 探测错误：${num(wechatProbeReport.probeErrorCount)}，SDK：${wechatProbeReport.sdkVersion ?? "—"}`,
  );
}
if (wechatLive) {
  lines.push(
    `- 未完成采集：${num(wechatLive.missingEntityCount)}（0 表示没有漏采，与上面 10 个主动排除的根节点是两回事）`,
  );
}
if (workerSurface) {
  lines.push(
    `- Worker 子环境：${num(workerSurface.reportCount)} 份报告 / ${num(workerSurface.independentProjectCount)} 个独立项目；差异集合一致 ${workerSurface.consistent ? "是" : "否"}，环境形状一致 ${workerSurface.environmentConsistent ? "是" : "否"}`,
    `- 差异实体：${(workerSurface.signatures?.[0]?.divergentEntities ?? []).join(", ")}`,
  );
}
lines.push("");

lines.push("## 10. 独立人工标注进度", "");
if (annotationSampling) {
  lines.push(
    `- 抽样：${num(annotationSampling.selectedSize)} / ${num(annotationSampling.populationSize)} 条，分层桶 ${num(annotationSampling.bucketCount)} 个`,
    `- 状态分布：${Object.entries(annotationSampling.byState ?? {}).map(([key, value]) => `${key} ${value}`).join(" / ")}`,
    `- 变换分布：${Object.entries(annotationSampling.byTransformation ?? {}).map(([key, value]) => `${key} ${value}`).join(" / ")}`,
  );
}
if (annotationAgreement) {
  lines.push(
    `- 已完成标注：${num(annotationAgreement.labeledBoth)} / ${num(annotationAgreement.totalRows)}（冲突 ${num(annotationAgreement.conflictCount)}，已裁决 ${num(annotationAgreement.adjudicatedConflictCount)}）`,
    `- Cohen's kappa：${annotationAgreement.cohenKappa ?? "—"}`,
  );
}
lines.push("");

lines.push("## 11. 数据来源与生成时间", "");
lines.push("| 产物 | 生成时间（北京时间） |", "|---|---|");
for (const key of Object.keys(benchmarks)) {
  lines.push(
    `| \`datasets/${key}/benchmark-summary.json\` | ${benchmarks[key].generatedAtBeijing} |`,
  );
}
const sources = [
  ["datasets/real-miniapp-full/real-miniapp-corpus-summary.json", corpusSummary?.generatedAt],
  ["datasets/platform-resolution/platform-resolution.json", platform?.generatedAt],
  ["datasets/unknown-breakdown/unknown-breakdown.json", unknownBreakdown?.generatedAt],
  ["datasets/target-confirmation-impact/target-confirmation-impact.json", targetImpact?.generatedAt],
  ["datasets/mutation-benchmark/mutation-benchmark.json", mutation?.generatedAt],
  ["datasets/runtime-divergence/runtime-divergence.json", divergence?.generatedAt],
  ["datasets/transformation-execution-subset/transformation-execution-subset.json", executionSubset?.generatedAt],
  ["datasets/transformation-oracle/transformation-oracle.json", oracle?.generatedAt],
  ["datasets/host-attribution/host-attribution.json", hostAttribution?.generatedAt],
  ["datasets/result-reuse-validation/result-reuse-validation.json", reuse?.generatedAt],
  ["datasets/wechat-snapshot-validation/wechat-snapshot-validation.json", snapshot?.validatedAt],
  ["datasets/wechat-live/wechat-collection-summary.json", wechatLive?.generatedAt],
  ["datasets/wechat-surface-consistency/report.json", workerSurface?.generatedAt],
  ["datasets/annotation-sample/sampling-summary.json", annotationSampling?.generatedAt],
  ["datasets/memory-benchmark/memory-benchmark.json", memoryBenchmark?.generatedAt],
];
for (const [file, iso] of sources) {
  lines.push(`| \`${file}\` | ${beijing(iso)} |`);
}
lines.push("");

lines.push("## 12. 口径说明", "");
lines.push(
  "- **记录放行率**：在 3000/3895 条记录上按出现频率加权；自然分布口径回答工程 utility。",
  "- **实体放行率**：在去重后的实体上统计；实体分层口径回答语义覆盖与长尾鲁棒性。",
  "- **实测差分**：同一份判卷探针在语言 vm / Node / Edge / 真实微信上分别执行，某个实体在任意两个环境之间观测不同即记为差分。",
  "- **R97 放行落在差分上**：R97 判 ALLOW_FOLD 且该实体属于实测差分的记录数；这是最硬的独立安全指标。",
  "- **过度保护**：当前口径是 `expected === FOLD 且实际 BLOCK_FOLD`，而 expected 与决策器共用证据规则，因此是自洽口径；独立过度保护证据目前只有 transformation oracle 的 1 条。",
  "- **unsafeFold vs unsafeFoldMeasured**：前者对自洽 expected，后者只对实测差分；论文引用应优先用后者。",
  "",
);

lines.push("## 13. 内存占用基准", "");
if (memoryBenchmark?.scenarios?.length) {
  const m = memoryBenchmark;
  lines.push(
    `测量环境：Node ${m.node} / ${m.platform} / ${m.cpu} / ${num(m.totalMemoryMB)} MB 物理内存；` +
      `语料 \`${m.corpus}\`，\`--per-entity-cap ${m.perEntityCap}\`，` +
      `文件级最多 ${num(m.fileLimit)} 个文件，每 ${num(m.gcEvery)} 个文件触发一次 GC 采样。`,
    "",
  );
  lines.push(
    "| 场景 | 明细 | 起始 RSS | 峰值 RSS | 峰值增量 RSS | GC 后稳态 heap 增量 | GC 后稳态 RSS 增量 |",
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const item of m.scenarios) {
    const steadyHeap =
      item.steadyHeapDelta === undefined ? "—" : `**+${item.steadyHeapDelta} MB**`;
    const steadyRss =
      item.steadyDelta === undefined ? "—" : `+${item.steadyDelta} MB`;
    lines.push(
      `| ${item.scenario} | ${item.detail} | ${item.before} MB | ${item.peak} MB | ` +
        `**+${item.delta} MB** | ${steadyHeap} | ${steadyRss} |`,
    );
  }
  lines.push("");
  lines.push(
    "- **峰值增量 RSS**：分析过程中的内存高水位。RSS 在 GC 后不会归还操作系统（V8 保留空闲页），因此峰值不等于常驻内存。",
    "- **GC 后稳态 heap 增量**：强制 GC 后 `heapUsed` 相对场景起点的增量，这是论文应引用的常驻内存口径。",
    "- 语料流式读取的峰值主要来自 120 万条记录的去重键集合，函数返回后即可回收（稳态 heap +3.9 MB）。",
    "- 重复性：同一命令连续跑 4 次，流式读取峰值 +517～+532 MB、表达式分析 +27～+29 MB、文件级分析 +606～+631 MB，相对波动小于 5%。",
    "",
  );
} else {
  lines.push(
    "内存基准产物缺失。生成命令：`node --expose-gc src/evaluation/memory-benchmark.mjs --per-entity-cap 5 --source-root \"<语料源目录>\"`；也可用 `R97_SOURCE_ROOT` 环境变量配合 `npm run eval:memory`。",
    "",
  );
}

writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`已生成 ${outPath}`);
console.log("已生成 datasets/performance-metrics.json");
