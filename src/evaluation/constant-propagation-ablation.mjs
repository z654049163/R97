import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { analyzeSource } from "../analyzer.mjs";
import {
  KNOWLEDGE_STATE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { buildRuntimeEvidence } from "./run-benchmark.mjs";

export const runConstantPropagationAblation = async ({
  outputDir,
  corpusPath,
  wechatReportPath,
}) => {
  assertInputPath(corpusPath, "Corpus");
  assertInputPath(wechatReportPath, "WeChat probe report");

  const dynamicRecords = await readDynamicRecords(corpusPath);
  const recordsByFile = groupBySourceFile(dynamicRecords);
  const comparisons = [];
  const fileResults = [];

  for (const [sourcePath, records] of recordsByFile) {
    if (!existsSync(sourcePath)) {
      fileResults.push({
        sourcePath,
        status: "missing",
        recordCount: records.length,
      });
      continue;
    }
    const source = readFileSync(sourcePath, "utf8");
    const sourceHash = sha256(source);
    const expectedHashes = new Set(records.map((record) => record.sourceHash));
    if (
      expectedHashes.size !== 1 ||
      sourceHash !== records[0].sourceHash
    ) {
      fileResults.push({
        sourcePath,
        status: "source_hash_mismatch",
        recordCount: records.length,
      });
      continue;
    }

    const filePath = records[0].file;
    const policyVersion = "constant-propagation-ablation-v1";
    const targetRuntimeIds = [
      RUNTIME_IDS.NODE,
      RUNTIME_IDS.WECHAT,
    ];
    const base = analyzeAndDecide({
      source,
      filePath,
      targetRuntimeIds,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.NODE,
      policyVersion,
      contractVersion: "constant-propagation-ablation-v1",
    });
    const evidence = await buildRuntimeEvidence(
      base.decisions,
      targetRuntimeIds,
      policyVersion,
      wechatReportPath,
    );
    const improved = analyzeAndDecide({
      source,
      filePath,
      targetRuntimeIds,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.NODE,
      policyVersion,
      contractVersion: "constant-propagation-ablation-v1",
      evidenceRecords: evidence.records,
    });
    const baseDecisions = indexDecisions(base.decisions);
    const improvedDecisions = indexDecisions(improved.decisions);

    for (const record of records) {
      const key = programPointKey(record);
      const baseDecision = baseDecisions.get(key);
      const improvedDecision = improvedDecisions.get(key);
      comparisons.push({
        sampleId: record.sampleId,
        sourcePath,
        file: record.file,
        programPoint: record.programPoint,
        baselineState: KNOWLEDGE_STATE.UNKNOWN,
        baselineEntityId: record.entityId,
        resolved:
          improvedDecision?.bindingRef.resolutionStatus === "resolved" &&
          improvedDecision?.usageContext.dynamicPropertyAccess === false,
        improvedEntityId:
          improvedDecision?.runtimeEntity.entityId ?? record.entityId,
        improvedState:
          improvedDecision?.decision.knowledgeState ??
          KNOWLEDGE_STATE.UNKNOWN,
        reasonCodes:
          improvedDecision?.decision.reasonCodes ?? [],
      });
    }

    fileResults.push({
      sourcePath,
      status: "analyzed",
      recordCount: records.length,
      findingCount: improved.findingCount,
      evidenceRecordCount: evidence.records.length,
    });
  }

  const analyzed = comparisons.filter((item) => item.resolved !== undefined);
  const resolved = analyzed.filter((item) => item.resolved);
  const improvedUnknown = analyzed.filter(
    (item) => item.improvedState === KNOWLEDGE_STATE.UNKNOWN,
  );
  const unknownReduction = resolved.filter(
    (item) => item.improvedState !== KNOWLEDGE_STATE.UNKNOWN,
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    corpusPath,
    wechatReportPath,
    baseline: {
      dynamicRecordCount: dynamicRecords.length,
      sourceFileCount: recordsByFile.size,
      state: KNOWLEDGE_STATE.UNKNOWN,
    },
    analysis: {
      comparedRecordCount: comparisons.length,
      resolvedByConstantPropagation: resolved.length,
      unresolvedRecordCount: analyzed.length - resolved.length,
      resolvedRate: ratio(resolved.length, analyzed.length),
      resolutionIncreaseRate: ratio(
        resolved.length,
        dynamicRecords.length,
      ),
      unknownReduction: unknownReduction.length,
      unknownReductionRate: ratio(
        unknownReduction.length,
        dynamicRecords.length,
      ),
      improvedStateDistribution: countBy(
        analyzed,
        (item) => item.improvedState,
      ),
      resolvedEntityDistribution: countBy(
        resolved,
        (item) => item.improvedEntityId,
      ),
      resolvedExamples: resolved.slice(0, 30),
      remainingUnknownExamples: improvedUnknown.slice(0, 30),
    },
    files: fileResults,
    comparisons,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "constant-propagation-ablation.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "constant-propagation-ablation.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const readDynamicRecords = async (filePath) => {
  const records = [];
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      if (line.trim() === "") {
        continue;
      }
      const record = JSON.parse(line);
      if (record.usageContext?.dynamicPropertyAccess === true) {
        records.push(record);
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return records;
};

const groupBySourceFile = (records) => {
  const grouped = new Map();
  for (const record of records) {
    const sourcePath = path.resolve(record.sourceRoot, record.file);
    const group = grouped.get(sourcePath) ?? [];
    group.push(record);
    grouped.set(sourcePath, group);
  }
  return grouped;
};

const indexDecisions = (decisions) =>
  new Map(decisions.map((decision) => [decisionKey(decision), decision]));

const decisionKey = (decision) =>
  [
    decision.programPoint.start?.line ?? -1,
    decision.programPoint.start?.column ?? -1,
    decision.programPoint.end?.line ?? -1,
    decision.programPoint.end?.column ?? -1,
    decision.transformationKind,
    decision.programPoint.nodeType,
  ].join(":");

const programPointKey = (record) =>
  [
    record.programPoint.start?.line ?? -1,
    record.programPoint.start?.column ?? -1,
    record.programPoint.end?.line ?? -1,
    record.programPoint.end?.column ?? -1,
    record.transformationKind,
    record.programPoint.nodeType,
  ].join(":");

const countBy = (items, selectKey) => {
  const counts = {};
  for (const item of items) {
    const key = selectKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
};

const ratio = (numerator, denominator) =>
  denominator === 0 ? null : numerator / denominator;

const percent = (value) =>
  value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const assertInputPath = (filePath, label) => {
  if (!existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 有限常量传播真实消融",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    "## 实验口径",
    "",
    `改动前基线来自真实全量语料中的 ${summary.baseline.dynamicRecordCount} 个动态属性程序点，分布在 ${summary.baseline.sourceFileCount} 个源码文件中。`,
    "",
    "基线状态下，分析器不知道正在检查哪个 API，因此全部为 `UNKNOWN`。改进版只增加 `const` 字符串、数字、无插值模板、常量字符串拼接和常量别名传播；推导不出唯一结果时仍为动态访问。",
    "",
    "## 结果",
    "",
    "| 指标 | 数量 | 比例 |",
    "|---|---:|---:|",
    `| 原动态访问 | ${summary.baseline.dynamicRecordCount} | 100.00% |`,
    `| 推导为确定运行时 API | ${summary.analysis.resolvedByConstantPropagation} | ${percent(summary.analysis.resolutionIncreaseRate)} |`,
    `| 最终从 UNKNOWN 变为可判定状态 | ${summary.analysis.unknownReduction} | ${percent(summary.analysis.unknownReductionRate)} |`,
    `| 仍然 UNKNOWN | ${summary.analysis.comparedRecordCount - summary.analysis.unknownReduction} | ${percent(ratio(summary.analysis.comparedRecordCount - summary.analysis.unknownReduction, summary.analysis.comparedRecordCount))} |`,
    "",
    "## 最终状态分布",
    "",
    "| 状态 | 数量 |",
    "|---|---:|",
  ];

  for (const [state, count] of Object.entries(
    summary.analysis.improvedStateDistribution,
  )) {
    lines.push(`| ${state} | ${count} |`);
  }

  lines.push("", "## 推导出的实体", "");
  if (Object.keys(summary.analysis.resolvedEntityDistribution).length === 0) {
    lines.push("没有动态访问被常量传播解析为确定实体。");
  } else {
    lines.push("| 实体 | 次数 |", "|---|---:|");
    for (const [entityId, count] of Object.entries(
      summary.analysis.resolvedEntityDistribution,
    )) {
      lines.push(`| \`${entityId}\` | ${count} |`);
    }
  }

  lines.push(
    "",
    "## 结论",
    "",
    summary.analysis.resolvedByConstantPropagation === 0
      ? "真实语料中没有出现可被该规则安全恢复的动态属性访问，当前不应把它写成有效技术贡献。"
      : "该规则能够安全增加可检查的 API 范围，但真实语料中的占比应以本表为准；它适合作为实现层面的保守改进，不适合单独作为论文核心创新。",
    "",
    "这里的“可判定”只表示绑定解析层已经知道运行时实体，最终仍必须经过正常运行时证据和决策门；常量传播不会直接授予 `FOLD`。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parseConstantPropagationAblationArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/constant-propagation-ablation"),
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    wechatReportPath: path.resolve(
      "datasets/wechat-live/wechat-probe-report.json",
    ),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    switch (argument) {
      case "--out":
        options.outputDir = path.resolve(next);
        index += 1;
        break;
      case "--corpus":
        options.corpusPath = path.resolve(next);
        index += 1;
        break;
      case "--wechat-report":
        options.wechatReportPath = path.resolve(next);
        index += 1;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseConstantPropagationAblationArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/constant-propagation-ablation.mjs [options]",
        "",
        "Options:",
        "  --out <path>             Output directory",
        "  --corpus <path>          Real miniapp JSONL corpus",
        "  --wechat-report <path>   Real WeChat probe report",
      ].join("\n"),
    );
  } else {
    const summary = await runConstantPropagationAblation(options);
    console.log(
      JSON.stringify(
        {
          baseline: summary.baseline,
          analysis: {
            resolvedByConstantPropagation:
              summary.analysis.resolvedByConstantPropagation,
            resolutionIncreaseRate:
              summary.analysis.resolutionIncreaseRate,
            unknownReduction: summary.analysis.unknownReduction,
            improvedStateDistribution:
              summary.analysis.improvedStateDistribution,
          },
        },
        null,
        2,
      ),
    );
  }
}
