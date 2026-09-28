import test from "node:test";
import assert from "node:assert/strict";

import { BINDING_KIND, REASON_CODE } from "../src/constants.mjs";
import { classifyGap } from "../src/evaluation/gap-analysis.mjs";

test("证据完整且跨运行时一致时归入安全折叠", () => {
  const result = classifyGap({
    state: "FOLD",
    reasonCodes: [REASON_CODE.ALL_TARGETS_MATCH],
    requiredDimensions: ["existence", "type", "callability"],
  });

  assert.equal(result.bucket, "fold");
});

test("观测到真实差异时归入契约不匹配", () => {
  const result = classifyGap({
    state: "PROTECT",
    reasonCodes: [REASON_CODE.CONTRACT_MISMATCH],
    requiredDimensions: ["existence", "type"],
  });

  assert.equal(result.bucket, "contractMismatch");
});

test("只缺探针可观测维度时归入运行时覆盖缺口", () => {
  const result = classifyGap({
    state: "UNKNOWN",
    reasonCodes: [REASON_CODE.CONTRACT_COVERAGE_MISSING],
    requiredDimensions: ["existence", "type", "callability"],
  });

  assert.equal(result.bucket, "runtimeGap");
  assert.deepEqual(result.unobservableDimensions, []);
});

test("宿主专属 API 未纳入目标运行时归入运行时覆盖缺口", () => {
  const result = classifyGap({
    state: "PROTECT",
    reasonCodes: [REASON_CODE.REQUIRED_RUNTIME_MISSING],
    requiredDimensions: ["existence", "type", "callability"],
  });

  assert.equal(result.bucket, "runtimeGap");
});

test("缺少副作用维度时归入证据协议缺口，换运行时也无法解决", () => {
  const result = classifyGap({
    state: "UNKNOWN",
    reasonCodes: [REASON_CODE.CONTRACT_COVERAGE_MISSING],
    requiredDimensions: [
      "existence",
      "type",
      "callability",
      "observable_side_effect",
    ],
  });

  assert.equal(result.bucket, "protocolGap");
  assert.deepEqual(result.unobservableDimensions, ["observable_side_effect"]);
});

test("绑定未解析单独分桶，不与运行时缺口混淆", () => {
  const result = classifyGap({
    state: "UNKNOWN",
    reasonCodes: [REASON_CODE.BINDING_UNRESOLVED],
    requiredDimensions: ["existence", "type"],
  });

  assert.equal(result.bucket, "unresolvedBinding");
});

test("模块导入按语料原始绑定归因，不记成绑定解析能力不足", () => {
  const result = classifyGap({
    state: "UNKNOWN",
    reasonCodes: [REASON_CODE.BINDING_UNRESOLVED],
    requiredDimensions: ["existence", "type"],
    bindingKind: BINDING_KIND.MODULE_IMPORT,
  });

  assert.equal(result.bucket, "moduleBoundary");
});

test("原始绑定为运行时常量时仍归入绑定未解析", () => {
  const result = classifyGap({
    state: "UNKNOWN",
    reasonCodes: [REASON_CODE.BINDING_UNRESOLVED],
    requiredDimensions: ["existence", "type"],
    bindingKind: BINDING_KIND.UNRESOLVED_GLOBAL,
  });

  assert.equal(result.bucket, "unresolvedBinding");
});

test("契约要求宿主运行时但缺该运行时观测时归入运行时覆盖缺口", () => {
  const result = classifyGap({
    state: "UNKNOWN",
    reasonCodes: [REASON_CODE.EVIDENCE_MISSING],
    requiredDimensions: ["existence", "type"],
    requiredRuntimeIds: ["wechat"],
  });

  assert.equal(result.bucket, "runtimeGap");
});

test("没有宿主运行时要求的证据缺口不冒充运行时缺口", () => {
  const result = classifyGap({
    state: "UNKNOWN",
    reasonCodes: [REASON_CODE.EVIDENCE_MISSING],
    requiredDimensions: ["existence", "type"],
    requiredRuntimeIds: [],
  });

  assert.equal(result.bucket, "other");
});
