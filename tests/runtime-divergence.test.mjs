import assert from "node:assert/strict";
import test from "node:test";

import { KNOWLEDGE_STATE } from "../src/constants.mjs";
import {
  SYNTHETIC_STRESS_ENTITIES,
  isDifficultyEntity,
  summarize,
} from "../src/evaluation/runtime-divergence-benchmark.mjs";

test("困难集只收宿主强相关实体", () => {
  for (const entityId of [
    "wx.request",
    "Page",
    "process.version",
    "Buffer.from",
    "window.document",
    "document.cookie",
    "wh.nh",
    "$gwx",
    "gra",
    "nt_12",
  ]) {
    assert.ok(isDifficultyEntity(entityId), `${entityId} 应属于困难集`);
  }
});

test("语言内建与普通第三方全局不进困难集", () => {
  for (const entityId of [
    "Math.max",
    "Object.defineProperty",
    "JSON.parse",
    "CryptoJS.AES",
    "define",
  ]) {
    assert.ok(!isDifficultyEntity(entityId), `${entityId} 不应属于困难集`);
  }
});

test("人工压力用例子集与自然集分开配置", () => {
  assert.ok(SYNTHETIC_STRESS_ENTITIES.includes("setImmediate"));
  assert.ok(SYNTHETIC_STRESS_ENTITIES.includes("SharedArrayBuffer"));
  assert.ok(SYNTHETIC_STRESS_ENTITIES.includes("wx.request"));
});

test("检出率统计把被放行的差异实体记为漏放", () => {
  const summary = summarize([
    {
      entityId: "wx.request",
      divergent: true,
      decision: KNOWLEDGE_STATE.PROTECT,
      observedRuntimes: ["a", "b"],
      missed: false,
    },
    {
      entityId: "process.version",
      divergent: true,
      decision: KNOWLEDGE_STATE.FOLD,
      observedRuntimes: ["a", "b"],
      missed: true,
    },
    {
      entityId: "Math.max",
      divergent: false,
      decision: KNOWLEDGE_STATE.FOLD,
      observedRuntimes: ["a", "b"],
      missed: false,
    },
  ]);

  assert.equal(summary.entityCount, 3);
  assert.equal(summary.divergentEntityCount, 2);
  assert.equal(summary.blockedDivergentCount, 1);
  assert.equal(summary.missedCount, 1);
  assert.equal(summary.detectionRate, 0.5);
  assert.deepEqual(summary.missedEntities, ["process.version"]);
});

test("没有差异实体时检出率为空而不是 1", () => {
  const summary = summarize([
    {
      entityId: "Math.max",
      divergent: false,
      decision: KNOWLEDGE_STATE.FOLD,
      observedRuntimes: ["a", "b"],
      missed: false,
    },
  ]);

  assert.equal(summary.divergentEntityCount, 0);
  assert.equal(summary.detectionRate, null);
});
