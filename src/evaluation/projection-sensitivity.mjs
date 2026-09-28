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
const POLICY_VERSION = "projection-sensitivity-v1";
const ALL_DIMENSIONS = Object.freeze(Object.values(SEMANTIC_DIMENSION));

const CASES = Object.freeze([
  {
    id: "ignored-callback-differs",
    label: "回调未参与变换，但两个运行时的 callback_behavior 不同",
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    callbackPresence: false,
    returnValueUsage: false,
    awaited: false,
    targetDifference: SEMANTIC_DIMENSION.CALLBACK_BEHAVIOR,
    expectedProjectedState: KNOWLEDGE_STATE.FOLD,
    expectedAllDimensionsState: KNOWLEDGE_STATE.PROTECT,
    expectedSafe: true,
  },
  {
    id: "ignored-return-differs",
    label: "返回值没有被使用，但两个运行时的 return_value 不同",
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    callbackPresence: false,
    returnValueUsage: false,
    awaited: false,
    targetDifference: SEMANTIC_DIMENSION.RETURN_VALUE,
    expectedProjectedState: KNOWLEDGE_STATE.FOLD,
    expectedAllDimensionsState: KNOWLEDGE_STATE.PROTECT,
    expectedSafe: true,
  },
  {
    id: "not-awaited-async-differs",
    label: "调用没有被 await，但两个运行时的 async_behavior 不同",
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    callbackPresence: false,
    returnValueUsage: false,
    awaited: false,
    targetDifference: SEMANTIC_DIMENSION.ASYNC_BEHAVIOR,
    expectedProjectedState: KNOWLEDGE_STATE.FOLD,
    expectedAllDimensionsState: KNOWLEDGE_STATE.PROTECT,
    expectedSafe: true,
  },
  {
    id: "callback-is-used",
    label: "回调参与变换，callback_behavior 不同",
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    callbackPresence: true,
    returnValueUsage: false,
    awaited: false,
    targetDifference: SEMANTIC_DIMENSION.CALLBACK_BEHAVIOR,
    expectedProjectedState: KNOWLEDGE_STATE.PROTECT,
    expectedAllDimensionsState: KNOWLEDGE_STATE.PROTECT,
    expectedSafe: true,
  },
  {
    id: "return-value-is-used",
    label: "返回值参与变换，return_value 不同",
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    callbackPresence: false,
    returnValueUsage: true,
    awaited: false,
    targetDifference: SEMANTIC_DIMENSION.RETURN_VALUE,
    expectedProjectedState: KNOWLEDGE_STATE.PROTECT,
    expectedAllDimensionsState: KNOWLEDGE_STATE.PROTECT,
    expectedSafe: true,
  },
  {
    id: "awaited-async-differs",
    label: "调用被 await，async_behavior 不同",
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    callbackPresence: false,
    returnValueUsage: false,
    awaited: true,
    targetDifference: SEMANTIC_DIMENSION.ASYNC_BEHAVIOR,
    expectedProjectedState: KNOWLEDGE_STATE.PROTECT,
    expectedAllDimensionsState: KNOWLEDGE_STATE.PROTECT,
    expectedSafe: true,
  },
  {
    id: "existence-differs",
    label: "实体存在性不同",
    transformationKind: TRANSFORMATION_KIND.CONST_EVAL,
    callbackPresence: false,
    returnValueUsage: false,
    awaited: false,
    targetDifference: SEMANTIC_DIMENSION.EXISTENCE,
    expectedProjectedState: KNOWLEDGE_STATE.PROTECT,
    expectedAllDimensionsState: KNOWLEDGE_STATE.PROTECT,
    expectedSafe: true,
  },
]);

export const runProjectionSensitivity = ({ outputDir }) => {
  const rows = CASES.map(evaluateCase);
  const summary = {
    generatedAt: new Date().toISOString(),
    description:
      "受控机制实验：只检验 observation_projection 在无关维度差异出现时能否避免过度保护。",
    scopeWarning:
      "该实验使用人工观测，不代表真实语料上的频率或收益；真实探针当前仅稳定产出 existence/type/callability。",
    caseCount: rows.length,
    counts: {
      projectedFold: rows.filter(
        (row) => row.projectedState === KNOWLEDGE_STATE.FOLD,
      ).length,
      projectedProtect: rows.filter(
        (row) => row.projectedState === KNOWLEDGE_STATE.PROTECT,
      ).length,
      allDimensionsFold: rows.filter(
        (row) => row.allDimensionsState === KNOWLEDGE_STATE.FOLD,
      ).length,
      allDimensionsProtect: rows.filter(
        (row) => row.allDimensionsState === KNOWLEDGE_STATE.PROTECT,
      ).length,
      projectedUnsafeFolds: rows.filter(
        (row) => row.projectedState === KNOWLEDGE_STATE.FOLD && !row.expectedSafe,
      ).length,
      projectedOverprotectionAvoided: rows.filter(
        (row) =>
          row.projectedState === KNOWLEDGE_STATE.FOLD &&
          row.allDimensionsState === KNOWLEDGE_STATE.PROTECT &&
          row.expectedSafe,
      ).length,
    },
    rows,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "projection-sensitivity.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "projection-sensitivity.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const evaluateCase = (testCase) => {
  const fixture = buildFixture(testCase);
  const projected = decideProtection({
    query: fixture.query,
    semanticContract: fixture.projectedContract,
    evidenceRecords: fixture.evidenceRecords,
    asOf: "2026-09-18T00:00:00.000Z",
  });
  const allDimensions = decideProtection({
    query: fixture.allDimensionsQuery,
    semanticContract: fixture.allDimensionsContract,
    evidenceRecords: fixture.allDimensionsEvidenceRecords,
    asOf: "2026-09-18T00:00:00.000Z",
  });

  return {
    id: testCase.id,
    label: testCase.label,
    expectedSafe: testCase.expectedSafe,
    projectedState: projected.knowledgeState,
    projectedReasonCodes: projected.reasonCodes,
    allDimensionsState: allDimensions.knowledgeState,
    allDimensionsReasonCodes: allDimensions.reasonCodes,
    avoidsOverprotection:
      testCase.expectedSafe &&
      projected.knowledgeState === KNOWLEDGE_STATE.FOLD &&
      allDimensions.knowledgeState !== KNOWLEDGE_STATE.FOLD,
  };
};

const buildFixture = (testCase) => {
  const usageContextId = `${testCase.id}:context`;
  const requiredDimensions = requiredDimensionsFor(testCase);
  const projection = [...new Set([...requiredDimensions, testCase.targetDifference])];
  const evaluator = observationFor({
    runtimeId: EVALUATOR_RUNTIME,
    dimensions: projection,
    targetDifference: testCase.targetDifference,
    different: false,
  });
  const target = observationFor({
    runtimeId: TARGET_RUNTIME,
    dimensions: projection,
    targetDifference: testCase.targetDifference,
    different: true,
  });
  const projectedContract = createSemanticContract({
    contractId: `${testCase.id}:projected-contract`,
    transformationKind: testCase.transformationKind,
    usageContextId,
    requiredDimensions,
    observationProjection: projection,
  });
  const allDimensionsContract = createSemanticContract({
    contractId: `${testCase.id}:all-contract`,
    transformationKind: testCase.transformationKind,
    usageContextId,
    requiredDimensions: ALL_DIMENSIONS,
    observationProjection: ALL_DIMENSIONS,
  });
  const query = createDecisionQuery({
    queryId: `${testCase.id}:query`,
    programPointId: `${testCase.id}:point`,
    entityId: `entity:${testCase.id}`,
    bindingRef: {
      bindingKind: BINDING_KIND.RUNTIME_GLOBAL,
      resolutionStatus: RESOLUTION_STATUS.RESOLVED,
    },
    transformationKind: testCase.transformationKind,
    usageContextId,
    targetRuntimeIds: [TARGET_RUNTIME],
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: EVALUATOR_RUNTIME,
    semanticContractId: projectedContract.contractId,
    policyVersion: POLICY_VERSION,
  });
  const evidenceRecords = [
    createEvidenceRecord({
      evidenceId: `${testCase.id}:evidence`,
      entityId: query.entityId,
      usageContextId,
      semanticContractId: projectedContract.contractId,
      evaluatorRuntimeId: EVALUATOR_RUNTIME,
      observations: {
        [EVALUATOR_RUNTIME]: evaluator,
        [TARGET_RUNTIME]: target,
      },
      provenance: EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
      policyVersion: POLICY_VERSION,
    }),
  ];
  const allDimensionsQuery = {
    ...query,
    semanticContractId: allDimensionsContract.contractId,
  };
  const allDimensionsEvidenceRecords = [
    createEvidenceRecord({
      evidenceId: `${testCase.id}:all-evidence`,
      entityId: query.entityId,
      usageContextId,
      semanticContractId: allDimensionsContract.contractId,
      evaluatorRuntimeId: EVALUATOR_RUNTIME,
      observations: {
        [EVALUATOR_RUNTIME]: observationFor({
          runtimeId: EVALUATOR_RUNTIME,
          dimensions: ALL_DIMENSIONS,
          targetDifference: testCase.targetDifference,
          different: false,
        }),
        [TARGET_RUNTIME]: observationFor({
          runtimeId: TARGET_RUNTIME,
          dimensions: ALL_DIMENSIONS,
          targetDifference: testCase.targetDifference,
          different: true,
        }),
      },
      provenance: EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
      policyVersion: POLICY_VERSION,
    }),
  ];

  return {
    query,
    allDimensionsQuery,
    projectedContract,
    allDimensionsContract,
    evidenceRecords,
    allDimensionsEvidenceRecords,
  };
};

const requiredDimensionsFor = (testCase) => {
  const dimensions = new Set([
    SEMANTIC_DIMENSION.EXISTENCE,
    SEMANTIC_DIMENSION.TYPE,
  ]);

  if (testCase.transformationKind !== TRANSFORMATION_KIND.CONST_EVAL) {
    dimensions.add(SEMANTIC_DIMENSION.CALLABILITY);
  }
  if (testCase.callbackPresence) {
    dimensions.add(SEMANTIC_DIMENSION.CALLBACK_BEHAVIOR);
  }
  if (testCase.returnValueUsage) {
    dimensions.add(SEMANTIC_DIMENSION.RETURN_VALUE);
  }
  if (testCase.awaited) {
    dimensions.add(SEMANTIC_DIMENSION.ASYNC_BEHAVIOR);
  }
  return [...dimensions];
};

const observationFor = ({
  runtimeId,
  dimensions,
  targetDifference,
  different,
}) => {
  const values = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      valueForDimension(dimension, { different, targetDifference }),
    ]),
  );
  return createRuntimeObservation({
    runtimeProfileId: runtimeId,
    observedDimensions: dimensions,
    values,
    sideEffects: [],
  });
};

const valueForDimension = (
  dimension,
  { different, targetDifference },
) => {
  if (dimension === SEMANTIC_DIMENSION.EXISTENCE) {
    return different && targetDifference === dimension ? false : true;
  }
  if (dimension === SEMANTIC_DIMENSION.TYPE) {
    return different && targetDifference === dimension ? "string" : "function";
  }
  if (dimension === SEMANTIC_DIMENSION.CALLABILITY) {
    return different && targetDifference === dimension ? false : true;
  }
  if (dimension === SEMANTIC_DIMENSION.RETURN_VALUE) {
    return different && targetDifference === dimension ? "target-value" : "base-value";
  }
  if (dimension === SEMANTIC_DIMENSION.EXCEPTION) {
    return different && targetDifference === dimension ? "target-error" : null;
  }
  if (dimension === SEMANTIC_DIMENSION.ASYNC_BEHAVIOR) {
    return different && targetDifference === dimension
      ? "deferred-other-order"
      : "deferred-stable";
  }
  if (dimension === SEMANTIC_DIMENSION.CALLBACK_BEHAVIOR) {
    return different && targetDifference === dimension
      ? "callback-called-twice"
      : "callback-called-once";
  }
  if (dimension === SEMANTIC_DIMENSION.SIDE_EFFECT) {
    return different && targetDifference === dimension ? "network" : "none";
  }
  if (dimension === SEMANTIC_DIMENSION.PERMISSION) {
    return different && targetDifference === dimension ? "granted" : "unchanged";
  }
  throw new TypeError(`Unsupported dimension: ${dimension}`);
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 observation_projection 受控敏感性实验",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    summary.description,
    "",
    `> ${summary.scopeWarning}`,
    "",
    `样例数：${summary.caseCount}。投影决策：FOLD ${summary.counts.projectedFold} / PROTECT ${summary.counts.projectedProtect}；`,
    `全维度决策：FOLD ${summary.counts.allDimensionsFold} / PROTECT ${summary.counts.allDimensionsProtect}。`,
    `投影避免的过度保护：${summary.counts.projectedOverprotectionAvoided}；投影造成的错误 FOLD：${summary.counts.projectedUnsafeFolds}。`,
    "",
    "| 样例 | 投影 | 全维度比较 | 投影避免过度保护 | 说明 |",
    "|---|---|---|---|---|",
  ];

  for (const row of summary.rows) {
    lines.push(
      `| ${row.id} | ${row.projectedState} | ${row.allDimensionsState} | ${row.avoidsOverprotection ? "是" : "否"} | ${row.label} |`,
    );
  }

  lines.push(
    "",
    "## 判断",
    "",
    "- 受控样例说明：只有在“无关维度存在差异”时，投影才会产生可观察收益。",
    "- 现有真实语料的关闭投影结果改变数为 0，因为当前探针只稳定产出存在性、类型和可调用性。",
    "- 因此当前证据支持把投影保留为契约设计，但不支持把它写成已经由真实数据证明有效的主贡献。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parseProjectionSensitivityArgs = (argv) => {
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
  const options = parseProjectionSensitivityArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/projection-sensitivity.mjs [options]",
        "",
        "Options:",
        "  --out <path>   Output directory",
      ].join("\n"),
    );
  } else {
    const summary = runProjectionSensitivity(options);
    console.log(JSON.stringify(summary, null, 2));
  }
}
