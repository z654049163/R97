import test from "node:test";
import assert from "node:assert/strict";

import {
  SEMANTIC_DIMENSION,
} from "../src/constants.mjs";
import {
  createEvidenceRecord,
  createRuntimeObservation,
} from "../src/model.mjs";

const createObservation = () =>
  createRuntimeObservation({
    runtimeProfileId: "node-24",
    observedDimensions: [SEMANTIC_DIMENSION.EXISTENCE],
    values: { [SEMANTIC_DIMENSION.EXISTENCE]: true },
  });

const createEvidence = ({
  validFrom = "2026-09-01T00:00:00.000Z",
  validUntil = "2026-10-01T00:00:00.000Z",
} = {}) =>
  createEvidenceRecord({
    evidenceId: "evidence-1",
    entityId: "wx.request",
    usageContextId: "call-no-args",
    semanticContractId: "contract-1",
    evaluatorRuntimeId: "node-24",
    observations: { "node-24": createObservation() },
    provenance: "runtime_observed",
    validFrom,
    validUntil,
    policyVersion: "policy-1",
  });

test("证据有效期必须使用合法时间", () => {
  assert.throws(
    () => createEvidence({ validFrom: "not-a-date" }),
    /validFrom must be a valid date-time string/,
  );
});

test("证据结束时间不能早于开始时间", () => {
  assert.throws(
    () =>
      createEvidence({
        validFrom: "2026-10-02T00:00:00.000Z",
        validUntil: "2026-10-01T00:00:00.000Z",
      }),
    /validFrom must not be after validUntil/,
  );
});

test("合法有效期可以正常创建", () => {
  const evidence = createEvidence();

  assert.equal(evidence.validFrom, "2026-09-01T00:00:00.000Z");
  assert.equal(evidence.validUntil, "2026-10-01T00:00:00.000Z");
});
