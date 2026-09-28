import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeSource } from "../analyzer.mjs";
import { buildSemanticContract } from "../contract-builder.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";

const WECHAT = RUNTIME_IDS.WECHAT;
const NODE = RUNTIME_IDS.NODE;
const EDGE = RUNTIME_IDS.EDGE;

/**
 * 变异基准：围绕同一段小程序调用点派生一组语义变异，检查分析层是否按
 * 文档里的不变量给出正确结论。
 *
 * 期望值来自 `AGENTS.md` 与 `技术路线消融与组件取舍.md` 的不变量，不是从
 * 当前实现反推出来的：
 *
 * - 局部变量、函数参数、被遮蔽的宿主 API 不计入 required runtime；
 * - 稳定别名继承宿主属性，被重新赋值的别名退化为局部；
 * - 动态属性访问与无法解析的作用域降级为 possible；
 * - 每个程序点单独判断，同一实体在不同变换下契约维度可以不同。
 *
 * 断言落在分析层（binding kind / 归一化路径 / required runtime），因为那一层
 * 才是变异真正作用的地方；证据缺失引起的 UNKNOWN 不该掩盖分析对错。
 */
export const MUTATION_FAMILIES = Object.freeze([
  {
    family: "binding-shadowing",
    purpose: "宿主全局被局部声明或参数遮蔽时，不应计入 required runtime",
    cases: [
      {
        caseId: "shadow-local-const",
        kind: "findings",
        source: "const wx = {}; wx.request({});",
        expect: [],
      },
      {
        caseId: "shadow-function-parameter",
        kind: "findings",
        source: "function f(wx) { wx.request({}); }",
        expect: [],
      },
      {
        caseId: "shadow-inner-scope",
        kind: "findings",
        source: "function f() { const wx = {}; wx.request({}); }",
        expect: [],
      },
      {
        caseId: "shadow-var-declaration",
        kind: "findings",
        source: "var wx; wx.request({});",
        expect: [],
      },
    ],
  },
  {
    family: "alias-resolution",
    purpose: "稳定别名继承宿主属性，被重新赋值后退化为局部",
    cases: [
      {
        caseId: "alias-const",
        kind: "excludes",
        source: "const w = wx; w.request({});",
        expectPresent: ["wx.request"],
        expectAbsent: [],
      },
      {
        caseId: "alias-const-chain",
        kind: "excludes",
        source: "const w = wx; const v = w; v.request({});",
        expectPresent: ["wx.request"],
        expectAbsent: [],
      },
      {
        caseId: "alias-let-stable",
        kind: "excludes",
        source: "let w = wx; w.request({});",
        expectPresent: ["wx.request"],
        expectAbsent: [],
      },
      {
        caseId: "alias-let-mutated",
        kind: "excludes",
        source: "let w = wx; w = {}; w.request({});",
        expectPresent: ["wx"],
        expectAbsent: ["wx.request"],
      },
      {
        caseId: "alias-assigned-after-declaration",
        kind: "excludes",
        source: "let w; w = wx; w.request({});",
        expectPresent: ["wx"],
        expectAbsent: ["wx.request"],
      },
      {
        // 已知限制，不计入通过/失败：`isUsedBeforeDeclaration` 只在静态字面量
        // 解析里生效，别名解析没有这个守卫，于是「先用后声明的别名」仍会按
        // 别名展开。方向上是保守的（把宿主依赖判成 definite → UNKNOWN /
        // PROTECT），不会放行不安全折叠，因此先记录不改。
        caseId: "alias-used-before-declaration",
        kind: "known-limitation",
        source: "w.request({}); const w = wx;",
        note: "别名解析缺少 TDZ 守卫，仍按 wx.request 展开；结果是更保守而不是更宽松。",
      },
    ],
  },
  {
    family: "dynamic-property",
    purpose: "有限常量传播可解析的属性保持 definite，动态属性降级为 possible",
    cases: [
      {
        caseId: "dynamic-const-key",
        kind: "findings",
        source: 'const k = "request"; wx[k]({});',
        expect: [
          {
            entityId: "wx.request",
            bindingKind: "runtime_global",
            requiredRuntimeIds: [WECHAT],
          },
        ],
      },
      {
        caseId: "dynamic-computed-key",
        kind: "excludes",
        source: "const k = getKey(); wx[k]({});",
        expectPresent: ["wx"],
        expectAbsent: ["wx.request"],
        expectKinds: { wx: "dynamic" },
        expectRequiredStatus: { wx: "possible" },
      },
      {
        caseId: "dynamic-inline-call-key",
        kind: "excludes",
        source: "wx[getKey()]();",
        expectPresent: ["wx"],
        expectAbsent: ["wx.request"],
        expectKinds: { wx: "dynamic" },
        expectRequiredStatus: { wx: "possible" },
      },
    ],
  },
  {
    family: "runtime-attribution",
    purpose: "宿主专属根节点必须映射到对应运行时，语言内建不强制任何宿主",
    cases: [
      {
        caseId: "runtime-node",
        kind: "findings",
        source: "process.version;",
        expect: [
          {
            entityId: "process.version",
            bindingKind: "runtime_global",
            requiredRuntimeIds: [NODE],
          },
        ],
      },
      {
        caseId: "runtime-node-buffer",
        kind: "findings",
        source: 'Buffer.from("abc");',
        expect: [
          {
            entityId: "Buffer.from",
            bindingKind: "runtime_global",
            requiredRuntimeIds: [NODE],
          },
        ],
      },
      {
        caseId: "runtime-browser",
        kind: "findings",
        source: "window.document;",
        expect: [
          {
            entityId: "window.document",
            bindingKind: "runtime_global",
            requiredRuntimeIds: [EDGE],
          },
        ],
      },
      {
        caseId: "runtime-language-builtin",
        kind: "findings",
        source: "Math.max(1, 2);",
        expect: [
          {
            entityId: "Math.max",
            bindingKind: "runtime_global",
            requiredRuntimeIds: [],
          },
        ],
      },
      {
        caseId: "runtime-pure-computation",
        kind: "findings",
        source: "1 + 2;",
        expect: [],
      },
    ],
  },
  {
    family: "transformation-aware",
    purpose: "同一实体在不同变换下的契约维度不同，调用点必须要求可调用性",
    cases: [
      {
        caseId: "transformation-call-requires-callability",
        kind: "dimensions",
        source: 'wx.setStorageSync("a", 1);',
        entityId: "wx.setStorageSync",
        expectPresent: ["callability"],
      },
      {
        caseId: "transformation-branch-needs-no-callability",
        kind: "dimensions",
        source: "if (wx.setStorageSync) {}",
        entityId: "wx.setStorageSync",
        expectAbsent: ["callability"],
      },
      {
        caseId: "transformation-typeof-needs-no-callability",
        kind: "dimensions",
        source: "typeof wx.setStorageSync;",
        entityId: "wx.setStorageSync",
        expectAbsent: ["callability"],
      },
    ],
  },
]);

export const describeFindings = ({ source, filePath = "app-service.js" }) => {
  const analysis = analyzeSource({ source, filePath });
  return analysis.findings.map((finding) => {
    const contract = buildSemanticContract({
      finding,
      contractVersion: "v1",
    });
    return {
      entityId: finding.runtimeEntity.entityId,
      normalizedPath: finding.runtimeEntity.normalizedPath,
      bindingKind: finding.bindingRef.bindingKind,
      transformationKind: finding.transformationKind,
      requiredRuntimeIds: [
        ...contract.validityScope.requiredRuntimeIds,
      ].sort(),
      requiredRuntimeStatus: contract.validityScope.requiredRuntimeStatus,
      requiredDimensions: [...contract.requiredDimensions].sort(),
    };
  });
};

const findingKey = (finding) =>
  `${finding.entityId}|${finding.bindingKind}|${finding.requiredRuntimeIds.join(",")}`;

const expectedKey = (expectation) =>
  `${expectation.entityId}|${expectation.bindingKind}|${[...expectation.requiredRuntimeIds].sort().join(",")}`;

export const runMutationBenchmark = ({
  outputDir = null,
  generatedAt = new Date().toISOString(),
} = {}) => {
  const results = [];

  for (const family of MUTATION_FAMILIES) {
    for (const testCase of family.cases) {
      const findings = describeFindings({ source: testCase.source });
      const failure = evaluateCase({ testCase, findings });
      results.push({
        family: family.family,
        caseId: testCase.caseId,
        source: testCase.source,
        knownLimitation: testCase.kind === "known-limitation",
        note: testCase.note ?? null,
        passed: failure === null,
        failure,
        observed: findings.map((finding) => ({
          entityId: finding.entityId,
          bindingKind: finding.bindingKind,
          requiredRuntimeIds: finding.requiredRuntimeIds,
          requiredRuntimeStatus: finding.requiredRuntimeStatus,
          requiredDimensions: finding.requiredDimensions,
        })),
      });
    }
  }

  const byFamily = {};
  for (const result of results) {
    if (result.knownLimitation) {
      continue;
    }
    const entry = byFamily[result.family] ?? { total: 0, passed: 0, failed: 0 };
    entry.total += 1;
    if (result.passed) {
      entry.passed += 1;
    } else {
      entry.failed += 1;
    }
    byFamily[result.family] = entry;
  }

  const asserted = results.filter((result) => !result.knownLimitation);
  const summary = {
    generatedAt,
    caseCount: results.length,
    assertedCount: asserted.length,
    passedCount: asserted.filter((result) => result.passed).length,
    failedCount: asserted.filter((result) => !result.passed).length,
    knownLimitationCount: results.length - asserted.length,
    byFamily,
    results,
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "mutation-benchmark.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDir, "mutation-benchmark.md"),
      renderMarkdown(summary),
      "utf8",
    );
  }
  return summary;
};

const evaluateCase = ({ testCase, findings }) => {
  if (testCase.kind === "known-limitation") {
    return null;
  }
  if (testCase.kind === "findings") {
    const actual = findings.map(findingKey).sort();
    const expected = testCase.expect.map(expectedKey).sort();
    if (actual.length === expected.length &&
      actual.every((value, index) => value === expected[index])) {
      return null;
    }
    return `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`;
  }

  if (testCase.kind === "dimensions") {
    const target = findings.find(
      (finding) => finding.entityId === testCase.entityId,
    );
    if (!target) {
      return `期望存在实体 ${testCase.entityId}，实际没有 finding`;
    }
    for (const dimension of testCase.expectPresent ?? []) {
      if (!target.requiredDimensions.includes(dimension)) {
        return `期望 ${testCase.entityId} 的契约包含 ${dimension}，实际 ${JSON.stringify(target.requiredDimensions)}`;
      }
    }
    for (const dimension of testCase.expectAbsent ?? []) {
      if (target.requiredDimensions.includes(dimension)) {
        return `期望 ${testCase.entityId} 的契约不包含 ${dimension}，实际 ${JSON.stringify(target.requiredDimensions)}`;
      }
    }
    return null;
  }

  const entityIds = new Set(findings.map((finding) => finding.entityId));
  for (const entityId of testCase.expectPresent ?? []) {
    if (!entityIds.has(entityId)) {
      return `期望出现 ${entityId}，实际 ${JSON.stringify([...entityIds])}`;
    }
  }
  for (const entityId of testCase.expectAbsent ?? []) {
    if (entityIds.has(entityId)) {
      return `期望不出现 ${entityId}`;
    }
  }
  for (const [entityId, bindingKind] of Object.entries(
    testCase.expectKinds ?? {},
  )) {
    const target = findings.find((finding) => finding.entityId === entityId);
    if (!target || target.bindingKind !== bindingKind) {
      return `期望 ${entityId} 的 bindingKind 为 ${bindingKind}，实际 ${target?.bindingKind ?? "无 finding"}`;
    }
  }
  for (const [entityId, status] of Object.entries(
    testCase.expectRequiredStatus ?? {},
  )) {
    const target = findings.find((finding) => finding.entityId === entityId);
    if (!target || target.requiredRuntimeStatus !== status) {
      return `期望 ${entityId} 的 requiredRuntimeStatus 为 ${status}，实际 ${target?.requiredRuntimeStatus ?? "无 finding"}`;
    }
  }
  return null;
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 变异基准",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `用例：${summary.caseCount}（断言 ${summary.assertedCount}，已知限制 ${summary.knownLimitationCount}），通过 ${summary.passedCount}，失败 ${summary.failedCount}`,
    "",
    "期望值来自项目不变量，不是从当前实现反推的。断言落在分析层：",
    "binding kind、归一化路径、required runtime 与契约维度。",
    "",
    "## 分族结果",
    "",
    "| 变异族 | 用例 | 通过 | 失败 |",
    "|---|---:|---:|---:|",
  ];
  for (const [family, entry] of Object.entries(summary.byFamily)) {
    lines.push(`| ${family} | ${entry.total} | ${entry.passed} | ${entry.failed} |`);
  }
  lines.push("", "## 失败用例", "");
  const failures = summary.results.filter(
    (result) => !result.passed && !result.knownLimitation,
  );
  if (failures.length === 0) {
    lines.push("无。", "");
  } else {
    for (const failure of failures) {
      lines.push(
        `### ${failure.caseId}（${failure.family}）`,
        "",
        "```javascript",
        failure.source,
        "```",
        "",
        `- ${failure.failure}`,
        "",
      );
    }
  }
  const limitations = summary.results.filter(
    (result) => result.knownLimitation,
  );
  if (limitations.length > 0) {
    lines.push("## 已知限制（不计入通过/失败）", "");
    for (const limitation of limitations) {
      lines.push(
        `### ${limitation.caseId}`,
        "",
        "```javascript",
        limitation.source,
        "```",
        "",
        limitation.note ?? "",
        "",
        `实际观测：${JSON.stringify(limitation.observed)}`,
        "",
      );
    }
  }
  lines.push("## 全部用例", "");
  lines.push("| 变异族 | 用例 | 结果 | 源码 |", "|---|---|---|---|");
  for (const result of summary.results) {
    lines.push(
      `| ${result.family} | ${result.caseId} | ${result.passed ? "通过" : "失败"} | \`${result.source.replaceAll("|", "\\|")}\` |`,
    );
  }
  return `${lines.join("\n")}\n`;
};

export const parseMutationArgs = (argv) => {
  const options = { outputDir: path.resolve("datasets/mutation-benchmark") };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--out") {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseMutationArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/mutation-benchmark.mjs [--out <path>]",
    );
  } else {
    const summary = runMutationBenchmark(options);
    console.log(
      JSON.stringify(
        {
          caseCount: summary.caseCount,
          assertedCount: summary.assertedCount,
          passedCount: summary.passedCount,
          failedCount: summary.failedCount,
          knownLimitationCount: summary.knownLimitationCount,
          byFamily: summary.byFamily,
          failures: summary.results
            .filter((result) => !result.passed)
            .map((result) => ({
              caseId: result.caseId,
              failure: result.failure,
            })),
        },
        null,
        2,
      ),
    );
    process.exitCode = summary.failedCount === 0 ? 0 : 1;
  }
}
