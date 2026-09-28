import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_STATE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { collectGroundTruth } from "./differential-ground-truth.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "./run-benchmark.mjs";

/**
 * 消融配置：逐层加入证据来源，并额外给出一个「把求值基线从纯语言换成 Node」
 * 的宽松配置，用来量化保守程度与折叠覆盖之间的取舍。
 */
const ABLATION_CONFIGS = Object.freeze([
  {
    id: "E1-only",
    label: "仅语言基线",
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    targetRuntimeIds: [RUNTIME_IDS.LANGUAGE],
  },
  {
    id: "E1+E2",
    label: "语言基线 + Node",
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    targetRuntimeIds: [RUNTIME_IDS.LANGUAGE, RUNTIME_IDS.NODE],
  },
  {
    id: "E1+E2+E5",
    label: "语言基线 + Node + 浏览器（当前方案）",
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    targetRuntimeIds: [
      RUNTIME_IDS.LANGUAGE,
      RUNTIME_IDS.NODE,
      RUNTIME_IDS.EDGE,
    ],
  },
  {
    id: "E2+E5",
    label: "Node 求值 + 浏览器目标（宽松）",
    evaluatorRuntimeId: RUNTIME_IDS.NODE,
    targetRuntimeIds: [RUNTIME_IDS.EDGE],
  },
]);

export const runAblation = async ({
  outputDir,
  corpusPath,
  corpusLimit = 5000,
  perEntityCap = null,
  policyVersion = "ablation-policy-v1",
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

  const entityIds = [...new Set(records.map((record) => record.entityId))];
  // 真值来自与主基准同一把尺子：`r97-oracle-probe` 在语言基线 / Node / Edge
  // 三列的直接读取。此前这里另写了一份 Node-vs-Edge 私有实现，导致同一篇报告
  // 里出现 21 与 40 两个「差异实体数」。
  const { divergent } = await collectGroundTruth({ entityIds });

  const configs = [];
  for (const config of ABLATION_CONFIGS) {
    configs.push(
      await evaluateConfig({ config, records, divergent, policyVersion }),
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    corpusPath,
    sampleCount: records.length,
    entityCount: entityIds.length,
    groundTruth: {
      browserDifferentialEntityCount: entityIds.filter(
        (entityId) => divergent[entityId] === true,
      ).length,
      evaluator:
        "r97-oracle-probe 在语言基线（隔离 vm）、真实 Node、真实 Edge 三列的直接读取",
    },
    configs,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "ablation.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "ablation.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const evaluateConfig = async ({
  config,
  records,
  divergent,
  policyVersion,
}) => {
  const basedArguments = {
    targetRuntimeIds: config.targetRuntimeIds,
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: config.evaluatorRuntimeId,
    policyVersion,
    contractVersion: "ablation-v1",
  };

  const plans = records.flatMap((record) =>
    analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      ...basedArguments,
    }).decisions,
  );
  const evidence = await buildRuntimeEvidence(
    plans,
    config.targetRuntimeIds,
    policyVersion,
  );

  const results = records.map((record) => {
    const result = analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      ...basedArguments,
      evidenceRecords: evidence.records,
    });
    const matched =
      result.decisions.find(
        (item) => item.runtimeEntity.entityId === record.entityId,
      ) ?? result.decisions[0];
    const state = matched?.decision.knowledgeState ?? "UNKNOWN";
    return {
      entityId: record.entityId,
      state,
      allowed: state === KNOWLEDGE_STATE.FOLD,
      differential: divergent[record.entityId] === true,
    };
  });

  const allowed = results.filter((item) => item.allowed);
  const unsafe = allowed.filter((item) => item.differential);
  const safeCandidates = results.filter((item) => !item.differential);
  const overProtected = safeCandidates.filter((item) => !item.allowed);

  return {
    id: config.id,
    label: config.label,
    evaluatorRuntimeId: config.evaluatorRuntimeId,
    targetRuntimeIds: [...config.targetRuntimeIds],
    evidenceAvailability: evidence.availability,
    allowedFold: allowed.length,
    blockedFold: results.length - allowed.length,
    unknown:
      results.filter((item) => item.state === KNOWLEDGE_STATE.UNKNOWN).length,
    protect:
      results.filter((item) => item.state === KNOWLEDGE_STATE.PROTECT).length,
    unsafeFold: unsafe.length,
    unsafeFoldRate: ratio(unsafe.length, allowed.length),
    overProtection: overProtected.length,
    overProtectionRate: ratio(overProtected.length, safeCandidates.length),
    unsafeExamples: unsafe.slice(0, 15).map((item) => item.entityId),
  };
};

const ratio = (numerator, denominator) =>
  denominator === 0 ? null : numerator / denominator;

const percent = (value) =>
  value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 证据层消融实验",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `评测样本：${summary.sampleCount}，运行时实体：${summary.entityCount}`,
    "",
    "独立真值来自真实 Node 与真实 Edge 的直接执行观测；",
    `其中两个宿主实际存在差异的实体数为 ${summary.groundTruth.browserDifferentialEntityCount}。`,
    "",
    "## 消融结果",
    "",
    "| 配置 | 求值基线 | 目标运行时 | 允许折叠 | 误放行 | 误放行率 | 过度保护率 | 未知 |",
    "|---|---|---|---:|---:|---:|---:|---:|",
  ];

  for (const config of summary.configs) {
    lines.push(
      `| ${config.label} | ${shortName(config.evaluatorRuntimeId)} | ${config.targetRuntimeIds.map(shortName).join("+")} | ${config.allowedFold}/${summary.sampleCount} | ${config.unsafeFold} | ${percent(config.unsafeFoldRate)} | ${percent(config.overProtectionRate)} | ${config.unknown} |`,
    );
  }

  lines.push("", "## 说明", "");
  lines.push(
    "- 误放行指决策放行折叠，但两个真实宿主执行结果不同，属于必须避免的安全事故。",
    "- 过度保护指两个宿主本就一致、本可安全折叠，但决策未放行。",
    "- 「语言基线 + Node」与「语言基线 + Node + 浏览器」的差异体现浏览器证据的边际贡献。",
    "- 「Node 求值 + 浏览器目标」把求值基线放宽到 Node，用于量化保守程度与覆盖之间的取舍，不代表更安全的配置。",
  );

  const unsafeConfig = summary.configs.find(
    (config) => config.unsafeExamples.length > 0,
  );
  if (unsafeConfig) {
    lines.push(
      "",
      `## ${unsafeConfig.label} 的误放行示例`,
      "",
      ...unsafeConfig.unsafeExamples.map((entityId) => `- ${entityId}`),
    );
  }
  return `${lines.join("\n")}\n`;
};

const shortName = (runtimeId) =>
  ({
    [RUNTIME_IDS.LANGUAGE]: "E1",
    [RUNTIME_IDS.NODE]: "E2",
    [RUNTIME_IDS.EDGE]: "E5",
    [RUNTIME_IDS.WECHAT]: "E4",
  })[runtimeId] ?? runtimeId;

export const parseAblationArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/ablation"),
    corpusPath: path.resolve(
      "datasets/real-miniapp/real-miniapp-candidates.jsonl",
    ),
    corpusLimit: 5000,
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
  const options = parseAblationArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/ablation.mjs [options]",
        "",
        "Options:",
        "  --out <path>          Output directory",
        "  --corpus <path>       Real miniapp JSONL corpus",
        "  --corpus-limit <n>    Maximum deduplicated rows",
      ].join("\n"),
    );
  } else {
    const summary = await runAblation(options);
    console.log(JSON.stringify(summary, null, 2));
  }
}
