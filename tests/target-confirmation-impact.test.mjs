import assert from "node:assert/strict";
import test from "node:test";

import { countTransitions } from "../src/evaluation/target-confirmation-impact.mjs";

test("逐样本转移只统计真实发生的状态变化", () => {
  const transitions = countTransitions(
    ["UNKNOWN", "UNKNOWN", "UNKNOWN", "FOLD", "FOLD", "PROTECT"],
    ["PROTECT", "FOLD", "UNKNOWN", "PROTECT", "UNKNOWN", "PROTECT"],
  );

  assert.deepEqual(transitions, {
    UNKNOWN_FOLD: 1,
    UNKNOWN_PROTECT: 1,
    UNKNOWN_UNKNOWN: 1,
    FOLD_FOLD: 0,
    FOLD_PROTECT: 1,
    FOLD_UNKNOWN: 1,
    PROTECT_PROTECT: 1,
    PROTECT_FOLD: 0,
    PROTECT_UNKNOWN: 0,
  });
});

test("聚合差不能替代转移矩阵", () => {
  // 两条 FOLD 一进一出，FOLD 总数不变，但确实发生了转移。
  const transitions = countTransitions(
    ["FOLD", "FOLD", "UNKNOWN"],
    ["UNKNOWN", "FOLD", "FOLD"],
  );
  const beforeFold = 2;
  const afterFold = 2;

  assert.equal(afterFold - beforeFold, 0, "聚合差看起来什么都没发生");
  assert.equal(transitions.FOLD_UNKNOWN, 1, "但实际有一条 FOLD 变成了 UNKNOWN");
  assert.equal(transitions.UNKNOWN_FOLD, 1);
});

test("缺失的 after 状态按 UNKNOWN 处理", () => {
  const transitions = countTransitions(["FOLD"], []);
  assert.equal(transitions.FOLD_UNKNOWN, 1);
});
