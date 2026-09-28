import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_PROVENANCE,
  KNOWLEDGE_STATE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { detectMiniProgramPackage } from "./project-platform-resolver.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "./run-benchmark.mjs";
import { buildRuntimeFingerprintEvidence } from "./runtime-fingerprint.mjs";

const DEFAULT_SOURCE_ROOT =
  "E:/复现/sample_collector/可用于实验的干净源码包";

/**
 * 目标确认带来的覆盖增量。
 *
 * 三种目标配置跑同一批样本、同一套观测：
 *
 * 1. `no_target`：什么都不知道（目标未声明、无外部证据）。
 * 2. `context_unknown`：平台判定器从包结构确认了平台族与执行表面，但版本未知。
 * 3. `confirmed`：额外拿到部署侧运行时指纹，版本画像齐全。
 *
 * 差别只在目标状态，观测与样本完全一致，因此差值就是「目标确认」这件事本身值多少。
 */
export const runTargetConfirmationImpact = async ({
  corpusPath,
  sourceRoot = DEFAULT_SOURCE_ROOT,
  perEntityCap = 5,
  wechatReportPath,
  outputDir = null,
  generatedAt = new Date().toISOString(),
}) => {
  if (!existsSync(corpusPath)) {
    throw new Error(`Corpus file does not exist: ${corpusPath}`);
  }
  const records = (
    await readDeduplicatedCorpusRecords(
      corpusPath,
      Number.POSITIVE_INFINITY,
      { perEntityCap },
    )
  )
    .map((record) => ({
      ...record,
      generatedSource: sourceForRecord(record),
    }))
    .filter((record) => record.generatedSource !== null);

  // 观测用超集构建：无论哪种目标配置，比对时都有数据。
  const probeTargets = [
    RUNTIME_IDS.LANGUAGE,
    RUNTIME_IDS.NODE,
    RUNTIME_IDS.EDGE,
    RUNTIME_IDS.WECHAT,
  ];
  const plans = records.flatMap((record) =>
    analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      targetRuntimeIds: probeTargets,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: "benchmark-policy-v1",
      contractVersion: "benchmark-v1",
    }).decisions,
  );
  const evidence = await buildRuntimeEvidence(
    plans,
    probeTargets,
    "benchmark-policy-v1",
    wechatReportPath,
  );

  const configurations = [
    { id: "no_target", label: "目标未知" },
    { id: "context_unknown", label: "平台族已确认、版本未知" },
    { id: "confirmed", label: "部署指纹齐全、目标已确认" },
  ];

  const results = {};
  // 逐样本状态，用来算精确的转移矩阵——聚合差算不出「UNKNOWN 减少的 555 条
  // 分别去了哪里」，因为 FOLD 和 PROTECT 之间有交叉。
  const statesByConfiguration = {};
  for (const configuration of configurations) {
    const byState = { FOLD: 0, PROTECT: 0, UNKNOWN: 0 };
    const byTargetStatus = {};
    const states = [];
    for (const record of records) {
      const targetRuntimeEvidence = buildTargetEvidence({
        configuration: configuration.id,
        record,
        sourceRoot,
        generatedAt,
      });
      const decision = analyzeAndDecide({
        source: record.generatedSource,
        filePath: record.file,
        targetRuntimeIds: [],
        targetRuntimeSource: TARGET_RUNTIME_SOURCE.UNKNOWN,
        targetRuntimeEvidence,
        evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
        policyVersion: "benchmark-policy-v1",
        contractVersion: "benchmark-v1",
        evidenceRecords: evidence.records,
      }).decisions[0];
      const state = decision?.decision.knowledgeState ?? KNOWLEDGE_STATE.UNKNOWN;
      states.push(state);
      byState[state] += 1;
      const status = decision?.targetRuntime.status ?? "unknown";
      byTargetStatus[status] = (byTargetStatus[status] ?? 0) + 1;
    }
    statesByConfiguration[configuration.id] = states;
    results[configuration.id] = {
      label: configuration.label,
      sampleCount: records.length,
      byState,
      byTargetStatus,
      foldRate: byState.FOLD / records.length,
      unknownRate: byState.UNKNOWN / records.length,
      // FOLD + PROTECT：系统真正有足够信息判定的比例。
      decidableRate: (byState.FOLD + byState.PROTECT) / records.length,
    };
  }

  const transitions = countTransitions(
    statesByConfiguration.context_unknown ?? [],
    statesByConfiguration.confirmed ?? [],
  );
  const unknownBefore = (statesByConfiguration.context_unknown ?? []).filter(
    (state) => state === KNOWLEDGE_STATE.UNKNOWN,
  ).length;
  const recovered = transitions.UNKNOWN_FOLD + transitions.UNKNOWN_PROTECT;

  const summary = {
    generatedAt,
    corpusPath,
    perEntityCap,
    sampleCount: records.length,
    configurations: results,
    delta: {
      contextUnknownToConfirmed: {
        fold: results.confirmed.byState.FOLD - results.context_unknown.byState.FOLD,
        protect:
          results.confirmed.byState.PROTECT -
          results.context_unknown.byState.PROTECT,
        unknown:
          results.confirmed.byState.UNKNOWN -
          results.context_unknown.byState.UNKNOWN,
        // Gap Recovery Rate：有多少条「无法判定」在补上部署指纹之后变成
        // 「可以判定」。哪怕一条都没多放行，UNKNOWN→PROTECT 也是收益——
        // 它说明系统真正知道了为什么不能折叠。
        gapRecovery: {
          unknownBefore,
          toFold: transitions.UNKNOWN_FOLD,
          toProtect: transitions.UNKNOWN_PROTECT,
          stillUnknown: transitions.UNKNOWN_UNKNOWN,
          recovered,
          rate: unknownBefore === 0 ? null : recovered / unknownBefore,
        },
        transitions,
      },
    },
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "target-confirmation-impact.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDir, "target-confirmation-impact.md"),
      renderMarkdown(summary),
      "utf8",
    );
  }
  return summary;
};

const buildTargetEvidence = ({
  configuration,
  record,
  sourceRoot,
  generatedAt,
}) => {
  if (configuration === "no_target") {
    return [];
  }
  const projectDir = path.join(sourceRoot, record.project ?? "");
  const detection = detectMiniProgramPackage({
    projectDir,
    artifactScope: record.file,
    detectedAt: generatedAt,
  });
  if (configuration === "context_unknown") {
    return detection.evidenceRecords;
  }
  // confirmed：叠加部署侧的两份**独立**运行时指纹。
  //
  // 必须两份：确认门槛要求同一运行时下 ≥2 条完整证据、且至少一条权威。
  // 包结构信号虽然也是权威来源，但它们没有版本画像，进不了这道门——这正是
  // 「包结构只能推到 context_unknown」的根本原因。
  const fingerprintBase = {
    runtimeId: RUNTIME_IDS.WECHAT,
    platformFamily: "wechat",
    executionSurface: "appservice",
    versionProfile: ["sdk:3.17.3"],
    scopeId: record.project ?? "",
    artifactScope: record.file,
    revision: record.sourceHash ?? null,
    detectedAt: generatedAt,
  };
  return [
    buildRuntimeFingerprintEvidence({
      ...fingerprintBase,
      evidenceId: `fingerprint:${record.project}`,
      artifactHash: detection.evidenceRecords[0]?.artifactHash ?? null,
      source: "runtime_fingerprint",
      provenance: EVIDENCE_PROVENANCE.HUMAN_REVIEW,
    }),
    buildRuntimeFingerprintEvidence({
      ...fingerprintBase,
      evidenceId: `trace:${record.project}`,
      artifactHash: null,
      source: "runtime_trace",
      provenance: EVIDENCE_PROVENANCE.HUMAN_REVIEW,
    }),
  ];
};

/**
 * 逐样本状态转移计数。
 *
 * 只关心 UNKNOWN 的去向——那才是「判不了 → 判得了」的收益。聚合差算不出这
 * 件事：FOLD 与 PROTECT 之间存在交叉转移，减出来的差值不是转移数。
 */
export const countTransitions = (before, after) => {
  const counts = {
    UNKNOWN_FOLD: 0,
    UNKNOWN_PROTECT: 0,
    UNKNOWN_UNKNOWN: 0,
    FOLD_FOLD: 0,
    FOLD_PROTECT: 0,
    FOLD_UNKNOWN: 0,
    PROTECT_PROTECT: 0,
    PROTECT_FOLD: 0,
    PROTECT_UNKNOWN: 0,
  };
  for (let index = 0; index < before.length; index += 1) {
    const from = before[index];
    const to = after[index] ?? KNOWLEDGE_STATE.UNKNOWN;
    if (from === KNOWLEDGE_STATE.UNKNOWN) {
      if (to === KNOWLEDGE_STATE.FOLD) {
        counts.UNKNOWN_FOLD += 1;
      } else if (to === KNOWLEDGE_STATE.PROTECT) {
        counts.UNKNOWN_PROTECT += 1;
      } else {
        counts.UNKNOWN_UNKNOWN += 1;
      }
      continue;
    }
    if (from === KNOWLEDGE_STATE.FOLD) {
      if (to === KNOWLEDGE_STATE.FOLD) {
        counts.FOLD_FOLD += 1;
      } else if (to === KNOWLEDGE_STATE.PROTECT) {
        counts.FOLD_PROTECT += 1;
      } else {
        counts.FOLD_UNKNOWN += 1;
      }
      continue;
    }
    if (to === KNOWLEDGE_STATE.PROTECT) {
      counts.PROTECT_PROTECT += 1;
    } else if (to === KNOWLEDGE_STATE.FOLD) {
      counts.PROTECT_FOLD += 1;
    } else {
      counts.PROTECT_UNKNOWN += 1;
    }
  }
  return counts;
};

const renderMarkdown = (summary) => {
  const lines = [
    "# 目标确认带来的覆盖增量",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `样本：${summary.sampleCount}（每实体最多 ${summary.perEntityCap} 条）`,
    "",
    "三种配置跑同一批样本、同一套观测，差别只在目标状态：",
    "",
    "| 配置 | FOLD | PROTECT | UNKNOWN | 放行率 | 可判定率 |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const [, value] of Object.entries(summary.configurations)) {
    lines.push(
      `| ${value.label} | ${value.byState.FOLD} | ${value.byState.PROTECT} | ${value.byState.UNKNOWN} | ${(value.foldRate * 100).toFixed(2)}% | ${(value.decidableRate * 100).toFixed(2)}% |`,
    );
  }
  const delta = summary.delta.contextUnknownToConfirmed;
  const recovery = delta.gapRecovery;
  lines.push(
    "",
    "从「平台族已确认、版本未知」推进到「部署指纹齐全、目标已确认」的增量：",
    "",
    "| 指标 | 变化 |",
    "|---|---:|",
    `| FOLD | ${delta.fold >= 0 ? "+" : ""}${delta.fold} |`,
    `| PROTECT | ${delta.protect >= 0 ? "+" : ""}${delta.protect} |`,
    `| UNKNOWN | ${delta.unknown >= 0 ? "+" : ""}${delta.unknown} |`,
    "",
    "### Gap Recovery Rate",
    "",
    "上面的差值是聚合量，看不出「无法判定」的点具体去了哪里，因此另算逐样本转移：",
    "",
    "| 转移 | 数量 |",
    "|---|---:|",
    `| UNKNOWN → FOLD | ${recovery.toFold} |`,
    `| UNKNOWN → PROTECT | ${recovery.toProtect} |`,
    `| UNKNOWN → UNKNOWN | ${recovery.stillUnknown} |`,
    `| FOLD → FOLD | ${delta.transitions.FOLD_FOLD} |`,
    `| FOLD → PROTECT | ${delta.transitions.FOLD_PROTECT} |`,
    `| FOLD → UNKNOWN | ${delta.transitions.FOLD_UNKNOWN} |`,
    `| PROTECT → PROTECT | ${delta.transitions.PROTECT_PROTECT} |`,
    "",
    `回收率 = (${recovery.toFold} + ${recovery.toProtect}) / ${recovery.unknownBefore} = **${recovery.rate === null ? "—" : `${(recovery.rate * 100).toFixed(2)}%`}**`,
    "",
    "哪怕一条都没多放行，UNKNOWN → PROTECT 也是收益：它说明系统真正知道了为什么不能折叠。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parseTargetImpactArgs = (argv) => {
  const options = {
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    wechatReportPath: path.resolve(
      "datasets/wechat-live/wechat-probe-report.json",
    ),
    outputDir: path.resolve("datasets/target-confirmation-impact"),
    perEntityCap: 5,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--corpus") {
      options.corpusPath = path.resolve(next);
      index += 1;
    } else if (argument === "--wechat-report") {
      options.wechatReportPath = path.resolve(next);
      index += 1;
    } else if (argument === "--out") {
      options.outputDir = path.resolve(next);
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
  const options = parseTargetImpactArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/target-confirmation-impact.mjs [--corpus <path>] [--wechat-report <path>] [--out <dir>]",
    );
  } else {
    const summary = await runTargetConfirmationImpact(options);
    console.log(
      JSON.stringify(
        {
          sampleCount: summary.sampleCount,
          configurations: Object.fromEntries(
            Object.entries(summary.configurations).map(([id, value]) => [
              id,
              value.byState,
            ]),
          ),
          delta: summary.delta,
        },
        null,
        2,
      ),
    );
  }
}
