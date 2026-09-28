import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_STATE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { buildEvidenceRecords } from "../evidence/evidence-builder.mjs";
import { createLanguageBaselineContext } from "../evidence/language-baseline.mjs";
import {
  collectBrowserObservations,
  findBrowserPath,
} from "../evidence/browser-probe.mjs";
import { withCdpPage } from "../evidence/cdp-client.mjs";
import { collectLanguageObservations } from "../evidence/language-probe.mjs";
import { collectNodeObservations } from "../evidence/node-probe.mjs";
import { importWechatProbeResult } from "../evidence/wechat-probe.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import {
  DEFAULT_DIFFERENTIAL_RUNTIMES,
  DIFFERENTIAL_CASES,
} from "./differential-cases.mjs";

export const REFERENCE_STATE = Object.freeze({
  ALLOW_FOLD: "REFERENCE_ALLOW_FOLD",
  BLOCK_FOLD: "REFERENCE_BLOCK_FOLD",
  UNVERIFIED: "REFERENCE_UNVERIFIED",
});

const RUNTIME_KEYS = Object.freeze({
  language: RUNTIME_IDS.LANGUAGE,
  node: RUNTIME_IDS.NODE,
  edge: RUNTIME_IDS.EDGE,
  wechat: RUNTIME_IDS.WECHAT,
});

const DEFAULT_WECHAT_REPORT = path.resolve(
  "datasets/wechat-live/wechat-probe-report.json",
);

export const runDifferentialReference = async ({
  cases = DIFFERENTIAL_CASES,
  outputDir = null,
  browserPath = findBrowserPath(),
  wechatReportPath = existsSync(DEFAULT_WECHAT_REPORT)
    ? DEFAULT_WECHAT_REPORT
    : null,
  runR97Comparison = true,
}) => {
  const execution = await executeDifferentialCases({
    cases,
    browserPath,
  });
  const referenceResults = classifyExecutedCases(cases, execution);

  let r97Comparison = null;
  if (runR97Comparison) {
    r97Comparison = await runR97ReferenceComparison({
      cases,
      referenceResults,
      browserPath,
      wechatReportPath,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    referenceVersion: "differential-reference-v1",
    environment: {
      node: process.version,
      browserPath,
      browserVersion: execution.browserVersion,
      wechatReportPath,
    },
    caseCount: cases.length,
    runtimeAvailability: execution.availability,
    byReferenceState: countBy(
      referenceResults,
      (result) => result.referenceState,
    ),
    results: referenceResults.map((result) => ({
      ...result,
      r97: r97Comparison?.byCase?.[result.caseId] ?? null,
    })),
    r97Comparison: r97Comparison
      ? {
          availability: r97Comparison.availability,
          metrics: r97Comparison.metrics,
          error: r97Comparison.error ?? null,
        }
      : null,
  };

  if (outputDir) {
    writeDifferentialReport(summary, outputDir);
  }
  return summary;
};

export const classifyExecutedCases = (cases, execution) =>
  cases.map((testCase) => {
    const observations = Object.fromEntries(
      requiredRuntimes(testCase).map((runtimeKey) => [
        runtimeKey,
        execution.observationsByRuntime?.[runtimeKey]?.[testCase.caseId] ??
          skippedObservation(testCase),
      ]),
    );
    return classifyReferenceCase(testCase, observations);
  });

export const executeDifferentialCases = async ({
  cases = DIFFERENTIAL_CASES,
  browserPath = findBrowserPath(),
}) => {
  const observationsByRuntime = {
    language: {},
    node: {},
    edge: {},
    wechat: {},
  };
  const availability = {
    language: true,
    node: true,
    edge: browserPath !== null,
    wechat: false,
  };

  for (const testCase of cases) {
    for (const runtimeKey of requiredRuntimes(testCase)) {
      if (testCase.executionPolicy === "do-not-execute") {
        observationsByRuntime[runtimeKey][testCase.caseId] =
          skippedObservation(testCase);
        continue;
      }
      if (runtimeKey === "wechat") {
        observationsByRuntime.wechat[testCase.caseId] = {
          status: "missing",
          reason: "No executable real WeChat runtime is attached.",
        };
        continue;
      }
      try {
        if (runtimeKey === "language") {
          observationsByRuntime.language[testCase.caseId] =
            await evaluateSourceInLanguageBaseline(testCase.source);
        } else if (runtimeKey === "node") {
          observationsByRuntime.node[testCase.caseId] =
            await evaluateSourceInNode(testCase.source);
        }
      } catch (error) {
        observationsByRuntime[runtimeKey][testCase.caseId] = {
          status: "evaluator_error",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  const edgeCases = cases.filter(
    (testCase) =>
      requiredRuntimes(testCase).includes("edge") &&
      testCase.executionPolicy !== "do-not-execute",
  );
  let browserVersion = null;
  if (edgeCases.length > 0) {
    if (!browserPath) {
      for (const testCase of edgeCases) {
        observationsByRuntime.edge[testCase.caseId] = {
          status: "missing",
          reason:
            "No Chromium-based browser was found. Set R97_BROWSER_PATH to enable Edge differential execution.",
        };
      }
    } else {
      try {
        const edgeResults = await executeCasesInEdge({
          cases: edgeCases,
          browserPath,
        });
        browserVersion = edgeResults.browserVersion;
        Object.assign(observationsByRuntime.edge, edgeResults.results);
      } catch (error) {
        availability.edge = false;
        for (const testCase of edgeCases) {
          observationsByRuntime.edge[testCase.caseId] = {
            status: "evaluator_error",
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }
  }

  return {
    availability,
    browserVersion,
    observationsByRuntime,
  };
};

export const classifyReferenceCase = (
  testCase,
  observations = {},
) => {
  const required = requiredRuntimes(testCase);
  const missing = required.filter((runtimeKey) => {
    const observation = observations[runtimeKey];
    return (
      !observation ||
      observation.status === "missing" ||
      observation.status === "evaluator_error" ||
      observation.status === "skipped"
    );
  });

  if (testCase.executionPolicy === "do-not-execute") {
    return {
      caseId: testCase.caseId,
      category: testCase.category,
      source: testCase.source,
      requiredRuntimes: required,
      referenceState: REFERENCE_STATE.UNVERIFIED,
      reason:
        testCase.unverifiedReason ??
        "The case is not safe to execute without a dedicated sandbox.",
      observations,
      signature: null,
    };
  }

  if (missing.length > 0) {
    return {
      caseId: testCase.caseId,
      category: testCase.category,
      source: testCase.source,
      requiredRuntimes: required,
      referenceState: REFERENCE_STATE.UNVERIFIED,
      reason: `Missing runtime observations: ${missing.join(", ")}`,
      observations,
      signature: null,
    };
  }

  const signatures = required.map((runtimeKey) => ({
    runtimeKey,
    signature: stableObservationSignature(observations[runtimeKey]),
  }));
  const referenceSignature = signatures[0].signature;
  const conflicts = signatures.filter(
    (item) => item.signature !== referenceSignature,
  );
  if (conflicts.length === 0) {
    return {
      caseId: testCase.caseId,
      category: testCase.category,
      source: testCase.source,
      requiredRuntimes: required,
      referenceState: REFERENCE_STATE.ALLOW_FOLD,
      reason: "All required runtime observations are equivalent.",
      observations,
      signature: referenceSignature,
    };
  }

  return {
    caseId: testCase.caseId,
    category: testCase.category,
    source: testCase.source,
    requiredRuntimes: required,
    referenceState: REFERENCE_STATE.BLOCK_FOLD,
    reason: `Runtime observations differ: ${signatures
      .filter((item) => item.signature !== referenceSignature)
      .map((item) => item.runtimeKey)
      .join(", ")}`,
    observations,
    signature: referenceSignature,
  };
};

export const evaluateSourceInLanguageBaseline = async (source) => {
  // 语言基线只此一处定义：Node 会往 vm 上下文注入 console，必须清掉，
  // 否则这里会与判卷探针的语言列口径不一致（见 language-baseline.mjs）。
  const context = createLanguageBaselineContext();
  const pending = vm.runInContext(
    buildEvaluationExpression(source),
    context,
    { timeout: 1000 },
  );
  return await pending;
};

export const evaluateSourceInNode = async (source) => {
  const pending = vm.runInThisContext(
    buildEvaluationExpression(source),
    { timeout: 1000 },
  );
  return await pending;
};

export const buildEvaluationExpression = (source) => {
  if (typeof source !== "string" || source.trim() === "") {
    throw new TypeError("Differential source must be a non-empty string");
  }
  const sourceLiteral = JSON.stringify(source);
  return `(async () => {
  const source = ${sourceLiteral};
  const normalizeValueForDifferential = ${normalizeValueForDifferential.toString()};
  try {
    const value = await (0, eval)(source);
    return {
      status: "observed",
      outcome: "value",
      result: normalizeValueForDifferential(value)
    };
  } catch (error) {
    const errorName = error && typeof error.name === "string"
      ? error.name
      : "Error";
    const errorMessage = error && error.message !== undefined
      ? String(error.message)
      : String(error);
    return {
      status: "observed",
      outcome: "exception",
      errorName,
      errorMessage,
      result: { kind: "exception", name: errorName }
    };
  }
})()`;
};

const executeCasesInEdge = async ({ cases, browserPath }) => {
  const profileDir = path.join(
    process.cwd(),
    ".runtime",
    "edge-differential",
  );
  mkdirSync(profileDir, { recursive: true });

  const results = {};
  const { browserVersion } = await withCdpPage(
    { browserPath, profileDir },
    async ({ evaluate, browserVersion: version }) => {
      for (const testCase of cases) {
        try {
          results[testCase.caseId] = await evaluate(
            buildEvaluationExpression(testCase.source),
          );
        } catch (error) {
          results[testCase.caseId] = {
            status: "evaluator_error",
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return { browserVersion: version };
    },
  );
  return { results, browserVersion };
};

export const runR97ReferenceComparison = async ({
  cases,
  referenceResults,
  browserPath,
  wechatReportPath,
}) => {
  try {
    const plansByCase = cases.map((testCase) => ({
      testCase,
      result: analyzeCaseWithR97(testCase, []),
    }));
    const plans = plansByCase.flatMap((item) => item.result.decisions);
    const entityDimensions = Object.fromEntries(
      plans.map((plan) => [
        plan.runtimeEntity.entityId,
        ["existence", "type", "callability"],
      ]),
    );
    const observedAt = new Date().toISOString();
    const runtimeCollections = {
      [RUNTIME_IDS.LANGUAGE]: collectLanguageObservations({
        entityDimensions,
        observedAt,
      }),
      [RUNTIME_IDS.NODE]: collectNodeObservations({
        entityDimensions,
        observedAt,
      }),
    };
    let browserVersion = null;
    if (browserPath) {
      const browser = await collectBrowserObservations({
        entityDimensions,
        browserPath,
        observedAt,
      });
      runtimeCollections[RUNTIME_IDS.EDGE] = browser;
      browserVersion = browser.browserVersion;
    }
    let wechatReport = null;
    if (wechatReportPath && existsSync(wechatReportPath)) {
      try {
        wechatReport = JSON.parse(readFileSync(wechatReportPath, "utf8"));
        runtimeCollections[RUNTIME_IDS.WECHAT] = importWechatProbeResult({
          report: wechatReport,
          entityDimensions,
          observedAt,
        });
      } catch (error) {
        wechatReport = null;
        runtimeCollections[RUNTIME_IDS.WECHAT] = null;
        delete runtimeCollections[RUNTIME_IDS.WECHAT];
      }
    }
    const records = buildEvidenceRecords({
      decisionPlans: plans,
      runtimeCollections,
      policyVersion: "differential-reference-v1",
      validFrom: observedAt,
      validUntil: addDays(observedAt, 30),
    });
    const byCase = {};
    for (const { testCase } of plansByCase) {
      const result = analyzeCaseWithR97(testCase, records);
      const allowed =
        result.decisions.length > 0 &&
        result.decisions.every(
          (item) => item.decision.enforcementAction === "ALLOW_FOLD",
        );
      const knowledgeStates = unique(
        result.decisions.map((item) => item.decision.knowledgeState),
      );
      byCase[testCase.caseId] = {
        knowledgeStates:
          knowledgeStates.length > 0 ? knowledgeStates : ["NO_DECISION"],
        action: allowed ? "ALLOW_FOLD" : "BLOCK_FOLD",
        reasonCodes: unique(
          result.decisions.flatMap((item) => item.decision.reasonCodes),
        ),
      };
    }

    return {
      availability: {
        language: true,
        node: true,
        edge: browserVersion !== null,
        wechat: wechatReport !== null,
        browserVersion,
        wechatSdkVersion: wechatReport?.sdkVersion ?? null,
      },
      byCase,
      metrics: compareWithR97(referenceResults, byCase),
    };
  } catch (error) {
    return {
      availability: {
        language: true,
        node: true,
        edge: false,
        wechat: false,
      },
      byCase: {},
      metrics: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const analyzeCaseWithR97 = (testCase, evidenceRecords) => {
  const required = requiredRuntimes(testCase);
  const targetRuntimeIds = unique(
    required
      .filter((runtimeKey) => runtimeKey !== "language")
      .map((runtimeKey) => RUNTIME_KEYS[runtimeKey]),
  );
  return analyzeAndDecide({
    source: testCase.source,
    filePath: `${testCase.caseId}.js`,
    targetRuntimeIds,
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    policyVersion: "differential-reference-v1",
    contractVersion: "differential-reference-v1",
    evidenceRecords,
  });
};

const compareWithR97 = (referenceResults, byCase) => {
  const metrics = {
    comparable: 0,
    referenceAllowAndR97Allow: 0,
    referenceBlockAndR97Block: 0,
    referenceAllowButR97Block: 0,
    referenceBlockButR97Allow: 0,
    referenceUnverified: 0,
  };
  for (const referenceResult of referenceResults) {
    const referenceState = referenceResult.referenceState;
    const r97 = byCase[referenceResult.caseId];
    if (
      referenceState === REFERENCE_STATE.UNVERIFIED ||
      !r97
    ) {
      metrics.referenceUnverified += 1;
      continue;
    }
    metrics.comparable += 1;
    const r97Allows = r97.action === "ALLOW_FOLD";
    if (referenceState === REFERENCE_STATE.ALLOW_FOLD) {
      if (r97Allows) {
        metrics.referenceAllowAndR97Allow += 1;
      } else {
        metrics.referenceAllowButR97Block += 1;
      }
    } else if (r97Allows) {
      metrics.referenceBlockButR97Allow += 1;
    } else {
      metrics.referenceBlockAndR97Block += 1;
    }
  }
  return metrics;
};

const normalizeValueForDifferential = (value, depth = 0) => {
  if (depth > 4) {
    return { kind: "depth_limit" };
  }
  if (value === undefined) {
    return { kind: "undefined" };
  }
  if (value === null) {
    return { kind: "null" };
  }

  const type = typeof value;
  if (type === "number") {
    if (Number.isNaN(value)) {
      return { kind: "number", value: "NaN" };
    }
    if (value === Infinity) {
      return { kind: "number", value: "Infinity" };
    }
    if (value === -Infinity) {
      return { kind: "number", value: "-Infinity" };
    }
    return { kind: "number", value };
  }
  if (type === "string" || type === "boolean") {
    return { kind: type, value };
  }
  if (type === "bigint") {
    return { kind: "bigint", value: String(value) };
  }
  if (type === "symbol") {
    return {
      kind: "symbol",
      description: value.description ?? null,
    };
  }
  if (type === "function") {
    return {
      kind: "function",
      name: typeof value.name === "string" ? value.name : "",
      length: value.length,
    };
  }
  if (value instanceof Error) {
    return {
      kind: "error_object",
      name: value.name,
      message: String(value.message),
    };
  }
  if (Array.isArray(value)) {
    return {
      kind: "array",
      length: value.length,
      items: value
        .slice(0, 20)
        .map((item) => normalizeValueForDifferential(item, depth + 1)),
    };
  }

  let keys = [];
  try {
    keys = Object.keys(value).sort().slice(0, 20);
  } catch (error) {
    keys = [];
  }
  let constructorName = null;
  try {
    constructorName =
      value.constructor && typeof value.constructor.name === "string"
        ? value.constructor.name
        : null;
  } catch (error) {
    constructorName = null;
  }
  const tag = Object.prototype.toString.call(value);
  const isPlainObject =
    tag === "[object Object]" &&
    (constructorName === "Object" || constructorName === null);
  return {
    kind: "object",
    tag,
    constructorName,
    keys,
    values: isPlainObject
      ? Object.fromEntries(
          keys.map((key) => [
            key,
            normalizeValueForDifferential(value[key], depth + 1),
          ]),
        )
      : null,
  };
};

const stableObservationSignature = (observation) => {
  if (!observation || observation.status !== "observed") {
    return null;
  }
  return JSON.stringify(observation.result);
};

const skippedObservation = (testCase) => ({
  status: "skipped",
  reason:
    testCase.unverifiedReason ??
    "The case is excluded from execution by policy.",
});

const requiredRuntimes = (testCase) =>
  testCase.requiredRuntimes ?? DEFAULT_DIFFERENTIAL_RUNTIMES;

const writeDifferentialReport = (summary, outputDir) => {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "differential-reference.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "differential-reference.md"),
    renderMarkdown(summary),
    "utf8",
  );
};

const renderMarkdown = (summary) => {
  const rows = summary.results
    .map((result) => {
      const r97 = result.r97
        ? `${result.r97.knowledgeStates.join("/")} / ${result.r97.action}`
        : "未运行";
      return `| ${escapeMarkdown(result.caseId)} | ${result.referenceState} | ${r97} | ${escapeMarkdown(
        result.reason,
      )} |`;
    })
    .join("\n");
  const metrics = summary.r97Comparison?.metrics;
  return `# R97 独立差分执行参考

生成时间：${summary.generatedAt}

## 判定口径

- \`REFERENCE_ALLOW_FOLD\`：所有必需运行时都成功执行，且归一化行为一致。
- \`REFERENCE_BLOCK_FOLD\`：至少一个必需运行时与其它运行时行为不同。
- \`REFERENCE_UNVERIFIED\`：有副作用、缺少必需运行时或无法安全执行。

该结果只证明受控表达式在有限运行时样本上一致，不等同于对所有输入、
版本和环境组合的数学证明。

## 汇总

| 参考状态 | 数量 |
|---|---:|
${renderCounts(summary.byReferenceState)}

## 与 R97 结果对比

${
  metrics
    ? `| 指标 | 数量 |
|---|---:|
| 可比较案例 | ${metrics.comparable} |
| 双方都允许折叠 | ${metrics.referenceAllowAndR97Allow} |
| 双方都阻断折叠 | ${metrics.referenceBlockAndR97Block} |
| 参考允许但 R97 阻断 | ${metrics.referenceAllowButR97Block} |
| 参考阻断但 R97 允许 | ${metrics.referenceBlockButR97Allow} |
| 参考无法核验 | ${metrics.referenceUnverified} |`
    : `R97 对比未完成：${summary.r97Comparison?.error ?? "未启用"}`
}

## 逐案例

| 案例 | 独立参考 | R97 状态 / 动作 | 说明 |
|---|---|---|---|
${rows}
`;
};

const renderCounts = (counts) =>
  Object.entries(counts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");

const countBy = (items, selector) => {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

const unique = (values) => [...new Set(values)];

const addDays = (isoDateTime, days) => {
  const date = new Date(isoDateTime);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const escapeMarkdown = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ");

export const parseDifferentialArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/differential-reference"),
    browserPath: findBrowserPath(),
    wechatReportPath: existsSync(DEFAULT_WECHAT_REPORT)
      ? DEFAULT_WECHAT_REPORT
      : null,
    runR97Comparison: true,
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
    } else if (argument === "--no-r97") {
      options.runR97Comparison = false;
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
  const options = parseDifferentialArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: node src/evaluation/differential-reference.mjs [options]

Options:
  --out <dir>              Output directory
  --browser <path>         Chromium-based browser executable
  --wechat-report <path>   Real WeChat probe report for the R97 comparison
  --no-r97                 Skip the R97 comparison
  --help                   Show this message`);
  } else {
    const summary = await runDifferentialReference(options);
    console.log(JSON.stringify({
      outputDir: options.outputDir,
      byReferenceState: summary.byReferenceState,
      r97Metrics: summary.r97Comparison?.metrics ?? null,
    }, null, 2));
  }
}
