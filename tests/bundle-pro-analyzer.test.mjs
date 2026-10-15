import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSource } from "../src/analyzer.mjs";
import { analyzeAndDecide } from "../src/pipeline.mjs";

const wrap = (modules) =>
  modules
    .map(
      ([modulePath, body]) =>
        `define(${JSON.stringify(modulePath)}, function (require, module, exports) {\n${body}\n});`,
    )
    .join("\n");

test("Lite 模式在跨多层复杂模块引用时保持保守降级 (UNKNOWN)", () => {
  // 构造三层模块中继：a -> b -> c -> wx.request
  const code = wrap([
    ["service/raw.js", "  exports.net = wx.request;"],
    ["service/middle.js", '  var r = require("service/raw.js"); exports.call = r.net;'],
    ["pages/index/index.js", '  var m = require("service/middle.js"); m.call({ url: "/api" });'],
  ]);

  const liteResult = analyzeAndDecide({
    source: code,
    filePath: "app-service.js",
    targetRuntimeIds: ["language_baseline", "wechat_real"],
    analysisMode: "lite",
  });

  // Lite 模式保留单文件轻量处理，如果未深层穿透则安全阻断
  assert.ok(liteResult.summary.total >= 1);
});

test("Pro 模式（重量模式）能够穿透深层跨模块中继导出", () => {
  const code = wrap([
    ["utils/calc.js", "  exports.calc = function(x) { return x * 2; };"],
    ["utils/adapter.js", '  var c = require("utils/calc.js"); exports.doCalc = c.calc;'],
    ["pages/home/home.js", '  var a = require("utils/adapter.js"); a.doCalc(10);'],
  ]);

  const proResult = analyzeAndDecide({
    source: code,
    filePath: "app-service.js",
    targetRuntimeIds: ["language_baseline", "wechat_real"],
    analysisMode: "pro",
  });

  // 纯语言计算穿透后应识别为纯语言逻辑，避免受阻于外部依赖未决
  const finding = proResult.decisions.find(
    (d) => d.runtimeEntity.entityId.includes("doCalc") || d.runtimeEntity.entityId.includes("calc"),
  );
  assert.ok(finding, "Pro 模式下能捕获并关联到跨模块导出点");
  assert.equal(finding.bindingRef.bindingKind, "local");
  assert.ok(finding.bindingRef.bindingOrigin.startsWith("bundle-pro-export:"));
});

test("Pro 模式在面对环形依赖时安全终止且不陷入死循环", () => {
  const code = wrap([
    ["mod/a.js", '  var b = require("mod/b.js"); exports.foo = b.bar;'],
    ["mod/b.js", '  var a = require("mod/a.js"); exports.bar = a.foo;'],
    ["pages/main/main.js", '  var a = require("mod/a.js"); a.foo();'],
  ]);

  const proResult = analyzeAndDecide({
    source: code,
    filePath: "app-service.js",
    targetRuntimeIds: ["language_baseline", "wechat_real"],
    analysisMode: "pro",
  });

  assert.ok(proResult.decisions.length >= 1);
  // 环形依赖无法确定来源，安全归类为 UNKNOWN / BLOCK_FOLD
  const decision = proResult.decisions[0].decision;
  assert.equal(decision.enforcementAction, "BLOCK_FOLD");
});

test("Webpack ES6 导出合成桩 (__webpack_require__.d) AST 脱糖穿透", () => {
  const code = wrap([
    [
      "common/vendor.js",
      `  __webpack_require__.d(exports, "getNetwork", function() { return wx.getNetworkType; });
         __webpack_require__.d(exports, "calcPure", function() { return function(a, b) { return a + b; }; });`,
    ],
    [
      "pages/index/index.js",
      `  var v = require("common/vendor.js");
         v.getNetwork();
         v.calcPure(1, 2);`,
    ],
  ]);

  const proResult = analyzeAndDecide({
    source: code,
    filePath: "app-service.js",
    targetRuntimeIds: ["language_baseline", "wechat_real"],
    analysisMode: "pro",
  });

  const getNetworkFinding = proResult.decisions.find(
    (d) => d.runtimeEntity.entityId.includes("getNetwork") || d.runtimeEntity.entityId.includes("getNetworkType"),
  );
  assert.ok(getNetworkFinding, "应成功穿透 __webpack_require__.d 捕获 wx 宿主调用");
  assert.equal(getNetworkFinding.bindingRef.bindingKind, "runtime_global");
  assert.equal(getNetworkFinding.bindingRef.bindingOrigin, "wx");

  const calcPureFinding = proResult.decisions.find(
    (d) => d.runtimeEntity.entityId.includes("calcPure"),
  );
  assert.ok(calcPureFinding, "应成功穿透 __webpack_require__.d 捕获纯计算导出");
  assert.equal(calcPureFinding.bindingRef.bindingKind, "local");
});

test("Babel 助手函数透明解包与 Object.defineProperty 导出穿透", () => {
  const code = wrap([
    [
      "utils/api.js",
      `  Object.defineProperty(exports, "request", {
           enumerable: true,
           get: function() { return wx.request; }
         });`,
    ],
    [
      "pages/home/home.js",
      `  var _interop = _interopRequireDefault(require("utils/api.js"));
         _interop.request({ url: "https://test.com" });`,
    ],
  ]);

  const proResult = analyzeAndDecide({
    source: code,
    filePath: "app-service.js",
    targetRuntimeIds: ["language_baseline", "wechat_real"],
    analysisMode: "pro",
  });

  const requestFinding = proResult.decisions.find(
    (d) => d.runtimeEntity.entityId.includes("request"),
  );
  assert.ok(requestFinding, "通过 _interopRequireDefault 与 Object.defineProperty 应成功穿透");
  assert.equal(requestFinding.bindingRef.bindingKind, "runtime_global");
  assert.equal(requestFinding.bindingRef.bindingOrigin, "wx");
});

test("Pro 模式深穿透 Babel 助手链（require→require→纯函数声明）", () => {
  // 真实工程包形态：压缩后的 toPropertyKey → toPrimitive → typeof 三层模块链，
  // 其中 typeof 助手用自引用写法 `module.exports=_typeof=...`，
  // 且 typeof 被两个上游模块同时依赖（考验环检测不得误报）。
  const code = wrap([
    [
      "@babel/runtime/helpers/typeof.js",
      `  function _typeof(o){return module.exports=_typeof="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(o){return typeof o}:function(o){return o&&"function"==typeof Symbol&&o.constructor===Symbol&&o!==Symbol.prototype?"symbol":typeof o},_typeof(o)}
       module.exports=_typeof;`,
    ],
    [
      "@babel/runtime/helpers/toPrimitive.js",
      `  var _typeof=require("./typeof");
       function _toPrimitive(r,t){if("object"!==_typeof(r)||null===r)return r;var e=r[Symbol.toPrimitive];if(void 0!==e){var i=e.call(r,t||"default");if("object"!==_typeof(i))return i;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===t?String:Number)(r)}
       module.exports=_toPrimitive;`,
    ],
    [
      "@babel/runtime/helpers/toPropertyKey.js",
      `  var _typeof=require("./typeof"),toPrimitive=require("./toPrimitive");
       function _toPropertyKey(r){var t=toPrimitive(r,"string");return"symbol"===_typeof(t)?t:String(t)}
       module.exports=_toPropertyKey;`,
    ],
    [
      "pages/index/index.js",
      `  var toPropertyKey=require("@babel/runtime/helpers/toPropertyKey");
       var key=toPropertyKey("a");`,
    ],
  ]);

  // 对照组：Lite 单文件模式在深度受限时保持保守，应留下 module_import 断链。
  const liteAnalysis = analyzeSource({
    source: code,
    filePath: "app-service.js",
    analysisMode: "lite",
  });
  const liteBroken = liteAnalysis.findings.filter(
    (f) =>
      f.bindingRef.bindingKind === "module_import" &&
      f.bindingRef.bindingOrigin.includes("toPropertyKey"),
  );
  assert.ok(
    liteBroken.length >= 1,
    "对照组：Lite 在多层助手链上应保持保守断链（证明样本真的复现了问题）",
  );

  // 实验组：Pro 包级依赖图应整链穿透为纯语言。
  const proAnalysis = analyzeSource({
    source: code,
    filePath: "app-service.js",
    analysisMode: "pro",
  });
  const proModuleImports = proAnalysis.findings.filter(
    (f) => f.bindingRef.bindingKind === "module_import",
  );
  assert.equal(
    proModuleImports.length,
    0,
    "Pro 深穿透后不应残留任何 module_import 断链",
  );
  const proHelperHits = proAnalysis.findings.filter((f) =>
    (f.runtimeEntity.entityId + (f.bindingRef.bindingOrigin ?? "")).includes(
      "toPropertyKey",
    ),
  );
  assert.equal(
    proHelperHits.length,
    0,
    "整链证明为纯语言后按设计消除 finding（不再进入判卷分母）",
  );
});

test("健全性防线：引用宿主的导出函数在 Pro 模式下不得被判为纯语言", () => {
  const code = wrap([
    [
      "utils/net.js",
      `  exports.getNetwork = function () { return wx.getNetworkType; };`,
    ],
    [
      "pages/h/h.js",
      `  var net = require("utils/net.js");
       var g = net.getNetwork();`,
    ],
  ]);

  const proResult = analyzeAndDecide({
    source: code,
    filePath: "app-service.js",
    targetRuntimeIds: ["language_baseline", "wechat_real"],
    analysisMode: "pro",
  });

  const finding = proResult.decisions.find(
    (d) =>
      d.runtimeEntity.entityId.includes("getNetwork") ||
      d.runtimeEntity.entityId.includes("getNetworkType"),
  );
  assert.ok(finding, "应能穿透模块属性访问并捕获宿主调用");
  assert.notEqual(
    finding.bindingRef.bindingKind,
    "local",
    "函数体引用宿主的导出不得被判为纯语言（禁止误放行）",
  );
  assert.equal(finding.bindingRef.bindingKind, "runtime_global");
  assert.equal(finding.bindingRef.bindingOrigin, "wx");
});
