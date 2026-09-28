import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSource } from "../src/analyzer.mjs";
import { analyzeAndDecide } from "../src/pipeline.mjs";

/**
 * 测试用例按真实微信 bundle 的结构写：`require` 是 `define` factory 的参数，
 * 不是顶层全局。这决定了它会不会被当成宿主注入的名字。
 */
const wrap = (modules) =>
  modules
    .map(
      ([modulePath, body]) =>
        `define(${JSON.stringify(modulePath)}, function (require, module, exports) {\n${body}\n});`,
    )
    .join("\n");

const analyze = (source) =>
  analyzeSource({ source, filePath: "app-service.js" });

const entityIds = (result) =>
  result.findings.map((finding) => finding.runtimeEntity.entityId);

const hostEntityIds = (result) =>
  entityIds(result).filter((entityId) =>
    /^(wx|window|document|process|getApp|Page|Component|App|Behavior)\b/u.test(
      entityId,
    ),
  );

test("bundle 内部模块的纯语言导出不产生宿主依赖", () => {
  const result = analyze(
    wrap([
      ["utils/math.js", "  exports.add = function (a, b) { return a + b; };"],
      [
        "pages/index/index.js",
        '  var m = require("utils/math.js");\n  m.add(1, 2);',
      ],
    ]),
  );
  assert.deepEqual(hostEntityIds(result), []);
});

test("bundle 内部模块导出直接引用宿主时被识别", () => {
  const result = analyze(
    wrap([
      ["api/request.js", "  exports.send = wx.request;"],
      [
        "pages/index/index.js",
        '  var api = require("api/request.js");\n  api.send({ url: "x" });',
      ],
    ]),
  );
  assert.ok(
    hostEntityIds(result).some((entityId) => entityId.startsWith("wx")),
    `应识别出 wx 依赖，实际得到：${entityIds(result).join(", ")}`,
  );
});

test("导出函数的函数体内引用宿主同样被识别", () => {
  const result = analyze(
    wrap([
      [
        "api/deep.js",
        '  exports.send = function () { return wx.request({ url: "x" }); };',
      ],
      [
        "pages/index/index.js",
        '  var api = require("api/deep.js");\n  api.send();',
      ],
    ]),
  );
  assert.ok(
    hostEntityIds(result).some((entityId) => entityId.startsWith("wx")),
    `应穿透函数体识别 wx，实际得到：${entityIds(result).join(", ")}`,
  );
});

test("相对路径 require 按请求方模块解析后命中", () => {
  const result = analyze(
    wrap([
      ["common/util.js", "  exports.answer = 42;"],
      [
        "pages/index/index.js",
        '  var util = require("../../common/util.js");\n  util.answer;',
      ],
    ]),
  );
  assert.deepEqual(hostEntityIds(result), []);
});

test("外部依赖保持原有 module_import 行为", () => {
  const result = analyze(
    wrap([
      [
        "pages/index/index.js",
        "  var sdk = require('wx-server-sdk');\n  sdk.init();",
      ],
    ]),
  );
  const finding = result.findings.find(
    (item) => item.runtimeEntity.entityId === "sdk.init",
  );
  assert.ok(
    finding,
    `应保留 sdk.init 的 finding，实际：${entityIds(result).join(", ")}`,
  );
  assert.equal(finding.bindingRef.bindingKind, "module_import");
});

test("动态导出不解析，保持原来的未知行为", () => {
  const result = analyze(
    wrap([
      ["api/dynamic.js", "  exports[key] = function () {};"],
      [
        "pages/index/index.js",
        '  var api = require("api/dynamic.js");\n  api.anything();',
      ],
    ]),
  );
  const finding = result.findings.find((item) =>
    item.runtimeEntity.entityId.startsWith("api/dynamic"),
  );
  assert.ok(finding, "动态导出应保持 module_import finding");
  assert.equal(finding.bindingRef.bindingKind, "module_import");
});

test("纯语言导出在决策链上不会产生 PROTECT", () => {
  const result = analyzeAndDecide({
    source: wrap([
      [
        "utils/calc.js",
        "  exports.sum = function (a, b) { return a + b; };",
      ],
      [
        "pages/index/index.js",
        '  var calc = require("utils/calc.js");\n  calc.sum(1, 2);',
      ],
    ]),
    filePath: "app-service.js",
    targetRuntimeIds: [],
    targetRuntimeSource: "unknown",
  });
  assert.equal(result.summary.byKnowledgeState.PROTECT, 0);
});
