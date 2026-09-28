import assert from "node:assert/strict";
import test from "node:test";

import { REASON_CODE } from "../src/constants.mjs";
import { classifyUnknown } from "../src/evaluation/unknown-breakdown.mjs";

const unresolvedDecision = (inFileDefinition = null) => ({
  decision: { reasonCodes: [REASON_CODE.BINDING_UNRESOLVED] },
  bindingRef: { inFileDefinition },
});

test("文件内自己赋值的全局归到 code-defined-global", () => {
  // 决策来自合成表达式（没有赋值上下文），标记要来自语料记录。
  const bucket = classifyUnknown({
    record: {
      entityId: "wh.nh",
      bindingKind: "unresolved_global",
      inFileDefinition: "top_level_assignment",
    },
    decision: unresolvedDecision(),
  });

  assert.equal(bucket, "code-defined-global");
});

test("决策自带的文件内定义标记优先于名字形状", () => {
  const bucket = classifyUnknown({
    record: { entityId: "$gwx", bindingKind: "unresolved_global" },
    decision: unresolvedDecision("function_body_assignment"),
  });

  assert.equal(bucket, "code-defined-global");
});

test("真正的宿主注入对象仍归到基础库私有全局", () => {
  for (const entityId of ["__wxConfig", "__subContextEngine__", "nt_0"]) {
    const bucket = classifyUnknown({
      record: { entityId, bindingKind: "unresolved_global" },
      decision: unresolvedDecision(),
    });
    assert.equal(bucket, "wechat-base-library-private-global");
  }
});

test("模块边界与公开宿主 API 的分类不变", () => {
  assert.equal(
    classifyUnknown({
      record: {
        entityId: "lodash.map",
        bindingKind: "module_import",
      },
      decision: unresolvedDecision(),
    }),
    "module-boundary",
  );
  assert.equal(
    classifyUnknown({
      record: { entityId: "wx.loadSubpackage" },
      decision: unresolvedDecision(),
    }),
    "wechat-public-host-api",
  );
  assert.equal(
    classifyUnknown({
      record: { entityId: "someAppGlobal.thing" },
      decision: unresolvedDecision(),
    }),
    "unresolved-global",
  );
});
