import { createHash } from "node:crypto";

import { analyzeSource } from "./analyzer.mjs";
import { buildSemanticContract } from "./contract-builder.mjs";
import {
  TARGET_RUNTIME_SOURCE,
  TARGET_RUNTIME_STATUS,
} from "./constants.mjs";
import { decideProtection } from "./decision-engine.mjs";
import { createDecisionQuery } from "./model.mjs";
import { RUNTIME_IDS } from "./runtime-profiles.mjs";
import { resolveTargetRuntime } from "./target-runtime-resolver.mjs";

const DEFAULT_EVALUATOR_RUNTIME_ID = RUNTIME_IDS.NODE;

export const analyzeAndDecide = ({
  source,
  filePath = "<inline>",
  runtimeGlobals = [],
  targetRuntimeIds = [],
  targetRuntimeSource = TARGET_RUNTIME_SOURCE.UNKNOWN,
  targetRuntimeEvidence = [],
  evaluatorRuntimeId = DEFAULT_EVALUATOR_RUNTIME_ID,
  policyVersion = "policy-v1",
  asOf = new Date().toISOString(),
  evidenceRecords = [],
  contractVersion = "v1",
}) => {
  const analysis = analyzeSource({
    source,
    filePath,
    runtimeGlobals,
  });

  const decisions = analysis.findings.map((finding) => {
    const semanticContract = buildSemanticContract({
      finding,
      contractVersion,
    });
    const requiredRuntimeIds =
      semanticContract.validityScope.requiredRuntimeIds;
    const targetRuntime = resolveTargetRuntime({
      artifactId: filePath,
      scopeIds: [finding.runtimeEntity.entityId],
      requiredRuntimeIds,
      declaredRuntimeIds: targetRuntimeIds,
      targetRuntimeSource,
      targetRuntimeEvidence,
      targetRuntimeExplicit: targetRuntimeIds.length > 0,
    });
    const effectiveTargetRuntimeIds = [
      ...new Set([
        ...targetRuntime.targetRuntimeIds,
        ...requiredRuntimeIds,
      ]),
    ];
    const query = createDecisionQuery({
      queryId: queryId({
        finding,
        targetRuntimeIds: effectiveTargetRuntimeIds,
        evaluatorRuntimeId,
        policyVersion,
      }),
      programPointId: finding.programPointId,
      entityId: finding.runtimeEntity.entityId,
      bindingRef: finding.bindingRef,
      transformationKind: finding.transformationKind,
      usageContextId: finding.usageContext.usageContextId,
      targetRuntimeIds: effectiveTargetRuntimeIds,
      targetRuntimeSource: targetRuntime.source,
      targetRuntimeStatus: targetRuntime.status,
      evaluatorRuntimeId,
      semanticContractId: semanticContract.contractId,
      policyVersion,
    });
    const decision = decideProtection({
      query,
      semanticContract,
      evidenceRecords,
      asOf,
    });

    return Object.freeze({
      programPointId: finding.programPointId,
      programPoint: finding.programPoint,
      runtimeEntity: finding.runtimeEntity,
      usageContext: finding.usageContext,
      bindingRef: finding.bindingRef,
      semanticContract,
      targetRuntime,
      query,
      decision,
    });
  });

  return Object.freeze({
    filePath,
    sourceHash: analysis.sourceHash,
    findingCount: analysis.findingCount,
    decisions: Object.freeze(decisions),
    summary: summarizeDecisions(decisions),
  });
};

export const summarizeDecisions = (decisions) => {
  const byKnowledgeState = {
    FOLD: 0,
    PROTECT: 0,
    UNKNOWN: 0,
  };
  const byUncertaintySource = {
    binding: 0,
    runtime: 0,
    behavior: 0,
  };
  const byReasonCode = {};

  for (const item of decisions) {
    byKnowledgeState[item.decision.knowledgeState] += 1;
    if (item.decision.uncertaintySource) {
      byUncertaintySource[item.decision.uncertaintySource] += 1;
    }
    for (const reasonCode of item.decision.reasonCodes) {
      byReasonCode[reasonCode] =
        (Object.hasOwn(byReasonCode, reasonCode)
          ? byReasonCode[reasonCode]
          : 0) + 1;
    }
  }

  return Object.freeze({
    total: decisions.length,
    byKnowledgeState: Object.freeze(byKnowledgeState),
    byUncertaintySource: Object.freeze(byUncertaintySource),
    byReasonCode: Object.freeze(byReasonCode),
  });
};

const queryId = ({
  finding,
  targetRuntimeIds,
  evaluatorRuntimeId,
  policyVersion,
}) =>
  `query:${sha256(
    [
      finding.programPointId,
      finding.transformationKind,
      finding.runtimeEntity.entityId,
      targetRuntimeIds.join(","),
      evaluatorRuntimeId,
      policyVersion,
    ].join("|"),
  ).slice(0, 24)}`;

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
