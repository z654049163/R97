export const BINDING_KIND = Object.freeze({
  LOCAL: "local",
  PARAMETER: "parameter",
  MODULE_IMPORT: "module_import",
  RUNTIME_GLOBAL: "runtime_global",
  UNRESOLVED_GLOBAL: "unresolved_global",
  DYNAMIC: "dynamic",
});

export const RESOLUTION_STATUS = Object.freeze({
  RESOLVED: "resolved",
  UNRESOLVED: "unresolved",
  DYNAMIC: "dynamic",
});

export const RUNTIME_KIND = Object.freeze({
  LANGUAGE_BASELINE: "language_baseline",
  HOST_RUNTIME: "host_runtime",
  STUB_RUNTIME: "stub_runtime",
});

export const TARGET_RUNTIME_SOURCE = Object.freeze({
  DECLARED: "declared",
  EXPERIMENT_CONFIG: "experiment_config",
  INFERRED: "inferred",
  UNKNOWN: "unknown",
});

export const TARGET_RUNTIME_STATUS = Object.freeze({
  CONFIRMED: "confirmed",
  CORROBORATED: "corroborated",
  /**
   * 平台族已由外部权威证据确认，但执行表面或版本画像不完整。
   *
   * 文档里的 `context_unknown` 就是这个状态：「知道是微信，但不知道是
   * AppService 还是 Worker」。它比 `unknown` 强（族已确认、候选集合可以收窄
   * 到该族的执行表面），但比 `confirmed` 弱：既不能授权 FOLD，也不能触发
   * 硬 PROTECT。存在的意义是让这截缺口可测量、可审计，而不是混在 unknown 里。
   */
  CONTEXT_UNKNOWN: "context_unknown",
  DECLARED: "declared",
  INFERRED: "inferred",
  CONFLICT: "conflict",
  UNKNOWN: "unknown",
});

export const REQUIRED_RUNTIME_STATUS = Object.freeze({
  DEFINITE: "definite",
  POSSIBLE: "possible",
  AMBIGUOUS: "ambiguous",
});

export const TRANSFORMATION_KIND = Object.freeze({
  CONST_EVAL: "CONST_EVAL",
  BRANCH_PRUNE: "BRANCH_PRUNE",
  DEAD_CODE_DELETE: "DEAD_CODE_DELETE",
  CALL_EVAL: "CALL_EVAL",
});

export const SEMANTIC_DIMENSION = Object.freeze({
  EXISTENCE: "existence",
  TYPE: "type",
  CALLABILITY: "callability",
  RETURN_VALUE: "return_value",
  EXCEPTION: "exception",
  ASYNC_BEHAVIOR: "async_behavior",
  CALLBACK_BEHAVIOR: "callback_behavior",
  SIDE_EFFECT: "observable_side_effect",
  PERMISSION: "permission_behavior",
});

export const EVIDENCE_PROVENANCE = Object.freeze({
  RUNTIME_OBSERVED: "runtime_observed",
  OFFICIAL_SPEC: "official_spec",
  TYPE_DEFINITION: "type_definition",
  CORPUS_OBSERVED: "corpus_observed",
  DIFFERENTIAL_EXECUTION: "differential_execution",
  HUMAN_REVIEW: "human_review",
  LEGACY_SEED: "legacy_seed",
  LLM_SUGGESTION: "llm_suggestion",
});

export const KNOWLEDGE_STATE = Object.freeze({
  FOLD: "FOLD",
  PROTECT: "PROTECT",
  UNKNOWN: "UNKNOWN",
});

export const ENFORCEMENT_ACTION = Object.freeze({
  ALLOW_FOLD: "ALLOW_FOLD",
  BLOCK_FOLD: "BLOCK_FOLD",
});

export const DECISION_SCOPE = Object.freeze({
  RUNTIME_SEMANTICS_ONLY: "runtime_semantics_only",
});

export const REASON_CODE = Object.freeze({
  BINDING_UNRESOLVED: "BINDING_UNRESOLVED",
  TARGET_RUNTIME_INFERRED: "TARGET_RUNTIME_INFERRED",
  TARGET_RUNTIME_UNCONFIRMED: "TARGET_RUNTIME_UNCONFIRMED",
  TARGET_RUNTIME_CONTEXT_UNKNOWN: "TARGET_RUNTIME_CONTEXT_UNKNOWN",
  REQUIRED_RUNTIME_AMBIGUOUS: "REQUIRED_RUNTIME_AMBIGUOUS",
  REQUIRED_RUNTIME_MISSING: "REQUIRED_RUNTIME_MISSING",
  EVIDENCE_MISSING: "EVIDENCE_MISSING",
  EVIDENCE_EXPIRED: "EVIDENCE_EXPIRED",
  EVIDENCE_NOT_FOLD_ELIGIBLE: "EVIDENCE_NOT_FOLD_ELIGIBLE",
  EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
  CONTRACT_COVERAGE_MISSING: "CONTRACT_COVERAGE_MISSING",
  CONTRACT_MISMATCH: "CONTRACT_MISMATCH",
  FORBIDDEN_SIDE_EFFECT: "FORBIDDEN_SIDE_EFFECT",
  ALL_TARGETS_MATCH: "ALL_TARGETS_MATCH",
});

/**
 * UNKNOWN 的来源分类。强制动作完全相同（都是 BLOCK_FOLD），但把「不知道」
 * 拆开之后才能回答「改进哪一层能把未决率降下来」。
 */
export const UNCERTAINTY_SOURCE = Object.freeze({
  /** 静态绑定没解析出来：局部/动态/未解析的符号来源不明。 */
  BINDING: "binding",
  /** 运行时层不确定：目标未确认，或缺少某个必需运行时的观测。 */
  RUNTIME: "runtime",
  /** 证据不足以判定行为：契约维度缺失、证据不可折叠、证据冲突。 */
  BEHAVIOR: "behavior",
});

export const FORBIDDEN_SIDE_EFFECTS = Object.freeze([
  "network",
  "storage_write",
  "payment",
  "native_bridge",
  "visible_ui",
]);

export const isKnownTransformation = (value) =>
  Object.values(TRANSFORMATION_KIND).includes(value);

export const isKnownSemanticDimension = (value) =>
  Object.values(SEMANTIC_DIMENSION).includes(value);

export const isKnownRuntimeSource = (value) =>
  Object.values(TARGET_RUNTIME_SOURCE).includes(value);

export const isKnownTargetRuntimeStatus = (value) =>
  Object.values(TARGET_RUNTIME_STATUS).includes(value);

export const isKnownRequiredRuntimeStatus = (value) =>
  Object.values(REQUIRED_RUNTIME_STATUS).includes(value);

export const isKnownBindingKind = (value) =>
  Object.values(BINDING_KIND).includes(value);

export const isKnownResolutionStatus = (value) =>
  Object.values(RESOLUTION_STATUS).includes(value);
