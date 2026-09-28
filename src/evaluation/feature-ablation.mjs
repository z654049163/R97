import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BINDING_KIND,
  EVIDENCE_PROVENANCE,
  KNOWLEDGE_STATE,
  REASON_CODE,
  RESOLUTION_STATUS,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { decideProtection } from "../decision-engine.mjs";
import { createEvidenceRecord } from "../model.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { collectDifferentialGroundTruth } from "./differential-ground-truth.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "./run-benchmark.mjs";

const PROBE_DIMENSIONS = Object.freeze([
  "existence",
  "type",
  "callability",
]);

const HOST_ROOTS = Object.freeze({
  node: Object.freeze([
    "Buffer",
    "__dirname",
    "__filename",
    "exports",
    "module",
    "process",
    "require",
    "setImmediate",
  ]),
  browser: Object.freeze([
    "document",
    "localStorage",
    "location",
    "navigator",
    "sessionStorage",
    "window",
  ]),
  wechat: Object.freeze([
    "App",
    "Behavior",
    "Component",
    "Page",
    "getApp",
    "getCurrentPages",
    "wx",
  ]),
});

export const runFeatureAblation = async ({
  outputDir,
  corpusPath,
  corpusLimit = 3000,
  perEntityCap = null,
  policyVersion = "feature-ablation-v1",
}) => {
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

  const targetRuntimeIds = [
    RUNTIME_IDS.LANGUAGE,
    RUNTIME_IDS.NODE,
    RUNTIME_IDS.EDGE,
  ];
  const baseArguments = {
    targetRuntimeIds,
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    policyVersion,
    contractVersion: "feature-ablation-v1",
  };

  const initialResults = records.map((record) =>
    analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      ...baseArguments,
    }),
  );
  const evidence = await buildRuntimeEvidence(
    initialResults.flatMap((result) => result.decisions),
    targetRuntimeIds,
    policyVersion,
  );
  const fullEntries = records.map((record) => {
    const result = analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      ...baseArguments,
      evidenceRecords: evidence.records,
    });
    const plan =
      result.decisions.find(
        (item) => item.runtimeEntity.entityId === record.entityId,
      ) ?? result.decisions[0];
    return {
      record,
      plan,
      decision: plan.decision,
    };
  });

  const entityIds = [...new Set(records.map((record) => record.entityId))];
  const groundTruth = await collectDifferentialGroundTruth(entityIds);
  const variants = evaluateVariants({
    fullEntries,
    evidenceRecords: evidence.records,
    groundTruth,
  });
  const llmGate = evaluateLlmCandidateGate(fullEntries, policyVersion);
  const unknowns = fullEntries.filter(
    (entry) => entry.decision.knowledgeState === KNOWLEDGE_STATE.UNKNOWN,
  );
  const unknownReasonCounts = countBy(
    unknowns.flatMap((entry) => entry.decision.reasonCodes),
  );
  const bindingUnknownCount = unknowns.filter((entry) =>
    entry.decision.reasonCodes.includes(REASON_CODE.BINDING_UNRESOLVED),
  ).length;
  const contractUnknownCount = unknowns.filter((entry) =>
    entry.decision.reasonCodes.includes(
      REASON_CODE.CONTRACT_COVERAGE_MISSING,
    ),
  ).length;
  const runtimeUnknownCount = unknowns.filter((entry) =>
    entry.decision.reasonCodes.includes(
      REASON_CODE.REQUIRED_RUNTIME_MISSING,
    ),
  ).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    corpusPath,
    sampleCount: records.length,
    entityCount: entityIds.length,
    independentReference: {
      description: "真实 Node 与真实 Edge 的直接属性访问探针",
      differentialEntityCount: Object.values(groundTruth).filter(Boolean)
        .length,
    },
    variants,
    llmGate,
    unknownReasons: {
      counts: unknownReasonCounts,
      bindingUnknownCount,
      contractUnknownCount,
      runtimeUnknownCount,
      bindingShare:
        unknowns.length === 0 ? null : bindingUnknownCount / unknowns.length,
      contractShare:
        unknowns.length === 0 ? null : contractUnknownCount / unknowns.length,
      runtimeShare:
        unknowns.length === 0 ? null : runtimeUnknownCount / unknowns.length,
    },
    rankingFeatures: buildRankingFeatures({
      records,
      groundTruth,
      targetRuntimeIds,
    }),
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "feature-ablation.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "feature-ablation.md"),
    renderMarkdown(summary),
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "ranking-features.json"),
    `${JSON.stringify(summary.rankingFeatures, null, 2)}\n`,
    "utf8",
  );

  return summary;
};

const evaluateVariants = ({
  fullEntries,
  evidenceRecords,
  groundTruth,
}) => {
  const definitions = [
    {
      id: "R97-full",
      label: "当前 R97：契约投影 + 三值保守决策",
      evaluate: (entry) => entry.decision,
    },
    {
      id: "unknown-as-fold",
      label: "二值宽松：把 UNKNOWN 当作 FOLD",
      evaluate: (entry) =>
        entry.decision.knowledgeState === KNOWLEDGE_STATE.UNKNOWN
          ? {
              ...entry.decision,
              knowledgeState: KNOWLEDGE_STATE.FOLD,
              enforcementAction: "ALLOW_FOLD",
            }
          : entry.decision,
    },
    {
      id: "disable-projection",
      label: "关闭投影：比较全部可观测维度",
      evaluate: (entry) =>
        decideProtection({
          query: entry.plan.query,
          semanticContract: {
            ...entry.plan.semanticContract,
            requiredDimensions: [...PROBE_DIMENSIONS],
            observationProjection: [...PROBE_DIMENSIONS],
          },
          evidenceRecords,
          asOf: new Date().toISOString(),
        }),
    },
    {
      id: "binding-oracle",
      label: "绑定理想化：假设全部静态绑定都能解析",
      evaluate: (entry) =>
        decideProtection({
          query: {
            ...entry.plan.query,
            bindingRef: {
              ...entry.plan.query.bindingRef,
              resolutionStatus: RESOLUTION_STATUS.RESOLVED,
              bindingKind: BINDING_KIND.RUNTIME_GLOBAL,
            },
          },
          semanticContract: entry.plan.semanticContract,
          evidenceRecords,
          asOf: new Date().toISOString(),
        }),
    },
    {
      id: "binding-oracle-no-projection",
      label: "绑定理想化 + 关闭投影",
      evaluate: (entry) =>
        decideProtection({
          query: {
            ...entry.plan.query,
            bindingRef: {
              ...entry.plan.query.bindingRef,
              resolutionStatus: RESOLUTION_STATUS.RESOLVED,
              bindingKind: BINDING_KIND.RUNTIME_GLOBAL,
            },
          },
          semanticContract: {
            ...entry.plan.semanticContract,
            requiredDimensions: [...PROBE_DIMENSIONS],
            observationProjection: [...PROBE_DIMENSIONS],
          },
          evidenceRecords,
          asOf: new Date().toISOString(),
        }),
    },
  ];

  return definitions.map((definition) =>
    summarizeVariant({
      definition,
      fullEntries,
      groundTruth,
    }),
  );
};

const evaluateLlmCandidateGate = (fullEntries, policyVersion) => {
  const stateCounts = {
    FOLD: 0,
    PROTECT: 0,
    UNKNOWN: 0,
  };
  const reasonCounts = {};

  for (const entry of fullEntries) {
    const { plan } = entry;
    const requiredDimensions = new Set(
      plan.semanticContract.requiredDimensions,
    );
    const observableDimensions = PROBE_DIMENSIONS.filter((dimension) =>
      requiredDimensions.has(dimension),
    );
    const observations = {};
    for (const runtimeId of [
      plan.query.evaluatorRuntimeId,
      ...plan.query.targetRuntimeIds,
    ]) {
      if (observations[runtimeId]) {
        continue;
      }
      observations[runtimeId] = {
        runtimeProfileId: runtimeId,
        observedDimensions: observableDimensions,
        values: Object.fromEntries(
          observableDimensions.map((dimension) => [
            dimension,
            dimension === "existence"
              ? true
              : dimension === "type"
                ? "function"
                : true,
          ]),
        ),
        sideEffects: [],
        observedAt: null,
        probeHash: null,
      };
    }
    const candidateEvidence = createEvidenceRecord({
      evidenceId: `llm-candidate:${plan.programPointId}`,
      entityId: plan.runtimeEntity.entityId,
      usageContextId: plan.usageContext.usageContextId,
      semanticContractId: plan.semanticContract.contractId,
      evaluatorRuntimeId: plan.query.evaluatorRuntimeId,
      observations,
      provenance: EVIDENCE_PROVENANCE.LLM_SUGGESTION,
      policyVersion,
    });
    const decision = decideProtection({
      query: plan.query,
      semanticContract: plan.semanticContract,
      evidenceRecords: [candidateEvidence],
      asOf: new Date().toISOString(),
    });
    stateCounts[decision.knowledgeState] += 1;
    for (const reasonCode of decision.reasonCodes) {
      reasonCounts[reasonCode] = (reasonCounts[reasonCode] ?? 0) + 1;
    }
  }

  return {
    description: "仅把 LLM 建议作为证据来源，不提供真实运行时观测",
    stateCounts,
    reasonCounts,
    canAuthorizeFold: stateCounts.FOLD > 0,
  };
};

const summarizeVariant = ({
  definition,
  fullEntries,
  groundTruth,
}) => {
  const stateCounts = {
    FOLD: 0,
    PROTECT: 0,
    UNKNOWN: 0,
  };
  let safeFold = 0;
  let unsafeFold = 0;
  let changedFromFull = 0;
  const transitions = {};

  for (const entry of fullEntries) {
    const decision = definition.evaluate(entry);
    const state = decision.knowledgeState;
    stateCounts[state] += 1;
    const entityId = entry.plan.runtimeEntity.entityId;
    if (state === KNOWLEDGE_STATE.FOLD) {
      if (groundTruth[entityId]) {
        unsafeFold += 1;
      } else {
        safeFold += 1;
      }
    }
    if (state !== entry.decision.knowledgeState) {
      changedFromFull += 1;
      const transition = `${entry.decision.knowledgeState}->${state}`;
      transitions[transition] = (transitions[transition] ?? 0) + 1;
    }
  }

  return {
    id: definition.id,
    label: definition.label,
    stateCounts,
    safeFold,
    unsafeFold,
    foldSoundness:
      safeFold + unsafeFold === 0
        ? null
        : safeFold / (safeFold + unsafeFold),
    changedFromFull,
    transitions,
  };
};

const buildRankingFeatures = ({
  records,
  groundTruth,
  targetRuntimeIds,
}) => {
  const groups = new Map();

  for (const record of records) {
    const entityId = record.entityId;
    const group = groups.get(entityId) ?? {
      entityId,
      occurrences: 0,
      projectCount: 0,
      unresolvedOccurrences: 0,
      capabilityDomains: new Set(),
      transformationKinds: new Set(),
      callableTransformations: 0,
      projects: new Set(),
    };
    group.occurrences += 1;
    group.projects.add(record.project ?? "<unknown>");
    if (record.resolutionStatus !== RESOLUTION_STATUS.RESOLVED) {
      group.unresolvedOccurrences += 1;
    }
    if (record.transformationKind === "CALL_EVAL") {
      group.callableTransformations += 1;
    }
    group.capabilityDomains.add(record.capabilityDomain ?? "unknown");
    group.transformationKinds.add(record.transformationKind ?? "CONST_EVAL");
    groups.set(entityId, group);
  }

  return {
    targetRuntimeIds: [...targetRuntimeIds],
    entities: [...groups.values()]
      .map((group) => {
        const root = group.entityId.split(".")[0];
        return {
          entityId: group.entityId,
          label: groundTruth[group.entityId] === true ? 1 : 0,
          occurrences: group.occurrences,
          projectCount: group.projects.size,
          unresolvedRatio:
            group.unresolvedOccurrences / group.occurrences,
          rootLength: root.length,
          pathDepth: group.entityId.split(".").length,
          capabilityDomains: [...group.capabilityDomains].sort(),
          transformationKinds: [...group.transformationKinds].sort(),
          callabilityTransformationRatio:
            group.callableTransformations / group.occurrences,
          isNodeRoot: HOST_ROOTS.node.includes(root) ? 1 : 0,
          isBrowserRoot: HOST_ROOTS.browser.includes(root) ? 1 : 0,
          isWechatRoot: HOST_ROOTS.wechat.includes(root) ? 1 : 0,
        };
      })
      .sort((left, right) => left.entityId.localeCompare(right.entityId)),
  };
};

const countBy = (values) =>
  values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

const percent = (value) =>
  value === null || value === undefined
    ? "n/a"
    : `${(value * 100).toFixed(2)}%`;

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 组件必要性与探测预算特征消融",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `样本：${summary.sampleCount}，运行时实体：${summary.entityCount}`,
    `独立参照：${summary.independentReference.description}，`,
    `实际存在差异的实体：${summary.independentReference.differentialEntityCount}`,
    "",
    "## 组件消融",
    "",
    "| 配置 | FOLD | PROTECT | UNKNOWN | 相对当前改变 | 安全折叠 | 不实折叠 | FOLD 可靠性 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const variant of summary.variants) {
    lines.push(
      `| ${variant.label} | ${variant.stateCounts.FOLD} | ${variant.stateCounts.PROTECT} | ${variant.stateCounts.UNKNOWN} | ${variant.changedFromFull} | ${variant.safeFold} | ${variant.unsafeFold} | ${percent(variant.foldSoundness)} |`,
    );
  }

  lines.push(
    "",
    "## UNKNOWN 原因",
    "",
    "| 原因 | 数量 | 占 UNKNOWN |",
    "|---|---:|---:|",
    `| 绑定未解析 | ${summary.unknownReasons.bindingUnknownCount} | ${percent(summary.unknownReasons.bindingShare)} |`,
    `| 契约覆盖缺失 | ${summary.unknownReasons.contractUnknownCount} | ${percent(summary.unknownReasons.contractShare)} |`,
    `| 必需运行时证据缺失 | ${summary.unknownReasons.runtimeUnknownCount} | ${percent(summary.unknownReasons.runtimeShare)} |`,
    "",
    "## 论文写入判断",
    "",
    "- 三值保守策略是否保留：看 `unknown-as-fold` 是否产生不实折叠。",
    "- `observation_projection` 是否作为贡献：看 `disable-projection` 是否改变状态。若改变为 0，只能写成内部契约设计，不能声称实验有效。",
    "- LLM 文档候选是否进入主线：看绑定未解析占比。若大多数 UNKNOWN 由静态绑定导致，候选 API 名称补全不能解决主瓶颈。",
    `- LLM 证据权限测试：仅提供 LLM 候选时，本次评测产生 ${summary.llmGate.stateCounts.FOLD} 个 FOLD。若为 0，说明 LLM 当前只能做候选层，不能替代真实运行时证据。`,
    "- 有限探测排序是否可替代全量观测：需要 `priority-models.py` 的预算实验，排序只优化顺序，不能为未探测对象提供安全证据。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parseFeatureAblationArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/feature-ablation"),
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    corpusLimit: 3000,
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
  const options = parseFeatureAblationArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/feature-ablation.mjs [options]",
        "",
        "Options:",
        "  --out <path>          Output directory",
        "  --corpus <path>       Real miniapp JSONL corpus",
        "  --corpus-limit <n>    Maximum deduplicated rows",
        "  --per-entity-cap <n>  Stratified sample: keep at most n records per entity",
      ].join("\n"),
    );
  } else {
    const summary = await runFeatureAblation(options);
    console.log(
      JSON.stringify(
        {
          ...summary,
          rankingFeatures: {
            targetRuntimeIds: summary.rankingFeatures.targetRuntimeIds,
            entityCount: summary.rankingFeatures.entities.length,
            positiveCount: summary.rankingFeatures.entities.filter(
              (entity) => entity.label === 1,
            ).length,
          },
        },
        null,
        2,
      ),
    );
  }
}
