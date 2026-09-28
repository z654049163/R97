import { isDeepStrictEqual } from "node:util";
import {
  BINDING_KIND,
  EVIDENCE_PROVENANCE,
  FORBIDDEN_SIDE_EFFECTS,
  KNOWLEDGE_STATE,
  REASON_CODE,
  REQUIRED_RUNTIME_STATUS,
  RESOLUTION_STATUS,
  TARGET_RUNTIME_SOURCE,
  TARGET_RUNTIME_STATUS,
  UNCERTAINTY_SOURCE,
} from "./constants.mjs";
import { createProtectionDecision } from "./model.mjs";

const DEFAULT_INVALIDATION_CONDITIONS = Object.freeze([
  "runtime_version_changed",
  "sdk_version_changed",
  "environment_fingerprint_changed",
  "contract_version_changed",
  "policy_version_changed",
  "evidence_expired",
]);

export const decideProtection = ({
  query,
  semanticContract,
  evidenceRecords = [],
  asOf = new Date().toISOString(),
}) => {
  assertDecisionInputs(query, semanticContract, evidenceRecords, asOf);

  const bindingReasons = getBindingReasons(query);
  if (bindingReasons.length > 0) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: bindingReasons,
    });
  }

  const contractReasons = getContractReasons(query, semanticContract);
  if (contractReasons.length > 0) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: contractReasons,
    });
  }

  const missingRuntimeIds = getMissingRequiredRuntimeIds(
    query,
    semanticContract,
  );
  const requiredRuntimeStatus = getRequiredRuntimeStatus(semanticContract);
  const requiredRuntimeIds =
    semanticContract.validityScope?.requiredRuntimeIds ?? [];
  const targetRuntimeStatus =
    query.targetRuntimeStatus ?? TARGET_RUNTIME_STATUS.UNKNOWN;

  if (
    requiredRuntimeIds.length > 0 &&
    requiredRuntimeStatus !== REQUIRED_RUNTIME_STATUS.DEFINITE
  ) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: [REASON_CODE.REQUIRED_RUNTIME_AMBIGUOUS],
    });
  }

  const identityEvidence = evidenceRecords.filter((record) =>
    matchesEvidenceIdentity(record, query),
  );
  const scopedEvidence = identityEvidence.filter(
    (record) => record.evaluatorRuntimeId === query.evaluatorRuntimeId,
  );

  if (
    targetRuntimeStatus !== TARGET_RUNTIME_STATUS.CONFIRMED &&
    requiredRuntimeIds.length > 0
  ) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: [getUnconfirmedTargetReason(query, targetRuntimeStatus)],
      evidenceIds: scopedEvidence.map((record) => record.evidenceId),
    });
  }

  if (missingRuntimeIds.length > 0) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.PROTECT,
      reasonCodes: [REASON_CODE.REQUIRED_RUNTIME_MISSING],
      evidenceIds: scopedEvidence.map((record) => record.evidenceId),
    });
  }

  if (scopedEvidence.length === 0) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: [REASON_CODE.EVIDENCE_MISSING],
    });
  }

  const validEvidence = scopedEvidence.filter((record) =>
    isEvidenceValid(record, query, asOf),
  );
  if (validEvidence.length === 0) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: [REASON_CODE.EVIDENCE_EXPIRED],
      evidenceIds: scopedEvidence.map((record) => record.evidenceId),
    });
  }

  const evaluatorObservation = selectRuntimeObservation({
    evidenceRecords: validEvidence,
    runtimeId: query.evaluatorRuntimeId,
    requiredDimensions: semanticContract.requiredDimensions,
    allowAbsence: true,
  });

  if (!evaluatorObservation.available) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: [REASON_CODE.EVIDENCE_MISSING],
      evidenceIds: evaluatorObservation.evidenceIds,
      validityRange: getValidityRange(validEvidence),
    });
  }
  if (evaluatorObservation.conflict) {
    return buildDecision({
      query,
      knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
      reasonCodes: [REASON_CODE.EVIDENCE_CONFLICT],
      evidenceIds: evaluatorObservation.evidenceIds,
      validityRange: getValidityRange(validEvidence),
    });
  }

  // 目标集为空**不等于**可以放行。
  //
  // 此前空目标集会一路落到 `combineKnowledgeStates([])`，而那个函数对空数组
  // 返回 FOLD——「没有目标需要比较」被当成了「所有目标都匹配」。后果是可测的：
  // 「目标未知」配置的放行数（1419）反而高于「目标已确认」（1196），差 220 条。
  //
  // 根因在 required 的表达力：它只知道「依赖哪个宿主」，而宿主可以扩展语言
  // 内建对象。`Math.nv_*` 的根是 `Math`（语言内建）→ required 为空，但它其实
  // 是微信挂在 `Math` 上的扩展；目标集为空时没有任何东西能戳穿它。
  //
  // 判据用 evaluator 观测本身：只有**在求值基线里确实存在**的实体才算与宿主
  // 无关，才可以只靠 language-only 检查放行。基线里不存在的（`Math.nv_*`、
  // 应用自定义全局）一律需要目标证据；没有目标就是 UNKNOWN。
  if (query.targetRuntimeIds.length === 0) {
    const baselineExistence =
      evaluatorObservation.observation?.values?.existence;
    if (baselineExistence !== true) {
      return buildDecision({
        query,
        knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
        reasonCodes: [REASON_CODE.TARGET_RUNTIME_UNCONFIRMED],
        evidenceIds: evaluatorObservation.evidenceIds,
        validityRange: getValidityRange(validEvidence),
      });
    }
  }

  const targetResults = query.targetRuntimeIds.map((runtimeId) => {
    const targetObservation = selectRuntimeObservation({
      evidenceRecords: validEvidence,
      runtimeId,
      requiredDimensions: semanticContract.requiredDimensions,
      // 只有「这个实体被归属到该宿主」时，裸环境里的「不存在」才不可信：
      // 那种情况下它的存在取决于应用自己或基础库注入了什么。
      hostAttributed: requiredRuntimeIds.includes(runtimeId),
    });

    if (!targetObservation.available) {
      return {
        runtimeId,
        knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
        reasonCodes: [REASON_CODE.EVIDENCE_MISSING],
        evidenceIds: targetObservation.evidenceIds,
      };
    }

    if (targetObservation.conflict) {
      return {
        runtimeId,
        knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
        reasonCodes: [REASON_CODE.EVIDENCE_CONFLICT],
        evidenceIds: targetObservation.evidenceIds,
      };
    }

    if (hasForbiddenSideEffect(targetObservation.observations)) {
      return {
        runtimeId,
        knowledgeState: KNOWLEDGE_STATE.PROTECT,
        reasonCodes: [REASON_CODE.FORBIDDEN_SIDE_EFFECT],
        evidenceIds: targetObservation.evidenceIds,
      };
    }

    const comparison = compareObservations(
      evaluatorObservation.observation,
      targetObservation.observation,
      semanticContract.requiredDimensions,
    );
    if (comparison.mismatchDimensions.length > 0) {
      return {
        runtimeId,
        knowledgeState: KNOWLEDGE_STATE.PROTECT,
        reasonCodes: [REASON_CODE.CONTRACT_MISMATCH],
        evidenceIds: targetObservation.evidenceIds,
      };
    }

    if (
      !evaluatorObservation.complete ||
      !targetObservation.complete ||
      comparison.incompleteDimensions.length > 0
    ) {
      return {
        runtimeId,
        knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
        reasonCodes: [REASON_CODE.CONTRACT_COVERAGE_MISSING],
        evidenceIds: [
          ...evaluatorObservation.evidenceIds,
          ...targetObservation.evidenceIds,
        ],
      };
    }

    if (
      targetRuntimeStatus === TARGET_RUNTIME_STATUS.INFERRED ||
      query.targetRuntimeSource === TARGET_RUNTIME_SOURCE.INFERRED
    ) {
      return {
        runtimeId,
        knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
        reasonCodes: [REASON_CODE.TARGET_RUNTIME_INFERRED],
        evidenceIds: targetObservation.evidenceIds,
      };
    }

    if (
      !evaluatorObservation.foldEligible ||
      !targetObservation.foldEligible
    ) {
      return {
        runtimeId,
        knowledgeState: KNOWLEDGE_STATE.UNKNOWN,
        reasonCodes: [REASON_CODE.EVIDENCE_NOT_FOLD_ELIGIBLE],
        evidenceIds: [
          ...evaluatorObservation.evidenceIds,
          ...targetObservation.evidenceIds,
        ],
      };
    }

    return {
      runtimeId,
      knowledgeState: KNOWLEDGE_STATE.FOLD,
      reasonCodes: [REASON_CODE.ALL_TARGETS_MATCH],
      evidenceIds: targetObservation.evidenceIds,
    };
  });

  const knowledgeState = combineKnowledgeStates(targetResults);
  const reasonCodes =
    knowledgeState === KNOWLEDGE_STATE.FOLD
      ? [REASON_CODE.ALL_TARGETS_MATCH]
      : unique(
          targetResults.flatMap((result) => result.reasonCodes),
        );
  const evidenceIds = unique([
    ...evaluatorObservation.evidenceIds,
    ...targetResults.flatMap((result) => result.evidenceIds),
  ]);

  return buildDecision({
    query,
    knowledgeState,
    reasonCodes,
    evidenceIds,
    targetResults,
    validityRange: getValidityRange(validEvidence),
  });
};

const assertDecisionInputs = (query, semanticContract, evidenceRecords, asOf) => {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw new TypeError("query must be an object");
  }
  if (
    !semanticContract ||
    typeof semanticContract !== "object" ||
    Array.isArray(semanticContract)
  ) {
    throw new TypeError("semanticContract must be an object");
  }
  if (!Array.isArray(evidenceRecords)) {
    throw new TypeError("evidenceRecords must be an array");
  }
  if (typeof asOf !== "string" || Number.isNaN(Date.parse(asOf))) {
    throw new TypeError("asOf must be a valid date-time string");
  }
};

const getBindingReasons = (query) => {
  const { bindingRef } = query;
  if (
    bindingRef.resolutionStatus !== RESOLUTION_STATUS.RESOLVED ||
    bindingRef.bindingKind === BINDING_KIND.UNRESOLVED_GLOBAL ||
    bindingRef.bindingKind === BINDING_KIND.DYNAMIC
  ) {
    return [REASON_CODE.BINDING_UNRESOLVED];
  }
  return [];
};

const getContractReasons = (query, semanticContract) => {
  const reasons = [];
  if (
    semanticContract.contractId !== query.semanticContractId ||
    semanticContract.usageContextId !== query.usageContextId ||
    semanticContract.transformationKind !== query.transformationKind
  ) {
    reasons.push(REASON_CODE.CONTRACT_COVERAGE_MISSING);
  }

  const requiredDimensions = semanticContract.requiredDimensions;
  const projection = new Set(semanticContract.observationProjection);
  if (
    !Array.isArray(requiredDimensions) ||
    requiredDimensions.length === 0 ||
    requiredDimensions.some((dimension) => !projection.has(dimension))
  ) {
    reasons.push(REASON_CODE.CONTRACT_COVERAGE_MISSING);
  }

  if (semanticContract.comparisonPredicate !== "strict_equal") {
    reasons.push(REASON_CODE.CONTRACT_COVERAGE_MISSING);
  }

  return unique(reasons);
};

const getMissingRequiredRuntimeIds = (query, semanticContract) => {
  const requiredRuntimeIds =
    semanticContract.validityScope?.requiredRuntimeIds ?? [];
  if (!Array.isArray(requiredRuntimeIds)) {
    return [];
  }
  return requiredRuntimeIds.filter(
    (runtimeId) => !query.targetRuntimeIds.includes(runtimeId),
  );
};

const getRequiredRuntimeStatus = (semanticContract) => {
  const status = semanticContract.validityScope?.requiredRuntimeStatus;
  return Object.values(REQUIRED_RUNTIME_STATUS).includes(status)
    ? status
    : REQUIRED_RUNTIME_STATUS.DEFINITE;
};

const getUnconfirmedTargetReason = (query, targetRuntimeStatus) =>
  targetRuntimeStatus === TARGET_RUNTIME_STATUS.INFERRED ||
  query.targetRuntimeSource === TARGET_RUNTIME_SOURCE.INFERRED
    ? REASON_CODE.TARGET_RUNTIME_INFERRED
    : targetRuntimeStatus === TARGET_RUNTIME_STATUS.CONTEXT_UNKNOWN
      ? REASON_CODE.TARGET_RUNTIME_CONTEXT_UNKNOWN
    : REASON_CODE.TARGET_RUNTIME_UNCONFIRMED;

const matchesEvidenceIdentity = (record, query) =>
  record.entityId === query.entityId &&
  record.usageContextId === query.usageContextId &&
  record.semanticContractId === query.semanticContractId;

const isEvidenceValid = (record, query, asOf) => {
  if (record.policyVersion !== query.policyVersion) {
    return false;
  }
  const now = Date.parse(asOf);
  if (record.validFrom !== null && Date.parse(record.validFrom) > now) {
    return false;
  }
  if (record.validUntil !== null && Date.parse(record.validUntil) < now) {
    return false;
  }
  return true;
};

const isFoldEligibleEvidence = (record) =>
  record.provenance === EVIDENCE_PROVENANCE.RUNTIME_OBSERVED ||
  record.provenance === EVIDENCE_PROVENANCE.DIFFERENTIAL_EXECUTION;

const selectRuntimeObservation = ({
  evidenceRecords,
  runtimeId,
  requiredDimensions,
  allowAbsence = false,
  hostAttributed = false,
}) => {
  const recordsWithObservation = evidenceRecords.filter((record) =>
    Object.hasOwn(record.observations, runtimeId),
  );

  if (recordsWithObservation.length === 0) {
    return {
      available: false,
      evidenceIds: [],
    };
  }

  // 目标宿主的「不存在」不能当证据用。
  //
  // 探针跑的是**裸环境**：Edge 是空白页、Node 是干净进程、微信是 fixture 项目，
  // 都不是被分析的那个应用。应用自己注入的全局（`window.BaaS`、`navigator.X`、
  // `wx.<plugin>`）在这些环境里当然不存在，但那不代表目标应用里没有。
  //
  // 把这种「不存在」当成目标的真实取值，会与求值基线的「不存在」撞成一致，
  // 于是错误放行——实测微信语料 68 条、浏览器语料 110 条（`window.*` 59、
  // `navigator.*` 51）。
  //
  // 求值基线不适用这条：它代表去混淆器自己的执行环境，那里的「不存在」是真的
  // 不存在，正是需要拿来和目标比的东西。
  if (
    !allowAbsence &&
    hostAttributed &&
    recordsWithObservation.every(
      (record) =>
        record.observations[runtimeId]?.values?.existence === false,
    )
  ) {
    return {
      available: false,
      evidenceIds: recordsWithObservation.map((record) => record.evidenceId),
      observations: recordsWithObservation.map(
        (record) => record.observations[runtimeId],
      ),
    };
  }

  const observations = recordsWithObservation.map(
    (record) => record.observations[runtimeId],
  );
  const hasAnyDimension = recordsWithObservation.some((record) =>
    observationHasAnyRequiredDimension(
      record.observations[runtimeId],
      requiredDimensions,
    ),
  );
  if (!hasAnyDimension) {
    return {
      available: false,
      evidenceIds: recordsWithObservation.map((record) => record.evidenceId),
      observations,
    };
  }

  const merged = mergeObservations(observations, requiredDimensions);

  if (merged.conflict) {
    return {
      available: true,
      conflict: true,
      evidenceIds: recordsWithObservation.map((record) => record.evidenceId),
      observations,
    };
  }

  const completeRecords = recordsWithObservation.filter((record) =>
    hasRequiredDimensions(
      record.observations[runtimeId],
      requiredDimensions,
    ),
  );

  return {
    available: true,
    conflict: false,
    complete:
      completeRecords.length > 0 &&
      hasRequiredDimensions(merged.observation, requiredDimensions),
    evidenceIds: completeRecords.map((record) => record.evidenceId),
    foldEligible: completeRecords.every(isFoldEligibleEvidence),
    observation: merged.observation,
    observations,
  };
};

const hasRequiredDimensions = (observation, requiredDimensions) =>
  Array.isArray(observation.observedDimensions) &&
  requiredDimensions.every(
    (dimension) =>
      observation.observedDimensions.includes(dimension) &&
      Object.hasOwn(observation.values, dimension),
  );

const observationHasAnyRequiredDimension = (observation, requiredDimensions) =>
  Array.isArray(observation.observedDimensions) &&
  requiredDimensions.some(
    (dimension) =>
      observation.observedDimensions.includes(dimension) &&
      Object.hasOwn(observation.values, dimension),
  );

const mergeObservations = (observations, requiredDimensions) => {
  const merged = {
    runtimeProfileId: observations[0]?.runtimeProfileId ?? null,
    observedDimensions: [],
    values: {},
    sideEffects: [],
  };
  let conflict = false;

  for (const observation of observations) {
    for (const dimension of requiredDimensions) {
      if (
        !Array.isArray(observation.observedDimensions) ||
        !observation.observedDimensions.includes(dimension) ||
        !Object.hasOwn(observation.values, dimension)
      ) {
        continue;
      }
      if (
        Object.hasOwn(merged.values, dimension) &&
        !isDeepStrictEqual(merged.values[dimension], observation.values[dimension])
      ) {
        conflict = true;
        continue;
      }
      merged.observedDimensions.push(dimension);
      merged.values[dimension] = observation.values[dimension];
    }
    for (const sideEffect of observation.sideEffects ?? []) {
      if (!merged.sideEffects.includes(sideEffect)) {
        merged.sideEffects.push(sideEffect);
      }
    }
  }

  return {
    conflict,
    observation: {
      ...merged,
      observedDimensions: unique(merged.observedDimensions),
      probeHash: null,
      observedAt: null,
    },
  };
};

const compareObservations = (
  evaluatorObservation,
  targetObservation,
  requiredDimensions,
) => {
  const mismatchDimensions = [];
  const incompleteDimensions = [];

  for (const dimension of requiredDimensions) {
    const evaluatorHasDimension =
      evaluatorObservation.observedDimensions.includes(dimension) &&
      Object.hasOwn(evaluatorObservation.values, dimension);
    const targetHasDimension =
      targetObservation.observedDimensions.includes(dimension) &&
      Object.hasOwn(targetObservation.values, dimension);

    if (!evaluatorHasDimension || !targetHasDimension) {
      incompleteDimensions.push(dimension);
      continue;
    }
    if (
      !isDeepStrictEqual(
        evaluatorObservation.values[dimension],
        targetObservation.values[dimension],
      )
    ) {
      mismatchDimensions.push(dimension);
    }
  }

  return {
    mismatchDimensions,
    incompleteDimensions,
  };
};

const semanticValuesEqual = (left, right, dimensions) =>
  dimensions.every((dimension) =>
    isDeepStrictEqual(left.values[dimension], right.values[dimension]),
  );

const hasForbiddenSideEffect = (observations) =>
  observations.some((observation) =>
    observation.sideEffects.some((sideEffect) =>
      FORBIDDEN_SIDE_EFFECTS.includes(sideEffect),
    ),
  );

const combineKnowledgeStates = (targetResults) => {
  if (
    targetResults.some(
      (result) => result.knowledgeState === KNOWLEDGE_STATE.PROTECT,
    )
  ) {
    return KNOWLEDGE_STATE.PROTECT;
  }
  if (
    targetResults.some(
      (result) => result.knowledgeState === KNOWLEDGE_STATE.UNKNOWN,
    )
  ) {
    return KNOWLEDGE_STATE.UNKNOWN;
  }
  return KNOWLEDGE_STATE.FOLD;
};

const getValidityRange = (evidenceRecords) => {
  const validFrom = evidenceRecords
    .map((record) => record.validFrom)
    .filter((value) => value !== null);
  const validUntil = evidenceRecords
    .map((record) => record.validUntil)
    .filter((value) => value !== null);

  return {
    validFrom: validFrom.length === 0 ? null : validFrom.sort().at(-1),
    validUntil: validUntil.length === 0 ? null : validUntil.sort()[0],
  };
};

const buildDecision = ({
  query,
  knowledgeState,
  reasonCodes,
  evidenceIds = [],
  targetResults = [],
  validityRange = null,
}) =>
  createProtectionDecision({
    decisionId: `${query.queryId}:${query.policyVersion}:${knowledgeState}`,
    queryId: query.queryId,
    knowledgeState,
    uncertaintySource:
      knowledgeState === KNOWLEDGE_STATE.UNKNOWN
        ? classifyUncertainty(reasonCodes)
        : null,
    reasonCodes,
    evidenceIds: unique(evidenceIds),
    targetResults,
    policyVersion: query.policyVersion,
    validityRange,
    invalidationConditions: DEFAULT_INVALIDATION_CONDITIONS,
  });

/**
 * 把 UNKNOWN 按「哪一层的改进能消除它」归类。
 *
 * 强制动作完全一样（BLOCK_FOLD），所以这纯粹是可解释性与统计口径的改进：
 * 未决率里有多少能靠绑定解析解决、多少要补运行时证据、多少要靠更完整的
 * 语义维度协议，三者对应完全不同的工程投入。
 */
const UNCERTAINTY_BY_REASON = Object.freeze({
  [REASON_CODE.BINDING_UNRESOLVED]: UNCERTAINTY_SOURCE.BINDING,
  [REASON_CODE.TARGET_RUNTIME_UNCONFIRMED]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.TARGET_RUNTIME_CONTEXT_UNKNOWN]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.TARGET_RUNTIME_INFERRED]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.REQUIRED_RUNTIME_AMBIGUOUS]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.REQUIRED_RUNTIME_MISSING]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.EVIDENCE_MISSING]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.EVIDENCE_EXPIRED]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.EVIDENCE_CONFLICT]: UNCERTAINTY_SOURCE.RUNTIME,
  [REASON_CODE.CONTRACT_COVERAGE_MISSING]: UNCERTAINTY_SOURCE.BEHAVIOR,
  [REASON_CODE.EVIDENCE_NOT_FOLD_ELIGIBLE]: UNCERTAINTY_SOURCE.BEHAVIOR,
});

const classifyUncertainty = (reasonCodes) => {
  for (const priority of [
    UNCERTAINTY_SOURCE.BINDING,
    UNCERTAINTY_SOURCE.RUNTIME,
    UNCERTAINTY_SOURCE.BEHAVIOR,
  ]) {
    if (
      reasonCodes.some(
        (reasonCode) => UNCERTAINTY_BY_REASON[reasonCode] === priority,
      )
    ) {
      return priority;
    }
  }
  // 不应该发生：UNKNOWN 一定由某个已知 reason code 触发。留一个可审计的兜底。
  return UNCERTAINTY_SOURCE.BEHAVIOR;
};

const unique = (values) => [...new Set(values)];
