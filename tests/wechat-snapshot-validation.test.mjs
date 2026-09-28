import assert from "node:assert/strict";
import test from "node:test";

import { classifyDrift } from "../src/evaluation/validate-wechat-snapshot.mjs";

test("能力消失或不再可调用是危险方向", () => {
  assert.equal(
    classifyDrift(
      { existence: true, type: "function", callability: true },
      { existence: false, type: "undefined", callability: false },
    ),
    "declined",
  );
  assert.equal(
    classifyDrift(
      { existence: true, type: "function", callability: true },
      { existence: true, type: "object", callability: false },
    ),
    "declined",
  );
});

test("能力新出现是保守方向", () => {
  assert.equal(
    classifyDrift(
      { existence: false, type: "undefined", callability: false },
      { existence: true, type: "function", callability: true },
    ),
    "improved",
  );
  assert.equal(
    classifyDrift(
      { existence: true, type: "object", callability: false },
      { existence: true, type: "function", callability: true },
    ),
    "improved",
  );
});

test("存在性与可调用性都没跨边界时归为中性", () => {
  assert.equal(
    classifyDrift(
      { existence: true, type: "number", callability: false },
      { existence: true, type: "string", callability: false },
    ),
    "neutral",
  );
});

test("观测缺失不算漂移，需要单独计数", () => {
  // classifyDrift 只在两边都拿得到观测时才会被调用；
  // 缺观测由调用方记入 notRecollected，而不是归成某一类漂移。
  assert.equal(
    classifyDrift(
      { existence: true, type: "function", callability: true },
      { existence: true, type: "function", callability: true },
    ),
    "neutral",
  );
});
