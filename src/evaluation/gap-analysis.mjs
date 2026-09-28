import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BINDING_KIND,
  KNOWLEDGE_STATE,
  REASON_CODE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "./run-benchmark.mjs";

const TARGET_RUNTIME_IDS = Object.freeze([
  RUNTIME_IDS.LANGUAGE,
  RUNTIME_IDS.NODE,
]);

/**
 * 现有探针能够产出的语义维度。
 * 契约若要求此集合之外的维度，换运行时也没用，必须先补证据生产协议。
 */
const PROBE_OBSERVABLE_DIMENSIONS = new Set([
  "existence",
  "type",
  "callability",
]);

/**
 * 判定单个样本属于哪类缺口。抽成纯函数以便直接测试。
 *
 * bindingKind 来自语料记录自身（在真实源文件、保留作用域的前提下得出），
 * 而不是合成代码的复判结果。评测用一行合成代码重建实体，作用域已经丢失，
 * 模块导入的局部符号会被复判成未解析全局；不做这一步区分就会把
 * "v1 范围外的模块边界"误记成"绑定解析能力不足"。
 */
export const classifyGap = ({
  state,
  reasonCodes = [],
  requiredDimensions = [],
  bindingKind = null,
  requiredRuntimeIds = [],
}) => {
  if (state === KNOWLEDGE_STATE.FOLD) {
    return { bucket: "fold", unobservableDimensions: [] };
  }
  if (reasonCodes.includes(REASON_CODE.REQUIRED_RUNTIME_MISSING)) {
    return { bucket: "runtimeGap", unobservableDimensions: [] };
  }
  if (
    reasonCodes.includes(REASON_CODE.EVIDENCE_MISSING) &&
    requiredRuntimeIds.length > 0
  ) {
    // 候选目标已按 required 扩展，缺的是该宿主运行时的观测记录，
    // 补对应运行时的探针即可判定。
    return { bucket: "runtimeGap", unobservableDimensions: [] };
  }
  if (reasonCodes.includes(REASON_CODE.CONTRACT_MISMATCH)) {
    return { bucket: "contractMismatch", unobservableDimensions: [] };
  }
  if (reasonCodes.includes(REASON_CODE.CONTRACT_COVERAGE_MISSING)) {
    const unobservableDimensions = requiredDimensions.filter(
      (dimension) => !PROBE_OBSERVABLE_DIMENSIONS.has(dimension),
    );
    return {
      bucket:
        unobservableDimensions.length === 0 ? "runtimeGap" : "protocolGap",
      unobservableDimensions,
    };
  }
  if (reasonCodes.includes(REASON_CODE.BINDING_UNRESOLVED)) {
    return {
      bucket:
        bindingKind === BINDING_KIND.MODULE_IMPORT
          ? "moduleBoundary"
          : "unresolvedBinding",
      unobservableDimensions: [],
    };
  }
  return { bucket: "other", unobservableDimensions: [] };
};

/**
 * 把当前决策结果按「缺口原因」分桶，区分两类问题：
 * 一类靠增加真实运行时探针可以解决，另一类必须改进静态绑定分析。
 * 这个区分直接决定补微信探针到底能带来多少收益。
 */
export const runGapAnalysis = async ({
  outputDir,
  corpusPath,
  corpusLimit = 5000,
  perEntityCap = null,
  policyVersion = "benchmark-policy-v1",
}) => {
  if (!existsSync(corpusPath)) {
    throw new Error(`Corpus file does not exist: ${corpusPath}`);
  }

  const stratified = Number.isFinite(perEntityCap) && perEntityCap > 0;
  const rawRecords = await readDeduplicatedCorpusRecords(
    corpusPath,
    corpusLimit,
    { perEntityCap },
  );
  const records = rawRecords
    .slice(0, stratified ? rawRecords.length : corpusLimit)
    .map((record) => ({
      ...record,
      generatedSource: sourceForRecord(record),
    }))
    .filter((record) => record.generatedSource !== null);

  const argumentsFor = {
    targetRuntimeIds: TARGET_RUNTIME_IDS,
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    policyVersion,
    contractVersion: "benchmark-v1",
  };

  const plans = records.flatMap((record) =>
    analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      ...argumentsFor,
    }).decisions,
  );
  const evidence = await buildRuntimeEvidence(
    plans,
    TARGET_RUNTIME_IDS,
    policyVersion,
  );

  const buckets = {
    fold: [],
    contractMismatch: [],
    runtimeGap: [],
    protocolGap: [],
    unresolvedBinding: [],
    moduleBoundary: [],
    other: [],
  };

  for (const record of records) {
    const result = analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      ...argumentsFor,
      evidenceRecords: evidence.records,
    });
    const matched =
      result.decisions.find(
        (item) => item.runtimeEntity.entityId === record.entityId,
      ) ?? result.decisions[0];
    const state = matched?.decision.knowledgeState ?? KNOWLEDGE_STATE.UNKNOWN;
    const reasons = matched?.decision.reasonCodes ?? [];
    const requiredDimensions =
      matched?.semanticContract.requiredDimensions ?? [];
    const requiredRuntimeIds =
      matched?.semanticContract.validityScope?.requiredRuntimeIds ?? [];
    const entry = {
      entityId: record.entityId,
      project: record.project,
      state,
      reasonCodes: reasons,
      requiredDimensions,
      requiredRuntimeIds,
    };

    const classified = classifyGap({
      state,
      reasonCodes: reasons,
      requiredDimensions,
      bindingKind: record.bindingKind,
      requiredRuntimeIds,
    });
    entry.unobservableDimensions = classified.unobservableDimensions;
    buckets[classified.bucket].push(entry);
  }

  const protocolDimensionCounts = countDimensions(
    buckets.protocolGap.flatMap((item) => item.unobservableDimensions),
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    corpusPath,
    sampleCount: records.length,
    stateCounts: countBy(records.length, buckets),
    wechatProbeValue: {
      resolvedByRuntimeProbe: buckets.runtimeGap.length,
      blockedByMissingProtocol: buckets.protocolGap.length,
      validatesExistingFolds: buckets.fold.length,
      unaffectedByRuntimeProbe: buckets.unresolvedBinding.length,
      outsideV1Scope: buckets.moduleBoundary.length,
    },
    topUnresolvedRoots: topRoots(
      buckets.unresolvedBinding.map((item) => item.entityId),
    ),
    topModuleBoundaryRoots: topRoots(
      buckets.moduleBoundary.map((item) => item.entityId),
    ),
    topCoverageEntities: topEntities(
      [...buckets.runtimeGap, ...buckets.protocolGap].map(
        (item) => item.entityId,
      ),
    ),
    protocolDimensionCounts,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "gap-analysis.json"),
    `${JSON.stringify({ ...summary, buckets }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "gap-analysis.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const countBy = (total, buckets) => ({
  total,
  fold: buckets.fold.length,
  contractMismatch: buckets.contractMismatch.length,
  runtimeGap: buckets.runtimeGap.length,
  protocolGap: buckets.protocolGap.length,
  unresolvedBinding: buckets.unresolvedBinding.length,
  moduleBoundary: buckets.moduleBoundary.length,
  other: buckets.other.length,
});

const countDimensions = (dimensions) => {
  const counts = {};
  for (const dimension of dimensions) {
    counts[dimension] = (counts[dimension] ?? 0) + 1;
  }
  return counts;
};

const topRoots = (entityIds) => {
  const counts = new Map();
  for (const entityId of entityIds) {
    const root = entityId.split(".")[0];
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 15)
    .map(([root, count]) => ({ root, count }));
};

const topEntities = (entityIds) => {
  const counts = new Map();
  for (const entityId of entityIds) {
    counts.set(entityId, (counts.get(entityId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([entityId, count]) => ({ entityId, count }));
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 决策缺口分析",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `评测样本：${summary.sampleCount}`,
    "",
    "## 决策分桶",
    "",
    "| 分桶 | 数量 | 含义 |",
    "|---|---:|---|",
    `| 安全折叠 | ${summary.stateCounts.fold} | 证据完整且跨运行时一致 |`,
    `| 契约不匹配 | ${summary.stateCounts.contractMismatch} | 观测到真实差异，已保护 |`,
    `| 运行时覆盖缺口 | ${summary.stateCounts.runtimeGap} | 缺的维度现有探针能观测，换更强运行时即可补 |`,
    `| 证据协议缺口 | ${summary.stateCounts.protocolGap} | 缺的维度现有探针不产出，换运行时也没用 |`,
    `| 绑定未解析 | ${summary.stateCounts.unresolvedBinding} | 文件内确实没有绑定的全局名，探针无法解决 |`,
    `| 模块边界 | ${summary.stateCounts.moduleBoundary} | 已正确解析为模块导入；跨模块依赖解析在技术路线 §9 的冻结清单里 |`,
    `| 其他 | ${summary.stateCounts.other} | 其余原因 |`,
    "",
    "## 补微信探针能带来什么",
    "",
    "| 作用 | 样本数 |",
    "|---|---:|",
    `| 验证已放行的折叠是否在真实微信上成立 | ${summary.wechatProbeValue.validatesExistingFolds} |`,
    `| 补齐可见维度后升级为可判定 | ${summary.wechatProbeValue.resolvedByRuntimeProbe} |`,
    `| 仍被证据协议缺口挡住，需先补维度生产器 | ${summary.wechatProbeValue.blockedByMissingProtocol} |`,
    `| 不受运行时探针影响，需要改进静态绑定 | ${summary.wechatProbeValue.unaffectedByRuntimeProbe} |`,
    `| 跨模块依赖解析（§9 冻结） | ${summary.wechatProbeValue.outsideV1Scope} |`,
    "",
    "## 证据协议缺口涉及的维度",
    "",
    "| 维度 | 样本数 |",
    "|---|---:|",
    ...Object.entries(summary.protocolDimensionCounts)
      .sort((left, right) => right[1] - left[1])
      .map(([dimension, count]) => `| ${dimension} | ${count} |`),
    "",
    "## 绑定未解析的主要根符号",
    "",
    "| 根符号 | 样本数 |",
    "|---|---:|",
    ...summary.topUnresolvedRoots.map(
      (item) => `| ${item.root} | ${item.count} |`,
    ),
    "",
    "## 模块边界的主要根符号",
    "",
    "| 根符号 | 样本数 |",
    "|---|---:|",
    ...summary.topModuleBoundaryRoots.map(
      (item) => `| ${item.root} | ${item.count} |`,
    ),
    "",
    "## 覆盖缺口的实体",
    "",
    "| 实体 | 样本数 |",
    "|---|---:|",
    ...summary.topCoverageEntities.map(
      (item) => `| ${item.entityId} | ${item.count} |`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
};

export const parseGapArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/gap-analysis"),
    corpusPath: path.resolve(
      "datasets/real-miniapp/real-miniapp-candidates.jsonl",
    ),
    corpusLimit: 5000,
    perEntityCap: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--out") {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (argument === "--corpus") {
      options.corpusPath = path.resolve(next);
      index += 1;
    } else if (argument === "--corpus-limit") {
      options.corpusLimit = Number.parseInt(next, 10);
      index += 1;
    } else if (argument === "--per-entity-cap") {
      options.perEntityCap = Number.parseInt(next, 10);
      index += 1;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseGapArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/gap-analysis.mjs [--out <path>] [--corpus <path>]",
    );
  } else {
    const summary = await runGapAnalysis(options);
    console.log(JSON.stringify(summary, null, 2));
  }
}
