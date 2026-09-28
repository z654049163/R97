import test from "node:test";
import assert from "node:assert/strict";

import { buildProbeExpression } from "../src/evidence/browser-probe.mjs";
import { observeEntityPath } from "../src/evidence/node-probe.mjs";
import { r97WechatProbe } from "../src/evidence/wechat-probe.mjs";
import { WECHAT_PROBE_EXCLUDED_ROOTS } from "../src/evidence/wechat-probe.mjs";
import {
  createOracleProbe,
  createWechatOracleProbe,
  evaluateOracleProbeInVm,
} from "../src/evidence/oracle-probe.mjs";
import { collectLanguageObservations } from "../src/evidence/language-probe.mjs";
import {
  buildDirectProbeExpression,
  evaluateDirectProbeInNode,
} from "../src/evaluation/direct-probe.mjs";

const evaluateExpression = (expression) =>
  new Function(`return ${expression};`)();

test("描述符探针表达式可以在同构环境中执行并返回三个语义维度", () => {
  const result = evaluateExpression(
    buildProbeExpression({
      "String.prototype.toLowerCase": [
        "existence",
        "type",
        "callability",
      ],
    }),
  );

  assert.deepEqual(result["String.prototype.toLowerCase"], {
    existence: true,
    type: "function",
    callability: true,
  });
});

test("描述符探针对不存在的路径返回 undefined 形态", () => {
  const result = evaluateExpression(
    buildProbeExpression({
      "__r97_missing_root__": ["existence", "type", "callability"],
    }),
  );

  assert.deepEqual(result.__r97_missing_root__, {
    existence: false,
    type: "undefined",
    callability: false,
  });
});

test("直接访问探针与描述符探针在普通内建对象上结果一致", () => {
  const entityIds = ["String.prototype.toLowerCase", "JSON.stringify"];
  const direct = evaluateDirectProbeInNode(entityIds);
  const descriptorResult = evaluateExpression(
    buildProbeExpression(Object.fromEntries(
      entityIds.map((id) => [id, ["existence", "type", "callability"]]),
    )),
  );

  for (const entityId of entityIds) {
    assert.deepEqual(direct[entityId], descriptorResult[entityId]);
  }
});

test("直接访问探针在同一路径多次求值时保持稳定", () => {
  const entityIds = ["Object.defineProperty", "Array.prototype.push"];
  const first = evaluateDirectProbeInNode(entityIds);
  const second = evaluateDirectProbeInNode(entityIds);
  assert.deepEqual(first, second);
});

test("Node 探针可以观测内置模块 API 而不是只查询全局变量", () => {
  assert.deepEqual(observeEntityPath("node:fs.readFileSync"), {
    exists: true,
    type: "function",
    callable: true,
  });
  assert.deepEqual(observeEntityPath("node:path.join"), {
    exists: true,
    type: "function",
    callable: true,
  });
});

test("微信探针把 undefined 视为存在，与语言基线口径一致", () => {
  const result = r97WechatProbe({
    undefined: ["existence", "type", "callability"],
  });

  assert.deepEqual(result.undefined, {
    existence: true,
    type: "undefined",
    callability: false,
  });
});

test("微信探针能区分缺失路径与值为 undefined 的属性", () => {
  const result = r97WechatProbe({
    __r97_missing_root__: ["existence", "type", "callability"],
    "JSON.stringify": ["existence", "type", "callability"],
    "JSON.__r97_missing__": ["existence", "type", "callability"],
  });

  assert.deepEqual(result.__r97_missing_root__, {
    existence: false,
    type: "undefined",
    callability: false,
  });
  assert.deepEqual(result["JSON.stringify"], {
    existence: true,
    type: "function",
    callability: true,
  });
  assert.deepEqual(result["JSON.__r97_missing__"], {
    existence: false,
    type: "undefined",
    callability: false,
  });
});

test("微信探针与 Node 探针在语言内建根符号上口径一致", () => {
  const entityIds = ["undefined", "NaN", "Infinity", "Math", "JSON.parse"];
  const wechat = r97WechatProbe(
    Object.fromEntries(
      entityIds.map((id) => [id, ["existence", "type", "callability"]]),
    ),
  );

  for (const entityId of entityIds) {
    const node = observeEntityPath(entityId);
    assert.equal(
      wechat[entityId].existence,
      node.exists,
      `${entityId} 的 existence 口径不一致`,
    );
    assert.equal(wechat[entityId].type, node.type);
    assert.equal(wechat[entityId].callability, node.callable);
  }
});

test("宿主对象对 in 返回空时，微信探针仍按真实读取判定存在性", () => {
  // 小程序 AppService 里的 wx.cloud 就是这样：属性读取拿得到函数，
  // 但 in、Object.keys 全部返回空。探针不能据此判定 API 不存在。
  const host = new Proxy(
    {},
    {
      has: () => false,
      get: (target, property) =>
        property === "init" ? function init() {} : undefined,
      ownKeys: () => [],
    },
  );
  globalThis.__r97_virtual_host__ = host;
  try {
    const result = r97WechatProbe({
      "__r97_virtual_host__.init": [
        "existence",
        "type",
        "callability",
      ],
      "__r97_virtual_host__.missing": [
        "existence",
        "type",
        "callability",
      ],
    });

    assert.deepEqual(result["__r97_virtual_host__.init"], {
      existence: true,
      type: "function",
      callability: true,
    });
    assert.deepEqual(result["__r97_virtual_host__.missing"], {
      existence: false,
      type: "undefined",
      callability: false,
    });
  } finally {
    delete globalThis.__r97_virtual_host__;
  }
});

test("Node 与微信判卷用的是同一份探针实现", () => {
  // 判卷结论依赖「同一把尺子」：三边跑同一段代码，差异才能归因到环境。
  // 两份实现只要分头维护，哪怕语义只差一个 in 的用法，也会让比较失效。
  assert.equal(
    String(createOracleProbe()),
    String(createWechatOracleProbe()),
  );
});

test("微信侧不参与判卷的根节点带明确原因", () => {
  const excluded = WECHAT_PROBE_EXCLUDED_ROOTS.find(
    (entry) => entry.root === "Function",
  );

  assert.ok(excluded, "Function 必须被显式列为不参与微信判卷");
  assert.match(excluded.reason, /栈溢出|卡死/);
});

test("判卷探针对宿主对象与描述符探针口径一致", () => {
  const entityIds = ["undefined", "Math.max", "JSON.parse", "wx.request"];
  const oracle = createOracleProbe()(entityIds);

  for (const entityId of entityIds) {
    const node = observeEntityPath(entityId);
    assert.equal(
      oracle[entityId].existence,
      node.exists,
      `${entityId} 的 existence 口径不一致`,
    );
  }
});

test("CommonJS 模块绑定不随启动方式变化", () => {
  // `require` / `module` / `exports` / `__dirname` / `__filename` 是模块级绑定，
  // 不是 globalThis 属性。实测 node -e（CJS）下 globalThis.require 是函数、
  // ESM 脚本下是 undefined——若按 globalThis 判断，Node 侧会把 require 观测成
  // 「不存在」，与语言基线一致，从而可能放行 require 相关的折叠。
  const expectations = {
    require: { exists: true, type: "function", callable: true },
    module: { exists: true, type: "object", callable: false },
    exports: { exists: true, type: "object", callable: false },
    __dirname: { exists: true, type: "string", callable: false },
    __filename: { exists: true, type: "string", callable: false },
  };

  for (const [entityId, expected] of Object.entries(expectations)) {
    assert.deepEqual(
      observeEntityPath(entityId),
      expected,
      `${entityId} 在 Node 侧应按 CommonJS 模块绑定解析`,
    );
  }

  const oracle = evaluateDirectProbeInNode([
    "require",
    "__dirname",
    "require.resolve",
  ]);
  assert.equal(oracle.require.existence, true);
  assert.equal(oracle.require.type, "function");
  assert.equal(oracle.__dirname.existence, true);
  assert.equal(oracle["require.resolve"].existence, true);
  assert.equal(oracle["require.resolve"].type, "function");
});

test("语言基线判卷跑在隔离 vm 里，只含 ECMAScript 内建", () => {
  const result = evaluateOracleProbeInVm([
    "undefined",
    "Math.max",
    "JSON.parse",
    "globalThis",
    "console",
    "process",
    "require",
    "wx",
    "window",
  ]);

  for (const entityId of [
    "undefined",
    "Math.max",
    "JSON.parse",
    "globalThis",
  ]) {
    assert.equal(
      result[entityId].existence,
      true,
      `${entityId} 是 ECMAScript 内建，语言基线里应当存在`,
    );
  }
  for (const entityId of [
    "console",
    "process",
    "require",
    "wx",
    "window",
  ]) {
    assert.equal(
      result[entityId].existence,
      false,
      `${entityId} 是宿主对象，语言基线里不应当存在`,
    );
  }
});

test("语言基线的 globalThis 指向裸引擎全局，不泄漏宿主对象", () => {
  // `globalThis` 是 ECMAScript 内建，但它的内容取决于宿主。引擎此前在 Node
  // realm 里展开它，于是 globalThis.console 被当成语言内建观测成「存在」，
  // 与真实裸引擎不一致——实测因此放行了 2 条 globalThis.console 折叠。
  const entityDimensions = Object.fromEntries(
    [
      "globalThis",
      "globalThis.Math",
      "globalThis.console",
      "globalThis.process",
      "globalThis.require",
    ].map((entityId) => [entityId, ["existence", "type"]]),
  );
  const language = collectLanguageObservations({ entityDimensions });

  assert.equal(language.observations.globalThis.values.existence, true);
  assert.equal(language.observations["globalThis.Math"].values.existence, true);
  for (const entityId of [
    "globalThis.console",
    "globalThis.process",
    "globalThis.require",
  ]) {
    assert.equal(
      language.observations[entityId].values.existence,
      false,
      `${entityId} 是宿主对象，语言基线里不应当存在`,
    );
  }
});
