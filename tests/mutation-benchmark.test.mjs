import assert from "node:assert/strict";
import test from "node:test";

import {
  MUTATION_FAMILIES,
  describeFindings,
  runMutationBenchmark,
} from "../src/evaluation/mutation-benchmark.mjs";

test("变异基准的断言用例全部通过", () => {
  const summary = runMutationBenchmark({
    generatedAt: "2026-09-22T00:00:00.000Z",
  });

  const failures = summary.results
    .filter((result) => !result.passed && !result.knownLimitation)
    .map((result) => `${result.caseId}: ${result.failure}`);
  assert.deepEqual(failures, []);
  assert.ok(summary.assertedCount > 0);
});

test("变异基准覆盖五类变异族", () => {
  const families = new Set(MUTATION_FAMILIES.map((item) => item.family));

  assert.deepEqual(
    [...families].sort(),
    [
      "alias-resolution",
      "binding-shadowing",
      "dynamic-property",
      "runtime-attribution",
      "transformation-aware",
    ],
  );
});

test("被参数遮蔽的宿主全局不产生 finding", () => {
  assert.deepEqual(
    describeFindings({ source: "function f(wx) { wx.request({}); }" }),
    [],
  );
});

test("被重新赋值的别名退化为局部，不再继承宿主属性", () => {
  const findings = describeFindings({
    source: "let w = wx; w = {}; w.request({});",
  });
  const entityIds = findings.map((finding) => finding.entityId);

  assert.ok(entityIds.includes("wx"));
  assert.ok(!entityIds.includes("wx.request"));
});

test("调用点要求可调用性，分支判断不要求", () => {
  const call = describeFindings({
    source: 'wx.setStorageSync("a", 1);',
  }).find((finding) => finding.entityId === "wx.setStorageSync");
  const branch = describeFindings({
    source: "if (wx.setStorageSync) {}",
  }).find((finding) => finding.entityId === "wx.setStorageSync");

  assert.ok(call.requiredDimensions.includes("callability"));
  assert.ok(!branch.requiredDimensions.includes("callability"));
});
