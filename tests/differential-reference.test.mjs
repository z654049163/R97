import test from "node:test";
import assert from "node:assert/strict";

import {
  REFERENCE_STATE,
  buildEvaluationExpression,
  classifyReferenceCase,
  evaluateSourceInLanguageBaseline,
  evaluateSourceInNode,
} from "../src/evaluation/differential-reference.mjs";

const observed = (result) => ({
  status: "observed",
  outcome: "value",
  result,
});

test("三端观测结果一致时允许折叠", () => {
  const result = classifyReferenceCase(
    {
      caseId: "pure",
      category: "language",
      source: "1 + 1;",
      requiredRuntimes: ["language", "node", "edge"],
    },
    {
      language: observed({ kind: "number", value: 2 }),
      node: observed({ kind: "number", value: 2 }),
      edge: observed({ kind: "number", value: 2 }),
    },
  );

  assert.equal(result.referenceState, REFERENCE_STATE.ALLOW_FOLD);
});

test("任一必需运行时结果不同则阻断折叠", () => {
  const result = classifyReferenceCase(
    {
      caseId: "host-api",
      category: "node",
      source: "process.version;",
      requiredRuntimes: ["language", "node", "edge"],
    },
    {
      language: {
        status: "observed",
        outcome: "exception",
        result: { kind: "exception", name: "ReferenceError" },
      },
      node: observed({ kind: "string", value: "v24.0.0" }),
      edge: {
        status: "observed",
        outcome: "exception",
        result: { kind: "exception", name: "ReferenceError" },
      },
    },
  );

  assert.equal(result.referenceState, REFERENCE_STATE.BLOCK_FOLD);
});

test("缺少必需运行时时保持未核验", () => {
  const result = classifyReferenceCase(
    {
      caseId: "wechat",
      category: "wechat",
      source: "wx.request({});",
      requiredRuntimes: ["language", "node", "edge", "wechat"],
    },
    {
      language: observed({ kind: "undefined" }),
      node: observed({ kind: "undefined" }),
      edge: observed({ kind: "undefined" }),
      wechat: {
        status: "missing",
        reason: "No real WeChat runtime.",
      },
    },
  );

  assert.equal(result.referenceState, REFERENCE_STATE.UNVERIFIED);
});

test("有副作用的表达式不进入执行参考", () => {
  const result = classifyReferenceCase(
    {
      caseId: "network",
      category: "side_effect",
      source: "fetch('https://example.invalid');",
      executionPolicy: "do-not-execute",
      unverifiedReason: "network side effect",
    },
    {},
  );

  assert.equal(result.referenceState, REFERENCE_STATE.UNVERIFIED);
  assert.match(result.reason, /network side effect/);
});

test("语言基线不包含 Node 宿主全局", async () => {
  const result = await evaluateSourceInLanguageBaseline("typeof process;");

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    status: "observed",
    outcome: "value",
    result: { kind: "string", value: "undefined" },
  });
});

test("真实 Node 执行可以观测宿主 API", async () => {
  const result = await evaluateSourceInNode("process.version;");

  assert.equal(result.status, "observed");
  assert.equal(result.outcome, "value");
  assert.equal(result.result.kind, "string");
  assert.match(result.result.value, /^v\d+/);
});

test("表达式异常被归一化为稳定的异常名称", async () => {
  const result = await evaluateSourceInNode("JSON.parse('{');");

  assert.equal(result.status, "observed");
  assert.equal(result.outcome, "exception");
  assert.equal(result.result.name, "SyntaxError");
});

test("对象结果比较包含实际字段值", async () => {
  const result = await evaluateSourceInLanguageBaseline(
    "({ answer: 42 });",
  );

  const normalized = JSON.parse(JSON.stringify(result));
  assert.equal(normalized.result.kind, "object");
  assert.deepEqual(normalized.result.values.answer, {
    kind: "number",
    value: 42,
  });
});

test("执行包装器拒绝空表达式", () => {
  assert.throws(
    () => buildEvaluationExpression("  "),
    /non-empty/,
  );
});
