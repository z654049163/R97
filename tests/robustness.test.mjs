import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSource } from "../src/analyzer.mjs";
import { analyzeAndDecide } from "../src/pipeline.mjs";

/**
 * 鲁棒性回归。
 *
 * R97 是离线静态分析器，输入是被语料过滤过的 JavaScript。这里固化的是
 * **边界行为契约**，而不是"永不失败"：
 *
 *   1. 合法但古怪的输入（BOM、超长标识符、with、eval、__proto__）必须能被处理；
 *   2. 语法错误的输入必须抛 SyntaxError——可预期的失败，而不是静默产出错误判定；
 *   3. 极端大小的输入必须有界时间内完成，不能挂起。
 *
 * 这三条对应论文里可以声明的一句话：分析器对畸形输入不崩溃、不挂起，
 * 且解析失败会向上传播而不是被吞掉。
 */

const TOLERATED = [
  ["空文件", ""],
  ["只有空白", "   \n\t  "],
  ["只有注释", "// just a comment"],
  ["BOM 开头", "\uFEFFconst a = 1;"],
  ["超长标识符", `const ${"a".repeat(10000)} = 1;`],
  ["深层嵌套对象字面量", `${"{".repeat(300)}${"}".repeat(300)}`],
  ["非 ASCII 标识符", "const \u4e2d\u6587 = wx.request;"],
  ["with 语句", "with (wx) { request({}); }"],
  ["eval 调用", "eval('1+1');"],
  ["__proto__ 赋值", "const o = {}; o.__proto__ = wx;"],
];

for (const [name, source] of TOLERATED) {
  test(`鲁棒性：${name} 不抛异常`, () => {
    assert.doesNotThrow(() =>
      analyzeAndDecide({
        source,
        filePath: "robustness.js",
        targetRuntimeIds: [],
        targetRuntimeSource: "unknown",
      }),
    );
  });
}

const SYNTAX_ERRORS = [
  ["未闭合注释", "/* unterminated"],
  ["未闭合函数", "function f() {"],
  ["赋值右侧缺失", "const x = ;"],
  ["重复声明", "const a = 1; const a = 2;"],
  ["非法数字标识符", "var 1x = 2;"],
  ["顶层 return", "return 1;"],
];

for (const [name, source] of SYNTAX_ERRORS) {
  test(`鲁棒性：${name} 抛出 SyntaxError 而不是静默产出判定`, () => {
    assert.throws(
      () => analyzeSource({ source, filePath: "robustness.js" }),
      SyntaxError,
    );
  });
}

test("鲁棒性：超大数组字面量在有界时间内完成", () => {
  const source = `const a = [${"1,".repeat(50000)}];`;
  const started = Date.now();
  assert.doesNotThrow(() =>
    analyzeSource({ source, filePath: "robustness.js" }),
  );
  assert.ok(
    Date.now() - started < 15000,
    `应在 15 秒内完成，实际 ${Date.now() - started}ms`,
  );
});

test("鲁棒性：解析失败不会被决策链吞掉", () => {
  // 这条与上面的 SyntaxError 断言互补：确认失败会向上传播到调用方，
  // 而不是被 pipeline 内部转换成"没有 finding"这种静默成功。
  assert.throws(() =>
    analyzeAndDecide({
      source: "function broken( {",
      filePath: "robustness.js",
      targetRuntimeIds: [],
    }),
  );
});
