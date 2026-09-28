import test from "node:test";
import assert from "node:assert/strict";

import { rankProbeCandidates } from "../src/ranking/probe-priority.mjs";

test("固定规则排序只改变探测顺序，不输出安全判定", () => {
  const report = rankProbeCandidates({
    records: [
      {
        entityId: "wx.request",
        project: "a",
        resolutionStatus: "resolved",
        capabilityDomain: "network",
        transformationKind: "CALL_EVAL",
      },
      {
        entityId: "wx.request",
        project: "b",
        resolutionStatus: "unresolved",
        capabilityDomain: "network",
        transformationKind: "CALL_EVAL",
      },
      {
        entityId: "Object.keys",
        project: "a",
        resolutionStatus: "resolved",
        capabilityDomain: "unknown",
        transformationKind: "CALL_EVAL",
      },
    ],
  });

  assert.equal(report.results[0].entityId, "wx.request");
  assert.equal(Object.hasOwn(report.results[0], "confidence"), false);
  assert.equal(Object.hasOwn(report.results[0], "safeToFold"), false);
  assert.ok(report.results[0].score > report.results[1].score);
});
