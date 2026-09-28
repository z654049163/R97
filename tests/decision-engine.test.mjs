import test from "node:test";
import assert from "node:assert/strict";

import {
  BINDING_KIND,
  KNOWLEDGE_STATE,
  REASON_CODE,
  REQUIRED_RUNTIME_STATUS,
  RESOLUTION_STATUS,
  SEMANTIC_DIMENSION,
  TARGET_RUNTIME_SOURCE,
  TARGET_RUNTIME_STATUS,
  TRANSFORMATION_KIND,
  UNCERTAINTY_SOURCE,
} from "../src/constants.mjs";
import { decideProtection } from "../src/decision-engine.mjs";
import {
  createBindingRef,
  createDecisionQuery,
  createEvidenceRecord,
  createRuntimeObservation,
  createSemanticContract,
} from "../src/model.mjs";

const AS_OF = "2026-09-17T12:00:00.000Z";

const createQuery = ({
  bindingKind = BINDING_KIND.RUNTIME_GLOBAL,
  resolutionStatus = RESOLUTION_STATUS.RESOLVED,
  targetRuntimeIds = ["node-24"],
  targetRuntimeSource = TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
  targetRuntimeStatus = null,
} = {}) =>
  createDecisionQuery({
    queryId: "query-1",
    programPointId: "program-point-1",
    entityId: "wx.request",
    bindingRef: createBindingRef({
      bindingRefId: "binding-1",
      bindingKind,
      bindingOrigin: "global",
      resolutionStatus,
    }),
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    usageContextId: "call-no-args",
    targetRuntimeIds,
    targetRuntimeSource,
    targetRuntimeStatus,
    evaluatorRuntimeId: "node-24",
    semanticContractId: "contract-1",
    policyVersion: "policy-1",
  });

const createContract = ({
  requiredDimensions = [SEMANTIC_DIMENSION.EXISTENCE],
  observationProjection = [SEMANTIC_DIMENSION.EXISTENCE],
  comparisonPredicate = "strict_equal",
  validityScope = {},
} = {}) =>
  createSemanticContract({
    contractId: "contract-1",
    transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
    usageContextId: "call-no-args",
    requiredDimensions,
    observationProjection,
    comparisonPredicate,
    validityScope,
  });

const createEvidence = ({
  evidenceId = "evidence-1",
  observations = {
    "node-24": createRuntimeObservation({
      runtimeProfileId: "node-24",
      observedDimensions: [SEMANTIC_DIMENSION.EXISTENCE],
      values: { [SEMANTIC_DIMENSION.EXISTENCE]: true },
    }),
  },
  policyVersion = "policy-1",
  validFrom = "2026-09-01T00:00:00.000Z",
  validUntil = "2026-10-01T00:00:00.000Z",
} = {}) =>
  createEvidenceRecord({
    evidenceId,
    entityId: "wx.request",
    usageContextId: "call-no-args",
    semanticContractId: "contract-1",
    evaluatorRuntimeId: "node-24",
    observations,
    provenance: "runtime_observed",
    validFrom,
    validUntil,
    policyVersion,
  });

const observation = ({
  runtimeId,
  exists = true,
  sideEffects = [],
}) =>
  createRuntimeObservation({
    runtimeProfileId: runtimeId,
    observedDimensions: [SEMANTIC_DIMENSION.EXISTENCE],
    values: { [SEMANTIC_DIMENSION.EXISTENCE]: exists },
    sideEffects,
  });

test("未解析绑定直接返回 UNKNOWN 并阻断折叠", () => {
  const decision = decideProtection({
    query: createQuery({
      resolutionStatus: RESOLUTION_STATUS.UNRESOLVED,
    }),
    semanticContract: createContract(),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.equal(decision.enforcementAction, "BLOCK_FOLD");
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.BINDING_UNRESOLVED]);
});

test("动态绑定直接返回 UNKNOWN", () => {
  const decision = decideProtection({
    query: createQuery({
      bindingKind: BINDING_KIND.DYNAMIC,
      resolutionStatus: RESOLUTION_STATUS.RESOLVED,
    }),
    semanticContract: createContract(),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.BINDING_UNRESOLVED]);
});

test("UNKNOWN 按可消除它的层归类到不同来源", () => {
  const binding = decideProtection({
    query: createQuery({
      resolutionStatus: RESOLUTION_STATUS.UNRESOLVED,
    }),
    semanticContract: createContract(),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });
  assert.equal(
    binding.uncertaintySource,
    UNCERTAINTY_SOURCE.BINDING,
  );

  const runtime = decideProtection({
    query: createQuery({
      targetRuntimeIds: ["wechat-real"],
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.DECLARED,
    }),
    semanticContract: createContract({
      validityScope: { requiredRuntimeIds: ["wechat-real"] },
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });
  assert.equal(runtime.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.equal(
    runtime.uncertaintySource,
    UNCERTAINTY_SOURCE.RUNTIME,
  );

  const behavior = decideProtection({
    query: createQuery({ targetRuntimeStatus: TARGET_RUNTIME_STATUS.CONFIRMED }),
    semanticContract: createSemanticContract({
      contractId: "contract-other",
      transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
      usageContextId: "call-no-args",
      requiredDimensions: [
        SEMANTIC_DIMENSION.EXISTENCE,
      ],
      observationProjection: [SEMANTIC_DIMENSION.EXISTENCE],
      comparisonPredicate: "strict_equal",
      validityScope: {},
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });
  assert.equal(behavior.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.equal(
    behavior.uncertaintySource,
    UNCERTAINTY_SOURCE.BEHAVIOR,
  );
});

test("FOLD 与 PROTECT 不带未决来源", () => {
  const fold = decideProtection({
    query: createQuery({ targetRuntimeStatus: TARGET_RUNTIME_STATUS.CONFIRMED }),
    semanticContract: createContract(),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });
  assert.equal(fold.knowledgeState, KNOWLEDGE_STATE.FOLD);
  assert.equal(fold.uncertaintySource, null);

  const protect = decideProtection({
    query: createQuery({ targetRuntimeStatus: TARGET_RUNTIME_STATUS.CONFIRMED }),
    semanticContract: createContract({
      validityScope: { requiredRuntimeIds: ["wechat-real"] },
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });
  assert.equal(protect.knowledgeState, KNOWLEDGE_STATE.PROTECT);
  assert.equal(protect.uncertaintySource, null);
});

test("宿主专属 API 未纳入目标运行时直接保护", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: ["node-24"],
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.CONFIRMED,
    }),
    semanticContract: createContract({
      validityScope: { requiredRuntimeIds: ["wechat-real"] },
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.PROTECT);
  assert.equal(decision.enforcementAction, "BLOCK_FOLD");
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.REQUIRED_RUNTIME_MISSING,
  ]);
});

test("目标只被声明时，缺少必需运行时不能升级为 PROTECT", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: ["node-24"],
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.DECLARED,
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.DECLARED,
    }),
    semanticContract: createContract({
      validityScope: {
        requiredRuntimeIds: ["wechat-real"],
        requiredRuntimeStatus: REQUIRED_RUNTIME_STATUS.DEFINITE,
      },
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.TARGET_RUNTIME_UNCONFIRMED,
  ]);
});

test("目标状态未知时，缺少必需运行时返回 UNKNOWN", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: [],
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.UNKNOWN,
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.UNKNOWN,
    }),
    semanticContract: createContract({
      validityScope: {
        requiredRuntimeIds: ["wechat-real"],
        requiredRuntimeStatus: REQUIRED_RUNTIME_STATUS.DEFINITE,
      },
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.TARGET_RUNTIME_UNCONFIRMED,
  ]);
});

for (const requiredRuntimeStatus of [
  REQUIRED_RUNTIME_STATUS.POSSIBLE,
  REQUIRED_RUNTIME_STATUS.AMBIGUOUS,
]) {
  test(`required 为 ${requiredRuntimeStatus} 时不能升级为 confirmed`, () => {
    const decision = decideProtection({
      query: createQuery({
        targetRuntimeIds: ["node-24"],
        targetRuntimeStatus: TARGET_RUNTIME_STATUS.CONFIRMED,
      }),
      semanticContract: createContract({
        validityScope: {
          requiredRuntimeIds: ["wechat-real"],
          requiredRuntimeStatus,
        },
      }),
      evidenceRecords: [createEvidence()],
      asOf: AS_OF,
    });

    assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
    assert.deepEqual(decision.reasonCodes, [
      REASON_CODE.REQUIRED_RUNTIME_AMBIGUOUS,
    ]);
  });
}

test("弱来源目标即使观察到语义差异也不能单独硬 PROTECT", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: ["node-24", "wx-real"],
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.INFERRED,
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.INFERRED,
    }),
    semanticContract: createContract({
      validityScope: {
        requiredRuntimeIds: ["wechat-real"],
        requiredRuntimeStatus: REQUIRED_RUNTIME_STATUS.DEFINITE,
      },
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.TARGET_RUNTIME_INFERRED,
  ]);
});

test("未确认目标不能仅凭完整匹配证据授权 FOLD", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: ["language"],
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.UNKNOWN,
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.UNKNOWN,
    }),
    semanticContract: createContract({
      validityScope: {
        requiredRuntimeIds: ["language"],
        requiredRuntimeStatus: REQUIRED_RUNTIME_STATUS.DEFINITE,
      },
    }),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24" }),
          language: observation({ runtimeId: "language" }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.TARGET_RUNTIME_UNCONFIRMED,
  ]);
});

test("推断目标运行时即使证据匹配也不能 FOLD", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.INFERRED,
    }),
    semanticContract: createContract(),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.TARGET_RUNTIME_INFERRED]);
});

test("缺少证据返回 UNKNOWN 和 EVIDENCE_MISSING", () => {
  const decision = decideProtection({
    query: createQuery(),
    semanticContract: createContract(),
    evidenceRecords: [],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.EVIDENCE_MISSING]);
});

test("UNKNOWN 在补齐有效证据后可以变为 FOLD", () => {
  const query = createQuery();
  const semanticContract = createContract();

  const beforeEvidence = decideProtection({
    query,
    semanticContract,
    evidenceRecords: [],
    asOf: AS_OF,
  });
  const afterEvidence = decideProtection({
    query,
    semanticContract,
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(beforeEvidence.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.equal(afterEvidence.knowledgeState, KNOWLEDGE_STATE.FOLD);
  assert.equal(beforeEvidence.enforcementAction, "BLOCK_FOLD");
  assert.equal(afterEvidence.enforcementAction, "ALLOW_FOLD");
});

test("过期证据返回 UNKNOWN 和 EVIDENCE_EXPIRED", () => {
  const decision = decideProtection({
    query: createQuery(),
    semanticContract: createContract(),
    evidenceRecords: [
      createEvidence({
        validUntil: "2026-09-10T00:00:00.000Z",
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.EVIDENCE_EXPIRED]);
  assert.deepEqual(decision.evidenceIds, ["evidence-1"]);
});

test("旧名单或模型建议不能单独支持 FOLD", () => {
  const legacyEvidence = createEvidence();
  const decision = decideProtection({
    query: createQuery(),
    semanticContract: createContract(),
    evidenceRecords: [
      {
        ...legacyEvidence,
        provenance: "legacy_seed",
      },
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.EVIDENCE_NOT_FOLD_ELIGIBLE,
  ]);
});

test("低等级证据发现差异时仍然返回 PROTECT", () => {
  const legacyEvidence = createEvidence({
    observations: {
      "node-24": observation({ runtimeId: "node-24", exists: true }),
      "wx-real": observation({ runtimeId: "wx-real", exists: false }),
    },
  });
  const decision = decideProtection({
    query: createQuery({ targetRuntimeIds: ["node-24", "wx-real"] }),
    semanticContract: createContract(),
    evidenceRecords: [
      {
        ...legacyEvidence,
        provenance: "human_review",
      },
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.PROTECT);
  assert.ok(decision.reasonCodes.includes(REASON_CODE.CONTRACT_MISMATCH));
});

test("契约覆盖不完整直接返回 UNKNOWN", () => {
  const decision = decideProtection({
    query: createQuery(),
    semanticContract: createContract({
      requiredDimensions: [
        SEMANTIC_DIMENSION.EXISTENCE,
        SEMANTIC_DIMENSION.CALLABILITY,
      ],
      observationProjection: [
        SEMANTIC_DIMENSION.EXISTENCE,
        SEMANTIC_DIMENSION.CALLABILITY,
      ],
    }),
    evidenceRecords: [createEvidence()],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.CONTRACT_COVERAGE_MISSING,
  ]);
});

test("已观测维度出现明确差异时无需等待全部语义证据即可保护", () => {
  const decision = decideProtection({
    query: createQuery({ targetRuntimeIds: ["node-24", "wx-real"] }),
    semanticContract: createContract({
      requiredDimensions: [
        SEMANTIC_DIMENSION.EXISTENCE,
        SEMANTIC_DIMENSION.SIDE_EFFECT,
      ],
      observationProjection: [
        SEMANTIC_DIMENSION.EXISTENCE,
        SEMANTIC_DIMENSION.SIDE_EFFECT,
      ],
    }),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24", exists: true }),
          "wx-real": observation({ runtimeId: "wx-real", exists: false }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.PROTECT);
  assert.equal(decision.enforcementAction, "BLOCK_FOLD");
  assert.ok(decision.reasonCodes.includes(REASON_CODE.CONTRACT_MISMATCH));
});

test("语义值不一致返回 PROTECT", () => {
  const decision = decideProtection({
    query: createQuery({ targetRuntimeIds: ["node-24", "wx-real"] }),
    semanticContract: createContract(),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24", exists: true }),
        },
      }),
      createEvidence({
        evidenceId: "evidence-2",
        observations: {
          "wx-real": observation({ runtimeId: "wx-real", exists: false }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.PROTECT);
  assert.equal(decision.enforcementAction, "BLOCK_FOLD");
  assert.ok(decision.reasonCodes.includes(REASON_CODE.CONTRACT_MISMATCH));
});

test("禁止副作用返回 PROTECT", () => {
  const decision = decideProtection({
    query: createQuery(),
    semanticContract: createContract(),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({
            runtimeId: "node-24",
            sideEffects: ["network"],
          }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.PROTECT);
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.FORBIDDEN_SIDE_EFFECT]);
});

test("所有目标运行时契约一致时返回 FOLD", () => {
  const decision = decideProtection({
    query: createQuery({ targetRuntimeIds: ["node-24", "wx-real"] }),
    semanticContract: createContract(),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24" }),
          "wx-real": observation({ runtimeId: "wx-real" }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.FOLD);
  assert.equal(decision.enforcementAction, "ALLOW_FOLD");
  assert.equal(decision.decisionScope, "runtime_semantics_only");
  assert.equal(decision.requiresBaseTransformationVerification, true);
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.ALL_TARGETS_MATCH]);
});

test("多目标运行时中 PROTECT 优先于 UNKNOWN", () => {
  const decision = decideProtection({
    query: createQuery({ targetRuntimeIds: ["node-24", "wx-real"] }),
    semanticContract: createContract(),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24", exists: true }),
          "wx-real": observation({ runtimeId: "wx-real", exists: false }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.PROTECT);
  assert.ok(decision.reasonCodes.includes(REASON_CODE.CONTRACT_MISMATCH));
});

test("多目标运行时中未知证据压过可折叠目标", () => {
  const decision = decideProtection({
    query: createQuery({ targetRuntimeIds: ["node-24", "wx-real"] }),
    semanticContract: createContract(),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24" }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.ok(decision.reasonCodes.includes(REASON_CODE.EVIDENCE_MISSING));
});

test("同一运行时存在冲突证据时返回 UNKNOWN", () => {
  const decision = decideProtection({
    query: createQuery(),
    semanticContract: createContract(),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24", exists: true }),
        },
      }),
      createEvidence({
        evidenceId: "evidence-2",
        observations: {
          "node-24": observation({ runtimeId: "node-24", exists: false }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [REASON_CODE.EVIDENCE_CONFLICT]);
});

test("目标集为空且求值基线里不存在该实体时返回 UNKNOWN，而不是真空放行", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: [],
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.UNKNOWN,
    }),
    semanticContract: createContract({
      validityScope: { requiredRuntimeIds: [] },
    }),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24", exists: false }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.ok(
    decision.reasonCodes.includes(REASON_CODE.TARGET_RUNTIME_UNCONFIRMED),
  );
});

test("目标集为空但实体确实属于求值基线时可以放行", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: [],
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.UNKNOWN,
    }),
    semanticContract: createContract({
      validityScope: { requiredRuntimeIds: [] },
    }),
    evidenceRecords: [
      createEvidence({
        observations: {
          "node-24": observation({ runtimeId: "node-24", exists: true }),
        },
      }),
    ],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.FOLD);
});

test("目标集为空且没有求值基线观测时返回 UNKNOWN", () => {
  const decision = decideProtection({
    query: createQuery({
      targetRuntimeIds: [],
      targetRuntimeStatus: TARGET_RUNTIME_STATUS.UNKNOWN,
    }),
    semanticContract: createContract({
      validityScope: { requiredRuntimeIds: [] },
    }),
    evidenceRecords: [],
    asOf: AS_OF,
  });

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.ok(decision.reasonCodes.includes(REASON_CODE.EVIDENCE_MISSING));
});
