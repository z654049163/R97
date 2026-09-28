import {
  BINDING_KIND,
  DECISION_SCOPE,
  ENFORCEMENT_ACTION,
  KNOWLEDGE_STATE,
  RESOLUTION_STATUS,
  RUNTIME_KIND,
  TARGET_RUNTIME_SOURCE,
  TARGET_RUNTIME_STATUS,
  UNCERTAINTY_SOURCE,
  isKnownBindingKind,
  isKnownResolutionStatus,
  isKnownRuntimeSource,
  isKnownSemanticDimension,
  isKnownTargetRuntimeStatus,
  isKnownTransformation,
} from "./constants.mjs";

const assertObject = (value, name) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
};

const assertString = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
};

const assertDateTimeString = (value, name) => {
  assertString(value, name);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be a valid date-time string`);
  }
};

const assertStringArray = (value, name) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string array`);
  }

  value.forEach((item, index) => assertString(item, `${name}[${index}]`));
};

const assertUnique = (value, name) => {
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${name} must not contain duplicates`);
  }
};

export const createBindingRef = ({
  bindingRefId,
  bindingKind,
  bindingOrigin,
  scopeId = null,
  mutationStatus = "stable",
  aliasChain = [],
  resolutionStatus,
  inFileDefinition = null,
}) => {
  assertString(bindingRefId, "bindingRefId");
  if (!isKnownBindingKind(bindingKind)) {
    throw new TypeError(`Unknown bindingKind: ${bindingKind}`);
  }
  assertString(bindingOrigin, "bindingOrigin");
  if (scopeId !== null) {
    assertString(scopeId, "scopeId");
  }
  assertString(mutationStatus, "mutationStatus");

  if (!Array.isArray(aliasChain)) {
    throw new TypeError("aliasChain must be an array");
  }
  aliasChain.forEach((item, index) => assertString(item, `aliasChain[${index}]`));

  if (!isKnownResolutionStatus(resolutionStatus)) {
    throw new TypeError(`Unknown resolutionStatus: ${resolutionStatus}`);
  }

  // 「这个未解析的名字在文件里被赋值过」的标记。
  //
  // 它不改变任何判定：绑定依然未解析、依然 UNKNOWN。它回答的是另一个问题——
  // 这个未决到底该归给「宿主未知全局」（要靠运行时证据）还是「代码自身定义的
  // 全局」（运行时探针观测对它没有意义）。实测依据见 tools/audit-implicit-globals.mjs。
  if (inFileDefinition !== null && typeof inFileDefinition !== "string") {
    throw new TypeError("inFileDefinition must be a string or null");
  }

  return Object.freeze({
    bindingRefId,
    bindingKind,
    bindingOrigin,
    scopeId,
    mutationStatus,
    aliasChain: Object.freeze([...aliasChain]),
    resolutionStatus,
    inFileDefinition,
  });
};

export const createRuntimeEntity = ({
  entityId,
  runtimeBindingKind,
  normalizedPath,
  capabilityDomain = "unknown",
}) => {
  assertString(entityId, "entityId");
  assertString(runtimeBindingKind, "runtimeBindingKind");
  assertString(normalizedPath, "normalizedPath");
  assertString(capabilityDomain, "capabilityDomain");

  return Object.freeze({
    entityId,
    runtimeBindingKind,
    normalizedPath,
    capabilityDomain,
  });
};

export const createUsageContext = ({
  usageContextId,
  accessMode,
  argumentShape = "none",
  callbackPresence = false,
  returnValueUsage = false,
  awaited = false,
  resultPropertyPath = null,
  dynamicPropertyAccess = false,
}) => {
  assertString(usageContextId, "usageContextId");
  assertString(accessMode, "accessMode");
  assertString(argumentShape, "argumentShape");

  if (resultPropertyPath !== null) {
    assertString(resultPropertyPath, "resultPropertyPath");
  }

  return Object.freeze({
    usageContextId,
    accessMode,
    argumentShape,
    callbackPresence: Boolean(callbackPresence),
    returnValueUsage: Boolean(returnValueUsage),
    awaited: Boolean(awaited),
    resultPropertyPath,
    dynamicPropertyAccess: Boolean(dynamicPropertyAccess),
  });
};

export const createRuntimeProfile = ({
  runtimeId,
  runtimeKind,
  runtimeFamily,
  runtimeName,
  runtimeVersion,
  sdkVersion = null,
  environmentFingerprint = {},
  capabilitySurface = [],
  probeAdapter = null,
  safeProbePolicy = null,
}) => {
  assertString(runtimeId, "runtimeId");
  if (!Object.values(RUNTIME_KIND).includes(runtimeKind)) {
    throw new TypeError(`Unknown runtimeKind: ${runtimeKind}`);
  }
  assertString(runtimeFamily, "runtimeFamily");
  assertString(runtimeName, "runtimeName");
  assertString(runtimeVersion, "runtimeVersion");
  if (sdkVersion !== null) {
    assertString(sdkVersion, "sdkVersion");
  }
  assertObject(environmentFingerprint, "environmentFingerprint");
  if (!Array.isArray(capabilitySurface)) {
    throw new TypeError("capabilitySurface must be an array");
  }
  capabilitySurface.forEach((item, index) =>
    assertString(item, `capabilitySurface[${index}]`),
  );

  return Object.freeze({
    runtimeId,
    runtimeKind,
    runtimeFamily,
    runtimeName,
    runtimeVersion,
    sdkVersion,
    environmentFingerprint: Object.freeze({ ...environmentFingerprint }),
    capabilitySurface: Object.freeze([...capabilitySurface]),
    probeAdapter,
    safeProbePolicy,
  });
};

export const createSemanticContract = ({
  contractId,
  transformationKind,
  usageContextId,
  requiredDimensions,
  observationProjection,
  comparisonPredicate = "strict_equal",
  validityScope = {},
}) => {
  assertString(contractId, "contractId");
  if (!isKnownTransformation(transformationKind)) {
    throw new TypeError(`Unknown transformationKind: ${transformationKind}`);
  }
  assertString(usageContextId, "usageContextId");
  assertStringArray(requiredDimensions, "requiredDimensions");
  assertUnique(requiredDimensions, "requiredDimensions");
  assertStringArray(observationProjection, "observationProjection");
  assertUnique(observationProjection, "observationProjection");

  requiredDimensions.forEach((dimension) => {
    if (!isKnownSemanticDimension(dimension)) {
      throw new TypeError(`Unknown required dimension: ${dimension}`);
    }
  });
  observationProjection.forEach((dimension) => {
    if (!isKnownSemanticDimension(dimension)) {
      throw new TypeError(`Unknown projected dimension: ${dimension}`);
    }
  });

  const projectionSet = new Set(observationProjection);
  requiredDimensions.forEach((dimension) => {
    if (!projectionSet.has(dimension)) {
      throw new TypeError(
        `observationProjection must include required dimension: ${dimension}`,
      );
    }
  });

  assertString(comparisonPredicate, "comparisonPredicate");
  assertObject(validityScope, "validityScope");

  return Object.freeze({
    contractId,
    transformationKind,
    usageContextId,
    requiredDimensions: Object.freeze([...requiredDimensions]),
    observationProjection: Object.freeze([...observationProjection]),
    comparisonPredicate,
    validityScope: Object.freeze({ ...validityScope }),
  });
};

export const createDecisionQuery = ({
  queryId,
  programPointId,
  entityId,
  bindingRef,
  transformationKind,
  usageContextId,
  targetRuntimeIds,
  targetRuntimeSource,
  targetRuntimeStatus = null,
  evaluatorRuntimeId,
  semanticContractId,
  policyVersion,
}) => {
  assertString(queryId, "queryId");
  assertString(programPointId, "programPointId");
  assertString(entityId, "entityId");
  assertObject(bindingRef, "bindingRef");
  if (!isKnownTransformation(transformationKind)) {
    throw new TypeError(`Unknown transformationKind: ${transformationKind}`);
  }
  assertString(usageContextId, "usageContextId");
  if (!Array.isArray(targetRuntimeIds)) {
    throw new TypeError("targetRuntimeIds must be a string array");
  }
  targetRuntimeIds.forEach((item, index) =>
    assertString(item, `targetRuntimeIds[${index}]`),
  );
  assertUnique(targetRuntimeIds, "targetRuntimeIds");
  if (!isKnownRuntimeSource(targetRuntimeSource)) {
    throw new TypeError(`Unknown targetRuntimeSource: ${targetRuntimeSource}`);
  }
  if (
    targetRuntimeStatus !== null &&
    !isKnownTargetRuntimeStatus(targetRuntimeStatus)
  ) {
    throw new TypeError(
      `Unknown targetRuntimeStatus: ${targetRuntimeStatus}`,
    );
  }
  assertString(evaluatorRuntimeId, "evaluatorRuntimeId");
  assertString(semanticContractId, "semanticContractId");
  assertString(policyVersion, "policyVersion");

  return Object.freeze({
    queryId,
    programPointId,
    entityId,
    bindingRef: Object.freeze({ ...bindingRef }),
    transformationKind,
    usageContextId,
    targetRuntimeIds: Object.freeze([...targetRuntimeIds]),
    targetRuntimeSource,
    targetRuntimeStatus:
      targetRuntimeStatus ?? targetStatusFromSource(targetRuntimeSource),
    evaluatorRuntimeId,
    semanticContractId,
    policyVersion,
  });
};

export const createRuntimeObservation = ({
  runtimeProfileId,
  observedDimensions,
  values,
  sideEffects = [],
  observedAt = null,
  probeHash = null,
}) => {
  assertString(runtimeProfileId, "runtimeProfileId");
  assertStringArray(observedDimensions, "observedDimensions");
  assertUnique(observedDimensions, "observedDimensions");
  observedDimensions.forEach((dimension) => {
    if (!isKnownSemanticDimension(dimension)) {
      throw new TypeError(`Unknown observed dimension: ${dimension}`);
    }
  });
  assertObject(values, "values");
  if (!Array.isArray(sideEffects)) {
    throw new TypeError("sideEffects must be an array");
  }
  sideEffects.forEach((item, index) => assertString(item, `sideEffects[${index}]`));
  if (observedAt !== null) {
    assertDateTimeString(observedAt, "observedAt");
  }
  if (probeHash !== null) {
    assertString(probeHash, "probeHash");
  }

  return Object.freeze({
    runtimeProfileId,
    observedDimensions: Object.freeze([...observedDimensions]),
    values: Object.freeze({ ...values }),
    sideEffects: Object.freeze([...sideEffects]),
    observedAt,
    probeHash,
  });
};

export const createEvidenceRecord = ({
  evidenceId,
  entityId,
  usageContextId,
  semanticContractId,
  evaluatorRuntimeId,
  observations,
  provenance,
  validFrom = null,
  validUntil = null,
  policyVersion,
}) => {
  assertString(evidenceId, "evidenceId");
  assertString(entityId, "entityId");
  assertString(usageContextId, "usageContextId");
  assertString(semanticContractId, "semanticContractId");
  assertString(evaluatorRuntimeId, "evaluatorRuntimeId");
  assertObject(observations, "observations");
  assertString(provenance, "provenance");
  assertString(policyVersion, "policyVersion");
  if (validFrom !== null) {
    assertDateTimeString(validFrom, "validFrom");
  }
  if (validUntil !== null) {
    assertDateTimeString(validUntil, "validUntil");
  }
  if (
    validFrom !== null &&
    validUntil !== null &&
    Date.parse(validFrom) > Date.parse(validUntil)
  ) {
    throw new TypeError("validFrom must not be after validUntil");
  }

  for (const [runtimeId, observation] of Object.entries(observations)) {
    assertString(runtimeId, `observations.${runtimeId}`);
    assertObject(observation, `observations.${runtimeId}`);
    if (observation.runtimeProfileId !== runtimeId) {
      throw new TypeError(
        `observations.${runtimeId}.runtimeProfileId must equal ${runtimeId}`,
      );
    }
  }

  return Object.freeze({
    evidenceId,
    entityId,
    usageContextId,
    semanticContractId,
    evaluatorRuntimeId,
    observations: Object.freeze({ ...observations }),
    provenance,
    validFrom,
    validUntil,
    policyVersion,
  });
};

export const createProtectionDecision = ({
  decisionId,
  queryId,
  knowledgeState,
  uncertaintySource = null,
  reasonCodes,
  evidenceIds = [],
  targetResults = [],
  policyVersion,
  validityRange = null,
  invalidationConditions = [],
}) => {
  assertString(decisionId, "decisionId");
  assertString(queryId, "queryId");
  if (!Object.values(KNOWLEDGE_STATE).includes(knowledgeState)) {
    throw new TypeError(`Unknown knowledgeState: ${knowledgeState}`);
  }
  if (
    uncertaintySource !== null &&
    !Object.values(UNCERTAINTY_SOURCE).includes(uncertaintySource)
  ) {
    throw new TypeError(`Unknown uncertaintySource: ${uncertaintySource}`);
  }
  if (
    (knowledgeState === KNOWLEDGE_STATE.UNKNOWN) !==
    (uncertaintySource !== null)
  ) {
    throw new TypeError(
      "uncertaintySource must be set exactly when knowledgeState is UNKNOWN",
    );
  }
  assertStringArray(reasonCodes, "reasonCodes");
  assertUnique(reasonCodes, "reasonCodes");
  if (!Array.isArray(evidenceIds)) {
    throw new TypeError("evidenceIds must be an array");
  }
  evidenceIds.forEach((item, index) => assertString(item, `evidenceIds[${index}]`));
  assertUnique(evidenceIds, "evidenceIds");
  if (!Array.isArray(targetResults)) {
    throw new TypeError("targetResults must be an array");
  }
  assertString(policyVersion, "policyVersion");
  if (validityRange !== null) {
    assertObject(validityRange, "validityRange");
  }
  if (!Array.isArray(invalidationConditions)) {
    throw new TypeError("invalidationConditions must be an array");
  }
  invalidationConditions.forEach((item, index) =>
    assertString(item, `invalidationConditions[${index}]`),
  );
  assertUnique(invalidationConditions, "invalidationConditions");

  const enforcementAction =
    knowledgeState === KNOWLEDGE_STATE.FOLD
      ? ENFORCEMENT_ACTION.ALLOW_FOLD
      : ENFORCEMENT_ACTION.BLOCK_FOLD;

  return Object.freeze({
    decisionId,
    queryId,
    knowledgeState,
    uncertaintySource,
    enforcementAction,
    decisionScope: DECISION_SCOPE.RUNTIME_SEMANTICS_ONLY,
    requiresBaseTransformationVerification: true,
    reasonCodes: Object.freeze([...reasonCodes]),
    evidenceIds: Object.freeze([...evidenceIds]),
    targetResults: Object.freeze([...targetResults]),
    policyVersion,
    validityRange: validityRange === null ? null : Object.freeze({ ...validityRange }),
    invalidationConditions: Object.freeze([...invalidationConditions]),
  });
};

export const DEFAULT_BINDING = Object.freeze({
  bindingKind: BINDING_KIND.RUNTIME_GLOBAL,
  resolutionStatus: RESOLUTION_STATUS.RESOLVED,
});

export const DEFAULT_TARGET_SOURCE = TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG;

const targetStatusFromSource = (source) => {
  switch (source) {
    case TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG:
      return TARGET_RUNTIME_STATUS.CONFIRMED;
    case TARGET_RUNTIME_SOURCE.DECLARED:
      return TARGET_RUNTIME_STATUS.DECLARED;
    case TARGET_RUNTIME_SOURCE.INFERRED:
      return TARGET_RUNTIME_STATUS.INFERRED;
    default:
      return TARGET_RUNTIME_STATUS.UNKNOWN;
  }
};
