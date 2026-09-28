import assert from "node:assert/strict";
import test from "node:test";

import { parse as parseJavaScript } from "espree";

import {
  buildBundleModuleTable,
  extractModuleExports,
  findOwningModule,
  isRequireCall,
  normalizeModulePath,
  resolveBundleRequest,
} from "../src/bundle-modules.mjs";

const BUNDLE = [
  'define("common/vendor.js", function (require, module, exports) {',
  '  var util = require("./util.js");',
  "  exports.helper = function () {};",
  '  module.exports.version = "1.0";',
  "});",
  'define("pages/index/index.js", function (require, module, exports) {',
  '  var vendor = require("../../common/vendor.js");',
  "  exports.main = function () { return vendor.helper(); };",
  "});",
].join("\n");

const parseBundle = (source = BUNDLE) =>
  parseJavaScript(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    range: true,
    loc: true,
  });

test("模块路径归一化去掉 .js 后缀", () => {
  assert.equal(normalizeModulePath("common/vendor.js"), "common/vendor");
  assert.equal(normalizeModulePath("wx-server-sdk"), "wx-server-sdk");
});

test("相对请求按请求方模块目录解析", () => {
  assert.equal(
    resolveBundleRequest("../../common/vendor.js", "pages/index/index.js"),
    "common/vendor",
  );
  assert.equal(
    resolveBundleRequest("./util.js", "common/vendor.js"),
    "common/util",
  );
  assert.equal(
    resolveBundleRequest("common/vendor.js", "pages/index/index.js"),
    "common/vendor",
  );
  assert.equal(
    resolveBundleRequest("wx-server-sdk", "cloud/index.js"),
    "wx-server-sdk",
  );
});

test("从 AST 建立模块表并识别重复定义", () => {
  const ast = parseBundle(
    [
      'define("a.js", function () {});',
      'define("a.js", function () {});',
      'define("b.js", function () {});',
    ].join("\n"),
  );
  const { modules, duplicateCount } = buildBundleModuleTable(ast);
  assert.deepEqual([...modules.keys()].sort(), ["a", "b"]);
  assert.equal(duplicateCount, 1);
});

test("提取 exports 命名导出与 module.exports 命名导出", () => {
  const { modules } = buildBundleModuleTable(parseBundle());
  const vendor = modules.get("common/vendor");
  const exported = extractModuleExports(vendor.factoryNode);
  assert.deepEqual([...exported.named.keys()].sort(), ["helper", "version"]);
  assert.equal(exported.dynamic, false);
  assert.equal(exported.defaultExport, null);
});

test("动态导出写入会置位 dynamic", () => {
  const ast = parseBundle(
    'define("a.js", function (require, module, exports) { exports[key] = 1; });',
  );
  const { modules } = buildBundleModuleTable(ast);
  const exported = extractModuleExports(modules.get("a").factoryNode);
  assert.equal(exported.dynamic, true);
});

test("module.exports = 表达式识别为默认导出", () => {
  const ast = parseBundle(
    'define("a.js", function (require, module, exports) { module.exports = function () {}; });',
  );
  const { modules } = buildBundleModuleTable(ast);
  const exported = extractModuleExports(modules.get("a").factoryNode);
  assert.equal(exported.defaultExport?.type, "FunctionExpression");
  assert.equal(exported.named.size, 0);
});

test("findOwningModule 返回包含该节点的模块路径", () => {
  const ast = parseBundle();
  const { modules } = buildBundleModuleTable(ast);
  let assignment = null;
  const visit = (node) => {
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      node.left.property?.name === "main"
    ) {
      assignment = node;
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach((child) => child?.type && visit(child));
      else if (value?.type) visit(value);
    }
  };
  visit(ast);
  assert.ok(assignment, "应能找到 exports.main 赋值");
  assert.equal(findOwningModule(assignment, { modules }), "pages/index/index");
});

test("isRequireCall 只接受单字符串字面量参数", () => {
  const ast = parseBundle();
  const calls = [];
  const visit = (node) => {
    if (node.type === "CallExpression") calls.push(node);
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach((child) => child?.type && visit(child));
      else if (value?.type) visit(value);
    }
  };
  visit(ast);
  const requireCalls = calls.filter(isRequireCall);
  assert.equal(requireCalls.length, 2);
});
