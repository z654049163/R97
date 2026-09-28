import assert from "node:assert/strict";
import test from "node:test";

import { inferRequiredRuntimeIds } from "../src/contract-builder.mjs";
import { RUNTIME_IDS } from "../src/runtime-profiles.mjs";

test("宿主专属根节点映射到必须参与比较的真实运行时", () => {
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "wx.request" }),
    [RUNTIME_IDS.WECHAT],
  );
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "process.version" }),
    [RUNTIME_IDS.NODE],
  );
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "window.document" }),
    [RUNTIME_IDS.EDGE],
  );
});

test("跨运行时语言内建对象不强制某个宿主运行时", () => {
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "Math.max" }),
    [],
  );
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "fetch" }),
    [],
  );
});

test("Node 全局函数映射到 Node 运行时", () => {
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "setImmediate" }),
    [RUNTIME_IDS.NODE],
  );
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "clearImmediate" }),
    [RUNTIME_IDS.NODE],
  );
});

test("浏览器专属全局映射到浏览器运行时", () => {
  assert.deepEqual(
    inferRequiredRuntimeIds({ normalizedPath: "MutationObserver" }),
    [RUNTIME_IDS.EDGE],
  );
});

test("跨宿主全局不绑定到单一宿主", () => {
  for (const root of [
    "fetch",
    "Blob",
    "crypto",
    "AbortController",
    "global",
    "URL",
    "TextEncoder",
  ]) {
    assert.deepEqual(
      inferRequiredRuntimeIds({ normalizedPath: `${root}.whatever` }),
      [],
      `${root} 在多个宿主都存在，不应绑定到单一运行时`,
    );
  }
});
