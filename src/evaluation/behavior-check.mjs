import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_STATE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import {
  collectBrowserObservations,
  findBrowserPath,
} from "../evidence/browser-probe.mjs";
import { withCdpPage } from "../evidence/cdp-client.mjs";
import { collectLanguageObservations } from "../evidence/language-probe.mjs";
import { collectNodeObservations } from "../evidence/node-probe.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import {
  buildDirectProbeExpression,
  evaluateDirectProbeInNode,
} from "./direct-probe.mjs";
import { collectGroundTruth } from "./differential-ground-truth.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "./run-benchmark.mjs";

const DEFAULT_TARGET_RUNTIME_IDS = Object.freeze([
  RUNTIME_IDS.LANGUAGE,
  RUNTIME_IDS.NODE,
  RUNTIME_IDS.EDGE,
]);

export const runBehaviorCheck = async ({
  outputDir,
  corpusPath,
  corpusLimit = 400,
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

  const plans = records.flatMap((record) =>
    analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      targetRuntimeIds: DEFAULT_TARGET_RUNTIME_IDS,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion,
      contractVersion: "benchmark-v1",
    }).decisions,
  );

  const entityDimensions = Object.fromEntries(
    plans.map((plan) => [
      plan.runtimeEntity.entityId,
      ["existence", "type", "callability"],
    ]),
  );
  const entityIds = Object.keys(entityDimensions);
  if (entityIds.length === 0) {
    throw new Error("Corpus produced no runtime entities to validate");
  }

  const observedAt = new Date().toISOString();
  const language = collectLanguageObservations({ entityDimensions, observedAt });
  const node = collectNodeObservations({ entityDimensions, observedAt });
  const edge = await collectBrowserObservations({
    entityDimensions,
    observedAt,
  });
  const engineEvidence = await buildRuntimeEvidence(
    plans,
    DEFAULT_TARGET_RUNTIME_IDS,
  );

  const decisionsByEntity = new Map();
  for (const record of records) {
    const result = analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      targetRuntimeIds: DEFAULT_TARGET_RUNTIME_IDS,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion,
      contractVersion: "benchmark-v1",
      evidenceRecords: engineEvidence.records,
    });
    for (const item of result.decisions) {
      decisionsByEntity.set(item.runtimeEntity.entityId, item);
    }
  }

  const directNode = evaluateDirectProbeInNode(entityIds);
  const profileDir = path.join(process.cwd(), ".runtime", "edge-profile");
  mkdirSync(profileDir, { recursive: true });
  const directEdge = await withCdpPage(
    {
      browserPath: findBrowserPath(),
      profileDir,
    },
    ({ evaluate }) => evaluate(buildDirectProbeExpression(entityIds)),
  );

  // 真值用与主基准同一把尺子：`r97-oracle-probe` 在语言基线 / Node / Edge 三列
  // 的直接读取。这里的 direct probe 是**另一套实现**，它的 Node-vs-Edge 差值
  // （此前被当成真值，21 个实体）只回答「两个宿主之间差多少」，回答不了 R97
  // 关心的「求值基线 vs 目标宿主差多少」——`console` 这类在语言基线里不存在、
  // 在两个宿主里都存在的实体，在它那里根本不算差异。两套实现的一致性另列为
  // `engineXMatchesDirect`，保留交叉验证的价值。
  const { divergent } = await collectGroundTruth({ entityIds });

  const perEntity = entityIds.map((entityId) => {
    const decision = decisionsByEntity.get(entityId) ?? null;
    const engineNode = node.observations[entityId]?.values ?? null;
    const engineEdge = edge.observations[entityId]?.values ?? null;
    const directNodeValues = normalizeDirect(directNode[entityId]);
    const directEdgeValues = normalizeDirect(directEdge[entityId]);
    const groundTruthDifferential = divergent[entityId] === true;
    const directPairDifferential = !sameObservation(
      directNodeValues,
      directEdgeValues,
    );

    return {
      entityId,
      decision: decision?.decision.knowledgeState ?? "UNKNOWN",
      reasonCodes: decision?.decision.reasonCodes ?? [],
      engineNode,
      engineEdge,
      directNode: directNodeValues,
      directEdge: directEdgeValues,
      engineNodeMatchesDirect: sameObservation(engineNode, directNodeValues),
      engineEdgeMatchesDirect: sameObservation(engineEdge, directEdgeValues),
      groundTruthDifferential,
      // direct probe 自己的 Node-vs-Edge 判定。它与 groundTruthDifferential
      // 的差集就是「两套口径的分歧」，单独统计而不是混进真值。
      directPairDifferential,
    };
  });

  const summary = summarize({
    perEntity,
    observedAt,
    entityCount: entityIds.length,
    edgeVersion: edge.browserVersion,
    languageObserved: Object.keys(language.observations).length,
    nodeObserved: Object.keys(node.observations).length,
    edgeObserved: Object.keys(edge.observations).length,
  });

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "behavior-check.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "behavior-check.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const summarize = ({
  perEntity,
  observedAt,
  entityCount,
  edgeVersion,
  languageObserved,
  nodeObserved,
  edgeObserved,
}) => {
  const fold = perEntity.filter(
    (item) => item.decision === KNOWLEDGE_STATE.FOLD,
  );
  const protect = perEntity.filter(
    (item) => item.decision === KNOWLEDGE_STATE.PROTECT,
  );
  const unknown = perEntity.filter(
    (item) => item.decision === KNOWLEDGE_STATE.UNKNOWN,
  );
  const differential = perEntity.filter(
    (item) => item.groundTruthDifferential,
  );

  const soundFold = fold.filter((item) => !item.groundTruthDifferential);
  const protectWithCrossHostDifference = protect.filter(
    (item) => item.groundTruthDifferential,
  );
  const protectBaselineOnly = protect.filter(
    (item) => !item.groundTruthDifferential,
  );
  const agreeingEntities = perEntity.filter(
    (item) => !item.groundTruthDifferential,
  );
  const directDisagreements = perEntity.filter(
    (item) =>
      !item.engineNodeMatchesDirect || !item.engineEdgeMatchesDirect,
  );

  return {
    generatedAt: observedAt,
    entityCount,
    observationCoverage: {
      language: languageObserved,
      node: nodeObserved,
      edge: edgeObserved,
    },
    browserVersion: edgeVersion,
    decisionCounts: {
      FOLD: fold.length,
      PROTECT: protect.length,
      UNKNOWN: unknown.length,
    },
    groundTruthDifferentialCount: differential.length,
    metrics: {
      foldSoundness: ratio(soundFold.length, fold.length),
      foldCoverageAmongAgreeing: ratio(
        soundFold.length,
        agreeingEntities.length,
      ),
      crossHostAgreementRate: ratio(
        agreeingEntities.length,
        entityCount,
      ),
      probeAgreementRate: ratio(
        entityCount - directDisagreements.length,
        entityCount,
      ),
    },
    protectBreakdown: {
      crossHostDifference: protectWithCrossHostDifference.length,
      evaluatorBaselineOnly: protectBaselineOnly.length,
    },
    disagreements: {
      foldThatDiffer: fold.filter((item) => item.groundTruthDifferential),
      protectWithoutCrossHostDifference: protectBaselineOnly,
      probeMismatches: directDisagreements,
    },
    differentialExamples: differential.slice(0, 20),
  };
};

const normalizeDirect = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (value.error) {
    return { error: value.error };
  }
  return value;
};

const sameObservation = (left, right) => {
  if (!left || !right) {
    return false;
  }
  for (const dimension of ["existence", "type", "callability"]) {
    const leftHas = Object.hasOwn(left, dimension);
    const rightHas = Object.hasOwn(right, dimension);
    if (!leftHas && !rightHas) {
      continue;
    }
    if (leftHas !== rightHas) {
      return false;
    }
    if (left[dimension] !== right[dimension]) {
      return false;
    }
  }
  return true;
};

const ratio = (numerator, denominator) =>
  denominator === 0 ? null : numerator / denominator;

const percent = (value) =>
  value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 独立行为差分校验",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `参与校验的运行时实体：${summary.entityCount}`,
    "",
    `浏览器：${summary.browserVersion?.product ?? "unknown"}`,
    "",
    "## 观测覆盖",
    "",
    "| 运行时 | 生成观测的实体数 |",
    "|---|---:|",
    `| 语言基线 E1 | ${summary.observationCoverage.language} |`,
    `| Node E2 | ${summary.observationCoverage.node} |`,
    `| Edge E5 | ${summary.observationCoverage.edge} |`,
    "",
    "## 判定分布",
    "",
    "| 状态 | 数量 |",
    "|---|---:|",
    `| FOLD | ${summary.decisionCounts.FOLD} |`,
    `| PROTECT | ${summary.decisionCounts.PROTECT} |`,
    `| UNKNOWN | ${summary.decisionCounts.UNKNOWN} |`,
    "",
    "## 独立校验指标",
    "",
    "| 指标 | 数值 | 含义 |",
    "|---|---:|---|",
    `| FOLD 可靠性 | ${percent(summary.metrics.foldSoundness)} | 允许折叠的实体中，Node 与 Edge 实际执行观测一致的比例 |`,
    `| 一致实体上的折叠覆盖 | ${percent(summary.metrics.foldCoverageAmongAgreeing)} | Node 与 Edge 本就一致的实体中，被安全放行的比例 |`,
    `| 跨宿主一致率 | ${percent(summary.metrics.crossHostAgreementRate)} | 全部实体中 Node 与 Edge 观测一致的实体比例 |`,
    `| 探针一致率 | ${percent(summary.metrics.probeAgreementRate)} | 描述符探针与直接访问探针结果一致的比例 |`,
    "",
    "## 保护判定来源",
    "",
    "| 来源 | 数量 | 含义 |",
    "|---|---:|---|",
    `| 跨宿主真实差异 | ${summary.protectBreakdown.crossHostDifference} | Node 与 Edge 实际执行结果不同，保护有直接证据 |`,
    `| 仅语言基线差异 | ${summary.protectBreakdown.evaluatorBaselineOnly} | Node 与 Edge 一致，但求值基线不含该宿主全局，属于保守保护 |`,
    "",
    `真实差分实体数：${summary.groundTruthDifferentialCount}`,
    "",
  ];

  if (summary.disagreements.foldThatDiffer.length > 0) {
    lines.push(
      "## 折叠但实际存在差异",
      "",
      ...summary.disagreements.foldThatDiffer
        .slice(0, 10)
        .map((item) => `- ${item.entityId}`),
      "",
    );
  }
  if (summary.disagreements.protectWithoutCrossHostDifference.length > 0) {
    lines.push(
      "## 保守保护实体（Node 与 Edge 一致）",
      "",
      ...summary.disagreements.protectWithoutCrossHostDifference
        .slice(0, 15)
        .map((item) => `- ${item.entityId}`),
      "",
    );
  }
  if (summary.disagreements.probeMismatches.length > 0) {
    lines.push(
      "## 两套探针实现不一致",
      "",
      ...summary.disagreements.probeMismatches
        .slice(0, 10)
        .map(
          (item) =>
            `- ${item.entityId}（node 一致=${item.engineNodeMatchesDirect}，edge 一致=${item.engineEdgeMatchesDirect}）`,
        ),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
};

export const parseBehaviorCheckArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/behavior-check"),
    corpusPath: path.resolve("datasets/real-miniapp/real-miniapp-candidates.jsonl"),
    corpusLimit: 400,
    perEntityCap: null,
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
      case "--corpus-limit":
        options.corpusLimit = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--per-entity-cap":
        options.perEntityCap = Number.parseInt(next, 10);
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
  const options = parseBehaviorCheckArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/behavior-check.mjs [options]",
        "",
        "Options:",
        "  --out <path>          Output directory",
        "  --corpus <path>       Real miniapp JSONL corpus",
        "  --corpus-limit <n>    Maximum deduplicated rows",
      ].join("\n"),
    );
  } else {
    const summary = await runBehaviorCheck(options);
    console.log(JSON.stringify(summary, null, 2));
  }
}
