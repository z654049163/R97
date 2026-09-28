import test from "node:test";
import assert from "node:assert/strict";

import {
  KNOWLEDGE_STATE,
  REASON_CODE,
  TARGET_RUNTIME_SOURCE,
} from "../src/constants.mjs";
import { buildEvidenceRecords } from "../src/evidence/evidence-builder.mjs";
import { collectLanguageObservations } from "../src/evidence/language-probe.mjs";
import { collectNodeObservations } from "../src/evidence/node-probe.mjs";
import { analyzeAndDecide } from "../src/pipeline.mjs";
import { RUNTIME_IDS } from "../src/runtime-profiles.mjs";

const AS_OF = "2026-09-17T12:00:00.000Z";
const VALID_FROM = "2026-09-17T00:00:00.000Z";
const VALID_UNTIL = "2026-10-17T00:00:00.000Z";

const runWithEvidence = (source, evidenceRecords = []) =>
  analyzeAndDecide({
    source,
    filePath: "evidence-chain.js",
    targetRuntimeIds: [RUNTIME_IDS.LANGUAGE, RUNTIME_IDS.NODE],
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    policyVersion: "policy-evidence",
    asOf: AS_OF,
    evidenceRecords,
  });

const collectEvidence = (plans) => {
  const entityDimensions = Object.fromEntries(
    plans.map((plan) => [
      plan.runtimeEntity.entityId,
      plan.semanticContract.requiredDimensions,
    ]),
  );
  const language = collectLanguageObservations({
    entityDimensions,
    observedAt: VALID_FROM,
  });
  const node = collectNodeObservations({
    entityDimensions,
    observedAt: VALID_FROM,
  });

  return buildEvidenceRecords({
    decisionPlans: plans,
    runtimeCollections: {
      [RUNTIME_IDS.LANGUAGE]: language,
      [RUNTIME_IDS.NODE]: node,
    },
    policyVersion: "policy-evidence",
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
  });
};

test("E1 语言基线只观察 ECMAScript 内建对象", () => {
  const result = collectLanguageObservations({
    entityDimensions: {
      "Object.keys": ["existence", "type", "callability"],
      "process.version": ["existence", "type", "callability"],
      "wx.request": ["existence", "type", "callability"],
    },
  });

  assert.equal(result.provenance, "runtime_observed");
  assert.deepEqual(result.observations["Object.keys"].values, {
    existence: true,
    type: "function",
    callability: true,
  });
  assert.deepEqual(result.observations["process.version"].values, {
    existence: false,
    type: "undefined",
    callability: false,
  });
  assert.deepEqual(result.observations["wx.request"].values, {
    existence: false,
    type: "undefined",
    callability: false,
  });
});

test("证据构建器使用 DecisionQuery 的 evaluatorRuntimeId 并支持 E1/E2 闭环", () => {
  const initial = runWithEvidence("Object.keys({ value: 1 });");
  assert.equal(initial.decisions.length, 1);
  assert.equal(initial.decisions[0].decision.knowledgeState, "UNKNOWN");

  const records = collectEvidence(initial.decisions);
  assert.ok(records.length >= 2);
  assert.ok(
    records.every(
      (record) => record.evaluatorRuntimeId === RUNTIME_IDS.LANGUAGE,
    ),
  );

  const resolved = runWithEvidence(
    "Object.keys({ value: 1 });",
    records,
  );
  assert.equal(resolved.decisions[0].decision.knowledgeState, "FOLD");
  assert.equal(resolved.decisions[0].decision.enforcementAction, "ALLOW_FOLD");
});

test("Node 独有实体在语言基线下被保护", () => {
  const initial = runWithEvidence("process.version;");
  const records = collectEvidence(initial.decisions);
  const resolved = runWithEvidence("process.version;", records);

  assert.equal(resolved.decisions.length, 1);
  assert.equal(resolved.decisions[0].decision.knowledgeState, "PROTECT");
  assert.equal(resolved.decisions[0].decision.enforcementAction, "BLOCK_FOLD");
  assert.ok(
    resolved.decisions[0].decision.reasonCodes.includes(
      REASON_CODE.CONTRACT_MISMATCH,
    ),
  );
});

test("未满足最低证据等级时不会为了闭环而折叠", () => {
  const initial = runWithEvidence("Object.keys({ value: 1 });");
  const records = collectEvidence(initial.decisions).map((record) => ({
    ...record,
    provenance: "llm_suggestion",
  }));
  const resolved = runWithEvidence("Object.keys({ value: 1 });", records);

  assert.equal(resolved.decisions[0].decision.knowledgeState, "UNKNOWN");
  assert.ok(
    resolved.decisions[0].decision.reasonCodes.includes(
      REASON_CODE.EVIDENCE_NOT_FOLD_ELIGIBLE,
    ),
  );
});

test("重复的证据记录不会让决策抛出，且证据编号保持唯一", () => {
  const initial = runWithEvidence("Object.keys({ value: 1 });");
  const records = collectEvidence(initial.decisions);
  const duplicated = [...records, ...records];

  const resolved = runWithEvidence("Object.keys({ value: 1 });", duplicated);
  const evidenceIds = resolved.decisions[0].decision.evidenceIds;

  assert.equal(resolved.decisions[0].decision.knowledgeState, "FOLD");
  assert.equal(new Set(evidenceIds).size, evidenceIds.length);
});

test("证据过期且记录重复时返回 UNKNOWN 而不是抛出", () => {
  const initial = runWithEvidence("Object.keys({ value: 1 });");
  const expired = collectEvidence(initial.decisions).map((record) => ({
    ...record,
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-09-01T00:00:00.000Z",
  }));

  const resolved = runWithEvidence("Object.keys({ value: 1 });", [
    ...expired,
    ...expired,
  ]);

  assert.equal(resolved.decisions[0].decision.knowledgeState, "UNKNOWN");
  assert.ok(
    resolved.decisions[0].decision.reasonCodes.includes(
      REASON_CODE.EVIDENCE_EXPIRED,
    ),
  );
  const evidenceIds = resolved.decisions[0].decision.evidenceIds;
  assert.equal(new Set(evidenceIds).size, evidenceIds.length);
});
