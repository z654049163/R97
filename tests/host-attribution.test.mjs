import assert from "node:assert/strict";
import test from "node:test";

import { classify } from "../src/evaluation/host-attribution-report.mjs";

const exists = (overrides) => ({
  language: false,
  node: false,
  edge: false,
  wechat: false,
  ...overrides,
});

test("只有单一宿主存在的根节点被标为宿主专属", () => {
  assert.equal(
    classify({
      hosts: ["node"],
      exists: exists({ node: true }),
      mappedRuntimeId: null,
    }),
    "host_exclusive_unmapped",
  );
  assert.equal(
    classify({
      hosts: ["edge"],
      exists: exists({ edge: true }),
      mappedRuntimeId: "e5-edge-headless",
    }),
    "host_exclusive_mapped",
  );
});

test("多宿主存在的根节点归为跨宿主，不绑定单一运行时", () => {
  assert.equal(
    classify({
      hosts: ["node", "edge"],
      exists: exists({ node: true, edge: true }),
      mappedRuntimeId: null,
    }),
    "cross_host",
  );
});

test("任何宿主都不存在的根节点不是宿主能力", () => {
  assert.equal(
    classify({
      hosts: [],
      exists: exists(),
      mappedRuntimeId: null,
    }),
    "absent_everywhere",
  );
});

test("没有任何观测时不给结论", () => {
  assert.equal(
    classify({
      hosts: [],
      exists: {
        language: null,
        node: null,
        edge: null,
        wechat: null,
      },
      mappedRuntimeId: null,
    }),
    "unobserved",
  );
});
