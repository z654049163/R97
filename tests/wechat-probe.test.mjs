import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWechatProbeRequest,
  importWechatProbeResult,
  r97WechatProbe,
} from "../src/evidence/wechat-probe.mjs";

test("微信探针请求排除会拖死 AppService 的 Function 根节点", () => {
  const requested = buildWechatProbeRequest({
    Function: ["existence", "type", "callability"],
    "Function.prototype.bind": ["existence", "type", "callability"],
    "wx.request": ["existence", "type", "callability"],
  });

  assert.deepEqual(Object.keys(requested), ["wx.request"]);
});

test("带 wechatValues 的报告里未探测实体保持未观测", () => {
  const collection = importWechatProbeResult({
    report: {
      stage: "node-vs-wechat",
      wechatTypeofs: {},
      wechatValues: {
        "wx.request": {
          existence: true,
          type: "function",
          callability: true,
        },
      },
    },
    entityDimensions: {
      "wx.request": ["existence", "type", "callability"],
      "Function.prototype.bind": ["existence", "type", "callability"],
    },
    observedAt: "2026-09-18T00:00:00.000Z",
  });

  assert.ok(collection.observations["wx.request"]);
  assert.equal(collection.observations["Function.prototype.bind"], undefined);
});

test("导入真实 node-vs-wechat 报告并生成微信观测", () => {
  const collection = importWechatProbeResult({
    report: {
      stage: "node-vs-wechat",
      wechatTypeofs: {
        "wx.request": "function",
        getApp: "function",
        process: "undefined",
      },
    },
    entityDimensions: {
      "wx.request": ["existence", "type", "callability"],
      getApp: ["existence", "type", "callability"],
      process: ["existence", "type", "callability"],
    },
    observedAt: "2026-09-17T00:00:00.000Z",
  });

  assert.equal(collection.runtimeId, "e4-wechat-real");
  assert.equal(collection.provenance, "runtime_observed");
  assert.deepEqual(collection.observations["wx.request"].values, {
    existence: true,
    type: "function",
    callability: true,
  });
  // 跨项目证据下「不存在」不可外推：`process` 在 fixture 的微信里没有，
  // 不代表被分析项目的微信里没有。保留它会让两边都「不存在」而错误放行。
  assert.equal(collection.observations.process, undefined);
  assert.equal(collection.scopeKind, "cross_project");
});

test("同一项目内采集时「不存在」是有效信息，保留观测", () => {
  const collection = importWechatProbeResult({
    report: {
      stage: "node-vs-wechat",
      wechatValues: {
        "wx.request": {
          existence: true,
          type: "function",
          callability: true,
        },
        process: {
          existence: false,
          type: "undefined",
          callability: false,
        },
      },
      wechatTypeofs: { "wx.request": "function", process: "undefined" },
    },
    entityDimensions: {
      "wx.request": ["existence", "type", "callability"],
      process: ["existence", "type", "callability"],
    },
    scopeKind: "same_project",
  });

  assert.deepEqual(collection.observations.process.values, {
    existence: false,
    type: "undefined",
    callability: false,
  });
});

test("判卷场景用原始观测，不做任何裁剪", () => {
  const collection = importWechatProbeResult({
    report: {
      stage: "node-vs-wechat",
      wechatValues: {
        process: {
          existence: false,
          type: "undefined",
          callability: false,
        },
      },
      wechatTypeofs: { process: "undefined" },
    },
    entityDimensions: {
      process: ["existence", "type", "callability"],
    },
    scopeKind: "raw",
  });

  assert.deepEqual(collection.observations.process.values, {
    existence: false,
    type: "undefined",
    callability: false,
  });
  assert.equal(collection.droppedAbsenceCount, 0);
});

test("拒绝把 Node-only 报告伪装成真实微信证据", () => {
  assert.throws(
    () =>
      importWechatProbeResult({
        report: {
          stage: "node-only",
          nodeTypeofs: {},
        },
        entityDimensions: {
          "wx.request": ["existence"],
        },
      }),
    /node-vs-wechat/,
  );
});

test("微信探针函数保持自包含并返回安全语义维度", () => {
  const result = r97WechatProbe({
    "Math.max": ["existence", "type", "callability"],
    "__r97_missing_root__": ["existence", "type", "callability"],
  });

  assert.deepEqual(result["Math.max"], {
    existence: true,
    type: "function",
    callability: true,
  });
  assert.deepEqual(result.__r97_missing_root__, {
    existence: false,
    type: "undefined",
    callability: false,
  });
});

test("访问器证据不完整时只保留真实观测到的维度", () => {
  const collection = importWechatProbeResult({
    report: {
      stage: "node-vs-wechat",
      wechatTypeofs: {
        "wx.accessor": "undefined",
      },
      wechatValues: {
        "wx.accessor": {
          existence: true,
        },
      },
    },
    entityDimensions: {
      "wx.accessor": ["existence", "type", "callability"],
    },
    observedAt: "2026-09-18T00:00:00.000Z",
  });

  assert.deepEqual(
    collection.observations["wx.accessor"].observedDimensions,
    ["existence"],
  );
  assert.deepEqual(collection.observations["wx.accessor"].values, {
    existence: true,
  });
});
