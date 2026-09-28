import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSource } from "../src/analyzer.mjs";

const findEntity = (result, entityId) =>
  result.findings.find(
    (finding) => finding.runtimeEntity.entityId === entityId,
  );

test("识别直接运行时 API 调用", () => {
  const result = analyzeSource({
    filePath: "direct.js",
    source: "wx.request({ url: 'https://example.com' });",
  });

  const finding = findEntity(result, "wx.request");
  assert.ok(finding);
  assert.equal(finding.transformationKind, "CALL_EVAL");
  assert.equal(finding.bindingRef.bindingKind, "runtime_global");
  assert.equal(finding.usageContext.accessMode, "call");
});

test("解析运行时全局别名", () => {
  const result = analyzeSource({
    filePath: "alias.js",
    source: "const client = wx; client.request({ url: 'x' });",
  });

  const finding = findEntity(result, "wx.request");
  assert.ok(finding);
  assert.deepEqual(finding.bindingRef.aliasChain, ["client", "wx", "request"]);
});

test("局部变量不会误判为运行时全局", () => {
  const result = analyzeSource({
    filePath: "shadow.js",
    source: "function run(wx) { wx.request({ url: 'x' }); }",
  });

  assert.equal(findEntity(result, "wx.request"), undefined);
});

test("局部声明遮蔽全局 wx 时不产生宿主依赖", () => {
  const result = analyzeSource({
    filePath: "shadow-const.js",
    source: [
      "const wx = {};",
      "wx.request({ url: 'x' });",
    ].join("\n"),
  });

  assert.equal(findEntity(result, "wx.request"), undefined);
  assert.equal(result.findingCount, 0);
});

test("包装函数把 wx 作为参数传入时按局部变量处理", () => {
  const result = analyzeSource({
    filePath: "wrapper.js",
    source: [
      "function callWith(target) { target.request({ url: 'x' }); }",
      "callWith(wx);",
    ].join("\n"),
  });

  assert.equal(findEntity(result, "target.request"), undefined);
});

test("无法解析的动态宿主访问降级为 dynamic 绑定", () => {
  const result = analyzeSource({
    filePath: "dynamic-host.js",
    source: [
      "function callApi(wx, method) {",
      "  wx[method]({ url: 'x' });",
      "}",
    ].join("\n"),
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].bindingRef.resolutionStatus, "dynamic");
  assert.equal(result.findings[0].runtimeEntity.entityId, "wx");
  assert.equal(result.findings[0].usageContext.dynamicPropertyAccess, true);
});

test("常量变量作为属性名时解析为静态运行时 API", () => {
  const result = analyzeSource({
    filePath: "dynamic.js",
    source: "const key = 'request'; wx[key]({ url: 'x' });",
  });

  const finding = findEntity(result, "wx.request");
  assert.ok(finding);
  assert.equal(finding.bindingRef.resolutionStatus, "resolved");
  assert.equal(finding.usageContext.dynamicPropertyAccess, false);
  assert.equal(finding.usageContext.accessMode, "call");
});

test("有限常量传播支持拼接、无插值模板和常量别名", () => {
  const result = analyzeSource({
    filePath: "constant-propagation.js",
    source: [
      "const first = 'req';",
      "const second = first + 'uest';",
      "const third = `request`;",
      "const alias = second;",
      "wx[alias]();",
      "console[third]();",
    ].join("\n"),
  });

  assert.ok(findEntity(result, "wx.request"));
  assert.ok(findEntity(result, "console.request"));
});

test("无法唯一确定的属性名继续按动态访问处理", () => {
  const result = analyzeSource({
    filePath: "dynamic-fallback.js",
    source: [
      "let key = 'request';",
      "key = 'scanCode';",
      "wx[key]();",
      "const other = flag ? 'request' : 'scanCode';",
      "wx[other]();",
      "function callApi(key) { wx[key](); }",
    ].join("\n"),
  });

  const dynamicFindings = result.findings.filter(
    (finding) => finding.usageContext.dynamicPropertyAccess,
  );
  assert.equal(dynamicFindings.length, 3);
  assert.ok(dynamicFindings.every((finding) => finding.runtimeEntity.entityId === "wx"));
});

test("空白字符串属性按动态属性处理，不写入空别名链", () => {
  const result = analyzeSource({
    filePath: "blank-property.js",
    source: "wx[' '].request({ url: 'x' });",
  });

  const finding = findEntity(result, "wx");
  assert.ok(finding);
  assert.equal(finding.bindingRef.resolutionStatus, "dynamic");
  assert.ok(finding.bindingRef.aliasChain.every((item) => item.trim() !== ""));
});

test("识别 require 后的模块导入调用", () => {
  const result = analyzeSource({
    filePath: "module.js",
    source: "const fs = require('fs'); fs.readFileSync('x.js');",
  });

  const finding = findEntity(result, "node:fs.readFileSync");
  assert.ok(finding);
  assert.equal(finding.bindingRef.bindingKind, "module_import");
  assert.equal(finding.runtimeEntity.capabilityDomain, "storage");
});

test("解析 Node 内置模块的具名与解构导入", () => {
  const result = analyzeSource({
    filePath: "module-imports.mjs",
    source: [
      "import { readFile } from 'node:fs/promises';",
      "const { join } = require('path');",
      "readFile('x');",
      "join('a', 'b');",
    ].join("\n"),
  });

  assert.ok(findEntity(result, "node:fs.promises.readFile"));
  assert.ok(findEntity(result, "node:path.join"));
});

test("识别 if 中的运行时分支条件", () => {
  const result = analyzeSource({
    filePath: "branch.js",
    source: "if (typeof wx !== 'undefined') { wx.request({ url: 'x' }); }",
  });

  const branch = result.findings.find(
    (finding) => finding.transformationKind === "BRANCH_PRUNE",
  );
  assert.ok(branch);
  assert.equal(branch.runtimeEntity.entityId, "wx");
  assert.equal(branch.usageContext.accessMode, "branch_test");
});

test("函数内部的 arguments 是语言局部绑定，不应当作运行时 API", () => {
  const result = analyzeSource({
    filePath: "arguments.js",
    source: "function run() { return arguments.length; }",
  });

  assert.equal(findEntity(result, "arguments.length"), undefined);
});

test("undefined 属于语言全局而不是来源未解析的全局", () => {
  const result = analyzeSource({
    filePath: "undefined.js",
    source: "const value = undefined;",
  });

  const finding = findEntity(result, "undefined");
  assert.ok(finding);
  assert.equal(finding.bindingRef.bindingKind, "runtime_global");
});

test("未声明就赋值的全局标出文件内定义来源（wcc 产物写法）", () => {
  const result = analyzeSource({
    filePath: "wcc.js",
    source: [
      "$gwx = function (path) { return path; };",
      "function go() { return $gwx('/a'); }",
    ].join("\n"),
  });

  const finding = findEntity(result, "$gwx");
  assert.ok(finding);
  assert.equal(finding.bindingRef.bindingKind, "unresolved_global");
  assert.equal(
    finding.bindingRef.inFileDefinition,
    "top_level_assignment",
  );
});

test("函数体内的隐式全局赋值标为 function_body_assignment", () => {
  const result = analyzeSource({
    filePath: "wcc-inner.js",
    source: [
      "$gwx = function (path) {",
      "  wh = makeWh();",
      "  function rev(ops) { return wh.nh(ops); }",
      "  return rev;",
      "};",
    ].join("\n"),
  });

  const finding = findEntity(result, "wh.nh");
  assert.ok(finding);
  assert.equal(
    finding.bindingRef.inFileDefinition,
    "function_body_assignment",
  );
});

test("声明过的名字不算文件内隐式全局", () => {
  const result = analyzeSource({
    filePath: "declared.js",
    source: [
      "let counter = 0;",
      "counter = 1;",
      "counter.toString();",
    ].join("\n"),
  });

  const finding = findEntity(result, "counter.toString");
  assert.equal(finding, undefined);
});

test("纯宿主全局没有文件内定义标记", () => {
  const result = analyzeSource({
    filePath: "host-only.js",
    source: "wx.request({ url: 'x' });",
  });

  const finding = findEntity(result, "wx.request");
  assert.ok(finding);
  assert.equal(finding.bindingRef.inFileDefinition, null);
});