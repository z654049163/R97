import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Linter } from "eslint";
import * as espree from "espree";
import globals from "globals";
import { minify } from "terser";
import { webcrack } from "webcrack";

import { findBrowserPath } from "../evidence/browser-probe.mjs";
import {
  REFERENCE_STATE,
  classifyExecutedCases,
  executeDifferentialCases,
  runDifferentialReference,
  runR97ReferenceComparison,
} from "./differential-reference.mjs";
import { EXTERNAL_BASELINE_CASES } from "./external-baseline-cases.mjs";

const MINI_PROGRAM_GLOBALS = Object.freeze({
  App: "readonly",
  Behavior: "readonly",
  Component: "readonly",
  Page: "readonly",
  getApp: "readonly",
  getCurrentPages: "readonly",
  wx: "readonly",
});

const CROSS_RUNTIME_GLOBALS = Object.freeze([
  "Buffer",
  "URL",
  "clearInterval",
  "clearTimeout",
  "console",
  "document",
  "fetch",
  "global",
  "localStorage",
  "navigator",
  "process",
  "require",
  "sessionStorage",
  "setImmediate",
  "setInterval",
  "setTimeout",
  "window",
  "wx",
]);

const AST_IGNORED_KEYS = new Set([
  "comments",
  "end",
  "loc",
  "range",
  "raw",
  "start",
]);

const linter = new Linter({ configType: "flat" });

export const runExternalToolBaseline = async ({
  cases = EXTERNAL_BASELINE_CASES,
  outputDir = null,
  browserPath = findBrowserPath(),
  wechatReportPath = defaultWechatReportPath(),
}) => {
  const reference = await runDifferentialReference({
    cases,
    browserPath,
    wechatReportPath,
    runR97Comparison: true,
  });
  const referenceByCase = Object.fromEntries(
    reference.results.map((result) => [result.caseId, result]),
  );
  const staticBaselines = evaluateEslintBaselines(cases, referenceByCase);
  const transformationTools = {};
  for (const tool of TRANSFORMATION_TOOLS) {
    transformationTools[tool.name] = await evaluateTransformationBaseline({
      tool,
      cases,
      referenceByCase,
      browserPath,
      wechatReportPath,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    caseCount: cases.length,
    environment: {
      node: process.version,
      browserPath,
      edgeVersion: reference.environment.browserVersion?.product ?? null,
      wechatReportPath,
      externalToolVersions: await readToolVersions(),
    },
    reference: {
      byState: reference.byReferenceState,
      r97Metrics: reference.r97Comparison?.metrics ?? null,
      results: reference.results,
    },
    staticBaselines,
    transformationTools,
  };

  if (outputDir) {
    writeExternalBaselineReport(summary, outputDir);
  }
  return summary;
};

export const evaluateEslintBaselines = (
  cases = EXTERNAL_BASELINE_CASES,
  referenceByCase = {},
) => {
  const methods = {
    "B1-ESLint-language-globals": buildEslintConfig({
      environmentGlobals: globals.es2024,
    }),
    "B2-ESLint-target-globals": buildEslintConfig({
      environmentGlobals: {
        ...globals.es2024,
        ...globals.node,
        ...globals.browser,
        ...MINI_PROGRAM_GLOBALS,
      },
    }),
    "B3-ESLint-restricted-host-apis": buildEslintConfig({
      environmentGlobals: {
        ...globals.es2024,
        ...globals.node,
        ...globals.browser,
        ...MINI_PROGRAM_GLOBALS,
      },
      restrictedGlobals: CROSS_RUNTIME_GLOBALS,
    }),
  };

  return Object.fromEntries(
    Object.entries(methods).map(([name, config]) => {
      const results = cases.map((testCase) => {
        const messages = linter.verify(testCase.source, config);
        return {
          caseId: testCase.caseId,
          allowFold: messages.length === 0,
          diagnostics: messages.map((message) => ({
            ruleId: message.ruleId,
            message: message.message,
          })),
        };
      });
      return [
        name,
        {
          ...summarizeDecisionBaseline(name, results, referenceByCase),
          caseResults: results,
        },
      ];
    }),
  );
};

export const transformWithTerser = async (source) => {
  const result = await minify(source, {
    compress: {
      unsafe: true,
      typeofs: true,
    },
    mangle: false,
    format: {
      comments: false,
    },
  });
  const transformed = result.code ?? "";
  return {
    source: transformed,
    changed: semanticAstChanged(source, transformed),
  };
};

export const transformWithWebcrack = async (source) => {
  const result = await webcrack(source);
  return {
    source: result.code,
    changed: semanticAstChanged(source, result.code),
  };
};

export const semanticAstChanged = (before, after) => {
  if (before === after) {
    return false;
  }
  return (
    canonicalAstSignature(before) !==
    canonicalAstSignature(after)
  );
};

const TRANSFORMATION_TOOLS = Object.freeze([
  {
    name: "C1-Terser-unsafe",
    transform: transformWithTerser,
  },
  {
    name: "C2-Webcrack",
    transform: transformWithWebcrack,
  },
]);

const evaluateTransformationBaseline = async ({
  tool,
  cases,
  referenceByCase,
  browserPath,
  wechatReportPath,
}) => {
  const transformedCases = [];
  const transformationResults = [];
  for (const testCase of cases) {
    try {
      const transformed = await tool.transform(testCase.source);
      const executionSource =
        transformed.source.trim() === "" ? "undefined;" : transformed.source;
      transformationResults.push({
        caseId: testCase.caseId,
        status: "ok",
        ...transformed,
      });
      transformedCases.push({
        ...testCase,
        source: executionSource,
      });
    } catch (error) {
      transformationResults.push({
        caseId: testCase.caseId,
        status: "error",
        changed: false,
        source: testCase.source,
        error: error instanceof Error ? error.message : String(error),
      });
      transformedCases.push(testCase);
    }
  }

  const executableCases = transformedCases.filter(
    (testCase) => testCase.executionPolicy !== "do-not-execute",
  );
  const execution = await executeDifferentialCases({
    cases: executableCases,
    browserPath,
  });
  const transformedReferenceResults = classifyExecutedCases(
    executableCases,
    execution,
  );
  const transformedReferenceByCase = Object.fromEntries(
    transformedReferenceResults.map((result) => [result.caseId, result]),
  );
  const r97 = await runR97ReferenceComparison({
    cases: transformedCases,
    referenceResults: transformedReferenceResults,
    browserPath,
    wechatReportPath,
  });
  const caseResults = transformationResults.map((result) => {
    const originalReference = referenceByCase[result.caseId];
    const transformedReference = transformedReferenceByCase[result.caseId];
    const r97Result = r97.byCase?.[result.caseId] ?? null;
    const behavior = compareBehavior(
      originalReference,
      transformedReference,
    );
    const r97Allows = r97Result?.action === "ALLOW_FOLD";
    const acceptedByGate =
      result.changed &&
      behavior.checked &&
      !behavior.mismatch &&
      r97Allows;
    return {
      ...result,
      referenceState: originalReference?.referenceState ?? null,
      transformedReferenceState:
        transformedReference?.referenceState ?? null,
      behavior,
      r97: r97Result,
      acceptedByTool: result.changed,
      acceptedByGate,
      blockedByGate: result.changed && !acceptedByGate,
    };
  });

  return {
    name: tool.name,
    metrics: summarizeTransformationBaseline(caseResults),
    caseResults,
  };
};

const summarizeDecisionBaseline = (name, results, referenceByCase) => {
  const counts = {
    name,
    comparable: 0,
    allowFold: 0,
    blockFold: 0,
    safeAllow: 0,
    unsafeAllow: 0,
    overProtection: 0,
    unverified: 0,
  };
  for (const result of results) {
    const referenceState = referenceByCase[result.caseId]?.referenceState;
    if (
      referenceState === REFERENCE_STATE.UNVERIFIED ||
      referenceState === undefined
    ) {
      counts.unverified += 1;
      continue;
    }
    counts.comparable += 1;
    if (result.allowFold) {
      counts.allowFold += 1;
    } else {
      counts.blockFold += 1;
    }
    if (referenceState === REFERENCE_STATE.ALLOW_FOLD) {
      if (result.allowFold) {
        counts.safeAllow += 1;
      } else {
        counts.overProtection += 1;
      }
    } else if (result.allowFold) {
      counts.unsafeAllow += 1;
    }
  }
  return {
    ...counts,
    unsafeAllowRate: ratio(
      counts.unsafeAllow,
      counts.comparable - counts.safeAllow - counts.overProtection,
    ),
    overProtectionRate: ratio(
      counts.overProtection,
      counts.safeAllow + counts.overProtection,
    ),
  };
};

const summarizeTransformationBaseline = (results) => {
  const counts = {
    total: results.length,
    transformed: results.filter(
      (result) => result.status === "ok" && result.changed,
    ).length,
    unchanged: results.filter(
      (result) => result.status === "ok" && !result.changed,
    ).length,
    transformationErrors: results.filter(
      (result) => result.status === "error",
    ).length,
    behaviorChecked: 0,
    behaviorMismatch: 0,
    unverifiedTransformations: 0,
    acceptedByTool: 0,
    unsafeAcceptedByTool: 0,
    blockedByGate: 0,
    unsafeBlockedByGate: 0,
    unsafeAcceptedByGate: 0,
    safeAcceptedByGate: 0,
    safeBlockedByGate: 0,
    unverifiedAcceptedByTool: 0,
    unverifiedAcceptedByGate: 0,
  };

  for (const result of results) {
    if (result.behavior.checked) {
      counts.behaviorChecked += 1;
    }
    if (result.behavior.mismatch) {
      counts.behaviorMismatch += 1;
    }
    if (
      result.changed &&
      result.referenceState === REFERENCE_STATE.UNVERIFIED
    ) {
      counts.unverifiedTransformations += 1;
    }
    if (result.acceptedByTool) {
      counts.acceptedByTool += 1;
      if (result.behavior.mismatch) {
        counts.unsafeAcceptedByTool += 1;
      } else if (!result.behavior.checked) {
        counts.unverifiedAcceptedByTool += 1;
      }
    }
    if (result.blockedByGate) {
      counts.blockedByGate += 1;
      if (result.behavior.mismatch) {
        counts.unsafeBlockedByGate += 1;
      }
    }
    if (result.acceptedByGate) {
      if (result.behavior.mismatch) {
        counts.unsafeAcceptedByGate += 1;
      } else if (!result.behavior.checked) {
        counts.unverifiedAcceptedByGate += 1;
      } else {
        counts.safeAcceptedByGate += 1;
      }
    }
    if (result.blockedByGate && result.behavior.checked) {
      if (!result.behavior.mismatch) {
        counts.safeBlockedByGate += 1;
      }
    }
  }

  return {
    ...counts,
    unsafeAcceptanceRate: ratio(
      counts.unsafeAcceptedByTool,
      counts.acceptedByTool,
    ),
    gatedUnsafeAcceptanceRate: ratio(
      counts.unsafeAcceptedByGate,
      counts.acceptedByTool,
    ),
  };
};

const compareBehavior = (original, transformed) => {
  if (
    !original ||
    !transformed ||
    original.referenceState === REFERENCE_STATE.UNVERIFIED ||
    transformed.referenceState === REFERENCE_STATE.UNVERIFIED
  ) {
    return {
      checked: false,
      mismatch: false,
      mismatchedRuntimes: [],
      reason: "unverified",
    };
  }
  const mismatchedRuntimes = original.requiredRuntimes.filter(
    (runtimeKey) =>
      observationSignature(original.observations[runtimeKey]) !==
      observationSignature(transformed.observations[runtimeKey]),
  );
  return {
    checked: true,
    mismatch: mismatchedRuntimes.length > 0,
    mismatchedRuntimes,
    reason:
      mismatchedRuntimes.length > 0
        ? "runtime_behavior_changed"
        : "equivalent_in_checked_runtimes",
  };
};

const observationSignature = (observation) =>
  observation?.status === "observed"
    ? JSON.stringify(observation.result)
    : null;

const buildEslintConfig = ({
  environmentGlobals,
  restrictedGlobals = [],
}) => [
  {
    rules: {
      "no-undef": "error",
      ...(restrictedGlobals.length > 0
        ? {
            "no-restricted-globals": [
              "error",
              ...restrictedGlobals,
            ],
          }
        : {}),
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: environmentGlobals,
    },
  },
];

const canonicalAstSignature = (source) => {
  const ast = espree.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  return JSON.stringify(stripAstMetadata(ast));
};

const stripAstMetadata = (value) => {
  if (Array.isArray(value)) {
    return value.map(stripAstMetadata);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !AST_IGNORED_KEYS.has(key))
      .map(([key, item]) => [key, stripAstMetadata(item)]),
  );
};

const readToolVersions = async () => {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  return Object.fromEntries(
    ["eslint", "globals", "terser", "webcrack"].map((name) => {
      const packagePath = path.join(
        projectRoot,
        "node_modules",
        name,
        "package.json",
      );
      const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
      return [name, metadata.version];
    }),
  );
};

const writeExternalBaselineReport = (summary, outputDir) => {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "external-tool-baseline.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "external-tool-baseline.md"),
    renderMarkdown(summary),
    "utf8",
  );
};

const renderMarkdown = (summary) => {
  const staticRows = Object.values(summary.staticBaselines)
    .map(
      (method) =>
        `| ${method.name} | ${method.allowFold} | ${method.unsafeAllow} | ${method.overProtection} | ${percent(method.unsafeAllowRate)} | ${percent(method.overProtectionRate)} |`,
    )
    .join("\n");
  const transformRows = Object.values(summary.transformationTools)
    .map(
      ({ name, metrics }) =>
        `| ${name} | ${metrics.transformed} | ${metrics.behaviorMismatch} | ${metrics.unsafeBlockedByGate} | ${metrics.unsafeAcceptedByGate} | ${metrics.safeAcceptedByGate} | ${metrics.safeBlockedByGate} |`,
    )
    .join("\n");
  const r97Metrics = summary.reference.r97Metrics;

  return `# R97 与外部工具基线对比

生成时间：${summary.generatedAt}

## 对比口径

- 静态工具：比较是否允许折叠。参考状态由独立差分执行给出，
  \`REFERENCE_UNVERIFIED\` 不计入可比较样本。
- 变换工具：先应用真实工具改写，再比较改写前后在三端的归一化行为。
- 门控版本：改写前后行为必须等价，并且 R97 对改写后的代码返回
  \`ALLOW_FOLD\` 时才接受改写。

外部工具版本：

\`\`\`text
${Object.entries(summary.environment.externalToolVersions)
  .map(([name, version]) => `${name} ${version}`)
  .join("\n")}
\`\`\`

## 静态判定基线

| 方法 | 允许折叠 | 不安全放行 | 过度保护 | 不安全放行率 | 过度保护率 |
|---|---:|---:|---:|---:|---:|
${staticRows}

## 变换工具基线

| 方法 | 实际改写 | 行为不一致 | R97 挡住的行为不一致 | 门控后仍行为不一致 | 行为一致且门控接受 | 行为一致但门控阻断 |
|---|---:|---:|---:|---:|---:|---:|
${transformRows}

## R97 独立参考对比

| 指标 | 数量 |
|---|---:|
| 可比较案例 | ${r97Metrics?.comparable ?? 0} |
| 双方都允许折叠 | ${r97Metrics?.referenceAllowAndR97Allow ?? 0} |
| 双方都阻断折叠 | ${r97Metrics?.referenceBlockAndR97Block ?? 0} |
| 参考允许但 R97 阻断 | ${r97Metrics?.referenceAllowButR97Block ?? 0} |
| 参考阻断但 R97 允许 | ${r97Metrics?.referenceBlockButR97Allow ?? 0} |
| 参考无法核验 | ${r97Metrics?.referenceUnverified ?? 0} |

## 使用说明

该表只使用受控、可复核的样例。每个样例被视为需要保留求值结果的表达式片段；
因此 Terser 丢弃顶层纯表达式时，求值结果从原值变为 \`undefined\`，会计为行为
不一致。该口径与 R97 的表达式折叠场景一致，不能解释为 Terser 对普通脚本
整体不安全。Terser 和 Webcrack 不是专门的安全判定器，论文中应重点比较
“实际改写后的行为不一致数”和“加入 R97 门控后仍被接受的行为不一致数”。
`;
};

const percent = (value) => `${(value * 100).toFixed(2)}%`;

const ratio = (numerator, denominator) =>
  denominator === 0 ? 0 : numerator / denominator;

const defaultWechatReportPath = () => {
  const candidate = path.resolve(
    "datasets/wechat-live/wechat-probe-report.json",
  );
  return existsSync(candidate) ? candidate : null;
};

export const parseExternalBaselineArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/external-tool-baseline"),
    browserPath: findBrowserPath(),
    wechatReportPath: defaultWechatReportPath(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out") {
      options.outputDir = path.resolve(value(argument, argv[index + 1]));
      index += 1;
    } else if (argument === "--browser") {
      options.browserPath = path.resolve(value(argument, argv[index + 1]));
      index += 1;
    } else if (argument === "--wechat-report") {
      options.wechatReportPath = path.resolve(
        value(argument, argv[index + 1]),
      );
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const value = (argument, input) => {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`${argument} requires a value`);
  }
  return input;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseExternalBaselineArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: node src/evaluation/external-tool-baseline.mjs [options]

Options:
  --out <dir>              Output directory
  --browser <path>         Chromium-based browser executable
  --wechat-report <path>   Real WeChat probe report
  --help                   Show this message`);
  } else {
    const summary = await runExternalToolBaseline(options);
    console.log(
      JSON.stringify(
        {
          outputDir: options.outputDir,
          staticBaselines: Object.fromEntries(
            Object.entries(summary.staticBaselines).map(
              ([name, metrics]) => [
                name,
                {
                  unsafeAllow: metrics.unsafeAllow,
                  overProtection: metrics.overProtection,
                },
              ],
            ),
          ),
          transformationTools: Object.fromEntries(
            Object.entries(summary.transformationTools).map(
              ([name, result]) => [name, result.metrics],
            ),
          ),
        },
        null,
        2,
      ),
    );
  }
}
