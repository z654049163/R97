import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BINDING_KIND,
  EVIDENCE_PROVENANCE,
  KNOWLEDGE_STATE,
  RESOLUTION_STATUS,
  SEMANTIC_DIMENSION,
  TARGET_RUNTIME_SOURCE,
  TRANSFORMATION_KIND,
} from "../constants.mjs";
import { decideProtection } from "../decision-engine.mjs";
import {
  createDecisionQuery,
  createEvidenceRecord,
  createRuntimeObservation,
  createSemanticContract,
} from "../model.mjs";

const EVALUATOR_RUNTIME = "language";
const TARGET_RUNTIME = "node";
const POLICY_VERSION = "decision-gate-sensitivity-v1";
const AS_OF = "2026-09-18T00:00:00.000Z";
const BASE_DIMENSIONS = Object.freeze([
  SEMANTIC_DIMENSION.EXISTENCE,
  SEMANTIC_DIMENSION.TYPE,
  SEMANTIC_DIMENSION.CALLABILITY,
]);
const BASE_VALUES = Object.freeze({
  existence: true,
  type: "function",
  callability: true,
});

const CASES = Object.freeze([
  {
    id: "binding-unresolved",
    label: "绑定未解析",
    guard: "绑定解析门槛",
    expectedUnsafeWithoutGuard: true,
    queryOverrides: {
      bindingRef: {
        bindingKind: BINDING_KIND.UNRESOLVED_GLOBAL,
        resolutionStatus: RESOLUTION_STATUS.UNRESOLVED,
      },
    },
  },
  {
    id: "target-runtime-inferred",
    label: "目标运行时只来自静态推断",
    guard: "运行时来源门槛",
    expectedUnsafeWithoutGuard: true,
    queryOverrides: {
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.INFERRED,
    },
  },
  {
    id: "required-runtime-missing",
    label: "契约要求微信运行时，但当前比较没有覆盖微信",
    guard: "必需运行时覆盖",
    expectedUnsafeWithoutGuard: true,
    validityScope: { requiredRuntimeIds: ["wechat"] },
  },
  {
    id: "evidence-missing",
    label: "没有对应的真实运行时证据",
    guard: "证据存在性",
    expectedUnsafeWithoutGuard: true,
    omitEvidence: true,
  },
  {
    id: "evidence-expired",
    label: "证据超出有效期",
    guard: "证据有效期",
    expectedUnsafeWithoutGuard: true,
    validUntil: "2026-09-17T00:00:00.000Z",
  },
  {
    id: "evidence-conflict",
    label: "同一运行时存在冲突观测",
    guard: "冲突阻断",
    expectedUnsafeWithoutGuard: true,
    conflictingEvidence: true,
  },
  {
    id: "evidence-not-fold-eligible",
    label: "只有 LLM 候选，没有可授权 FOLD 的真实观测",
    guard: "证据来源等级",
    expectedUnsafeWithoutGuard: true,
    provenance: EVIDENCE_PROVENANCE.LLM_SUGGESTION,
  },
  {
    id: "policy-version-mismatch",
    label: "证据来自旧策略版本",
    guard: "策略版本有效性",
    expectedUnsafeWithoutGuard: true,
    evidencePolicyVersion: "old-policy",
  },
  {
    id: "wrong-evaluator-scope",
    label: "证据求值运行时与查询作用域不一致",
    guard: "证据作用域身份",
    expectedUnsafeWithoutGuard: true,
    evidenceEvaluatorRuntimeId: "edge",
  },
  {
    id: "contract-coverage-missing",
    label: "契约要求 return_value，但探针没有观测该维度",
    guard: "契约覆盖完整性",
    expectedUnsafeWithoutGuard: true,
    requiredDimensions: [
      ...BASE_DIMENSIONS,
      SEMANTIC_DIMENSION.RETURN_VALUE,
    ],
  },
  {
    id: "forbidden-side-effect",
    label: "值相同，但观测到网络副作用",
    guard: "禁止副作用",
    expectedUnsafeWithoutGuard: true,
    sideEffects: ["network"],
  },
  {
    id: "confirmed-contract-mismatch",
    label: "目标运行时存在明确语义差异",
    guard: "确认差异保护",
    expectedUnsafeWithoutGuard: false,
    targetValues: {
      existence: false,
      type: "undefined",
      callability: false,
    },
  },
]);

export const runDecisionGateSensitivity = ({ outputDir }) => {
  const rows = CASES.map(evaluateCase);
  const summary = {
    generatedAt: new Date().toISOString(),
    description:
      "受控机制实验：逐项关闭决策护栏，比较 R97 护栏与只做字段比较的宽松基线。",
    scopeWarning:
      "该实验用于验证护栏机制，不代表真实语料中的触发频率。环境指纹失效未加入，因为当前证据记录和决策查询还没有携带可比较的运行时环境指纹。",
    caseCount: rows.length,
    counts: {
      guardedFold: rows.filter(
        (row) => row.guardedState === KNOWLEDGE_STATE.FOLD,
      ).length,
      guardedProtect: rows.filter(
        (row) => row.guardedState === KNOWLEDGE_STATE.PROTECT,
      ).length,
      guardedUnknown: rows.filter(
        (row) => row.guardedState === KNOWLEDGE_STATE.UNKNOWN,
      ).length,
      naiveFold: rows.filter(
        (row) => row.naiveState === KNOWLEDGE_STATE.FOLD,
      ).length,
      guardedUnsafeFolds: rows.filter(
        (row) => !row.expectedSafe && row.guardedState === KNOWLEDGE_STATE.FOLD,
      ).length,
      naiveUnsafeFolds: rows.filter(
        (row) => !row.expectedSafe && row.naiveState === KNOWLEDGE_STATE.FOLD,
      ).length,
      preventedUnsafeFolds: rows.filter(
        (row) =>
          !row.expectedSafe &&
          row.guardedState !== KNOWLEDGE_STATE.FOLD &&
          row.naiveState === KNOWLEDGE_STATE.FOLD,
      ).length,
    },
    rows,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "decision-gate-sensitivity.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "decision-gate-sensitivity.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const evaluateCase = (testCase) => {
  const fixture = buildFixture(testCase);
  const guarded = decideProtection({
    query: fixture.query,
    semanticContract: fixture.contract,
    evidenceRecords: fixture.evidenceRecords,
    asOf: AS_OF,
  });
  const naive = naiveDecideProtection(fixture);

  return {
    id: testCase.id,
    label: testCase.label,
    guard: testCase.guard,
    expectedSafe: !testCase.expectedUnsafeWithoutGuard,
    guardedState: guarded.knowledgeState,
    guardedReasonCodes: guarded.reasonCodes,
    naiveState: naive,
    preventedUnsafeFold:
      testCase.expectedUnsafeWithoutGuard &&
      guarded.knowledgeState !== KNOWLEDGE_STATE.FOLD &&
      naive === KNOWLEDGE_STATE.FOLD,
  };
};

const buildFixture = (testCase) => {
  const usageContextId = `${testCase.id}:context`;
  const requiredDimensions = testCase.requiredDimensions ?? BASE_DIMENSIONS;
  const contract = createSemanticContract({
    contractId: `${testCase.id}:contract`,
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    usageContextId,
    requiredDimensions,
    observationProjection: [
      ...new Set([...requiredDimensions, ...BASE_DIMENSIONS]),
    ],
    validityScope: testCase.validityScope ?? {},
  });
  const query = createDecisionQuery({
    queryId: `${testCase.id}:query`,
    programPointId: `${testCase.id}:point`,
    entityId: `entity:${testCase.id}`,
    bindingRef: {
      bindingKind: BINDING_KIND.RUNTIME_GLOBAL,
      resolutionStatus: RESOLUTION_STATUS.RESOLVED,
    },
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    usageContextId,
    targetRuntimeIds: [TARGET_RUNTIME],
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: EVALUATOR_RUNTIME,
    semanticContractId: contract.contractId,
    policyVersion: POLICY_VERSION,
    ...testCase.queryOverrides,
  });

  const evaluatorObservation = createRuntimeObservation({
    runtimeProfileId: EVALUATOR_RUNTIME,
    observedDimensions: BASE_DIMENSIONS,
    values: BASE_VALUES,
  });
  const targetObservation = createRuntimeObservation({
    runtimeProfileId: TARGET_RUNTIME,
    observedDimensions: BASE_DIMENSIONS,
    values: {
      ...BASE_VALUES,
      ...(testCase.targetValues ?? {}),
    },
    sideEffects: testCase.sideEffects ?? [],
  });
  const observations = {
    [EVALUATOR_RUNTIME]: evaluatorObservation,
    [TARGET_RUNTIME]: targetObservation,
  };
  const evidenceRecords = testCase.omitEvidence
    ? []
    : [
        createEvidenceRecord({
          evidenceId: `${testCase.id}:evidence`,
          entityId: query.entityId,
          usageContextId,
          semanticContractId: contract.contractId,
          evaluatorRuntimeId:
            testCase.evidenceEvaluatorRuntimeId ?? query.evaluatorRuntimeId,
          observations,
          provenance:
            testCase.provenance ?? EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
          validUntil: testCase.validUntil ?? null,
          policyVersion:
            testCase.evidencePolicyVersion ?? query.policyVersion,
        }),
      ];

  if (testCase.conflictingEvidence) {
    evidenceRecords.push(
      createEvidenceRecord({
        evidenceId: `${testCase.id}:conflict-evidence`,
        entityId: query.entityId,
        usageContextId,
        semanticContractId: contract.contractId,
        evaluatorRuntimeId: query.evaluatorRuntimeId,
        observations: {
          [EVALUATOR_RUNTIME]: evaluatorObservation,
          [TARGET_RUNTIME]: createRuntimeObservation({
            runtimeProfileId: TARGET_RUNTIME,
            observedDimensions: BASE_DIMENSIONS,
            values: {
              existence: true,
              type: "string",
              callability: false,
            },
          }),
        },
        provenance: EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
        policyVersion: query.policyVersion,
      }),
    );
  }

  return {
    query,
    contract,
    evidenceRecords,
    referenceObservations: observations,
  };
};

const naiveDecideProtection = ({ query, contract, referenceObservations }) => {
  const evaluator = referenceObservations[query.evaluatorRuntimeId];
  for (const targetRuntimeId of query.targetRuntimeIds) {
    const target = referenceObservations[targetRuntimeId];
    for (const dimension of contract.requiredDimensions) {
      if (
        !evaluator.observedDimensions.includes(dimension) ||
        !target.observedDimensions.includes(dimension)
      ) {
        continue;
      }
      if (evaluator.values[dimension] !== target.values[dimension]) {
        return KNOWLEDGE_STATE.PROTECT;
      }
    }
  }
  return KNOWLEDGE_STATE.FOLD;
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 决策护栏受控敏感性实验",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    summary.description,
    "",
    `> ${summary.scopeWarning}`,
    "",
    `护栏决策：FOLD ${summary.counts.guardedFold} / PROTECT ${summary.counts.guardedProtect} / UNKNOWN ${summary.counts.guardedUnknown}；`,
    `宽松基线决策：FOLD ${summary.counts.naiveFold}。`,
    `护栏阻止的不安全折叠：${summary.counts.preventedUnsafeFolds}；护栏自身错误 FOLD：${summary.counts.guardedUnsafeFolds}。`,
    "",
    "| 样例 | 护栏 | R97 | 宽松基线 | 阻断不安全折叠 | 说明 |",
    "|---|---|---|---|---|---|",
  ];

  for (const row of summary.rows) {
    lines.push(
      `| ${row.id} | ${row.guard} | ${row.guardedState} (${row.guardedReasonCodes.join(", ")}) | ${row.naiveState} | ${
        !row.expectedSafe &&
        row.guardedState !== KNOWLEDGE_STATE.FOLD &&
        row.naiveState === KNOWLEDGE_STATE.FOLD
          ? "是"
          : "否"
      } | ${row.label} |`,
    );
  }

  lines.push(
    "",
    "## 判断",
    "",
    "- 绑定解析、运行时来源、必需运行时覆盖、证据存在性、有效期、冲突、来源等级、作用域身份、契约完整性和副作用限制都在受控样例中有明确阻断作用。",
    "- 这些结果说明护栏是机制上必要的，但不说明每个护栏在真实语料中的触发频率都很高。",
    "- 环境指纹失效没有进入当前实现，也没有真实样本支持；本轮不把它写进论文主贡献。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parseDecisionGateSensitivityArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/feature-ablation"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--out":
        options.outputDir = path.resolve(argv[index + 1]);
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
  const options = parseDecisionGateSensitivityArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/decision-gate-sensitivity.mjs [options]",
        "",
        "Options:",
        "  --out <path>   Output directory",
      ].join("\n"),
    );
  } else {
    const summary = runDecisionGateSensitivity(options);
    console.log(JSON.stringify(summary, null, 2));
  }
}
