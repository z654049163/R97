import test from "node:test";
import assert from "node:assert/strict";

import { findBrowserPath } from "../src/evidence/browser-probe.mjs";
import { isBrowserUsable } from "../src/evidence/cdp-client.mjs";
import {
  REFERENCE_STATE,
} from "../src/evaluation/differential-reference.mjs";
import {
  evaluateEslintBaselines,
  runExternalToolBaseline,
  semanticAstChanged,
  transformWithTerser,
  transformWithWebcrack,
} from "../src/evaluation/external-tool-baseline.mjs";

const referenceByCase = {
  safe: { referenceState: REFERENCE_STATE.ALLOW_FOLD },
  node: { referenceState: REFERENCE_STATE.BLOCK_FOLD },
  browser: { referenceState: REFERENCE_STATE.BLOCK_FOLD },
  unverified: { referenceState: REFERENCE_STATE.UNVERIFIED },
};

test("ESLint 语言基线会误放行宿主差异并阻断 Node 全局", () => {
  const cases = [
    {
      caseId: "browser",
      source: "typeof setTimeout;",
    },
    {
      caseId: "node",
      source: "process.version;",
    },
  ];
  const results = evaluateEslintBaselines(cases, referenceByCase);
  const language = results["B1-ESLint-language-globals"];

  assert.equal(language.unsafeAllow, 1);
  assert.equal(language.allowFold, 1);
  assert.equal(language.overProtection, 0);
});

test("ESLint 目标全局基线会放行跨运行时 API", () => {
  const cases = [
    {
      caseId: "node",
      source: "process.version;",
    },
    {
      caseId: "browser",
      source: "window.document;",
    },
  ];
  const results = evaluateEslintBaselines(cases, referenceByCase);
  const target = results["B2-ESLint-target-globals"];

  assert.equal(target.allowFold, 2);
  assert.equal(target.unsafeAllow, 2);
});

test("限制宿主 API 的 ESLint 基线会阻断跨运行时全局", () => {
  const cases = [
    {
      caseId: "node",
      source: "process.version;",
    },
    {
      caseId: "browser",
      source: "window.document;",
    },
  ];
  const results = evaluateEslintBaselines(cases, referenceByCase);
  const restricted = results["B3-ESLint-restricted-host-apis"];

  assert.equal(restricted.allowFold, 0);
  assert.equal(restricted.unsafeAllow, 0);
});

test("语义 AST 比较忽略格式但不忽略表达式变化", () => {
  assert.equal(semanticAstChanged("a + 1;", "a+1;"), false);
  assert.equal(semanticAstChanged("1 + 1;", "2;"), true);
});

test("Terser 与 Webcrack 能实际改写受控案例", async () => {
  const terser = await transformWithTerser("Math.max(1, 2, 3);");
  assert.equal(terser.changed, true);

  const webcrack = await transformWithWebcrack(
    "var arr = [\"Math\", \"max\"]; globalThis[arr[0]][arr[1]](1, 2, 3);",
  );
  assert.equal(webcrack.changed, true);
  assert.match(webcrack.source, /globalThis\.Math\.max/);
});

test(
  "R97 门控接受安全解混淆并阻断跨运行时解混淆",
  // 用「能不能真的启动」而不是「文件在不在」做 skip 条件：本机上 Edge 可执行
  // 文件存在、版本号可读，但命令行启动会静默退出，只按路径判断会把环境不可用
  // 误报成代码回归。
  {
    skip: !(await isBrowserUsable({ browserPath: findBrowserPath() })),
  },
  async () => {
    const cases = [
      {
        caseId: "gate-safe-webcrack",
        category: "webcrack",
        source:
          "var arr = [\"Math\", \"max\"]; globalThis[arr[0]][arr[1]](1, 2, 3);",
      },
      {
        caseId: "gate-browser-webcrack",
        category: "webcrack",
        source:
          "var arr = [\"window\", \"document\"]; globalThis[arr[0]][arr[1]];",
      },
    ];
    const summary = await runExternalToolBaseline({
      cases,
      browserPath: findBrowserPath(),
      wechatReportPath: null,
    });
    const webcrack =
      summary.transformationTools["C2-Webcrack"].caseResults;
    const safe = webcrack.find(
      (result) => result.caseId === "gate-safe-webcrack",
    );
    const browser = webcrack.find(
      (result) => result.caseId === "gate-browser-webcrack",
    );

    assert.equal(safe.acceptedByGate, true);
    assert.equal(browser.acceptedByGate, false);
    assert.equal(browser.blockedByGate, true);
    assert.equal(
      summary.transformationTools["C2-Webcrack"].metrics
        .unsafeAcceptedByGate,
      0,
    );
  },
);
