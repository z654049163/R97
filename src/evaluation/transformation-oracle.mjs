import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_STATE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { decideProtection } from "../decision-engine.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { executeDifferentialCases } from "./differential-reference.mjs";
import { buildRuntimeEvidence } from "./run-benchmark.mjs";
import { TRANSFORMATION_ORACLE_CASES } from "./transformation-oracle-cases.mjs";

/**
 * Level 2 变换 oracle。
 *
 * 判卷（Level 1）比较的是「同一实体的观测能不能迁移」；这一层直接比较
 * 「变换前后在目标环境里的行为」：
 *
 *   unsafe  ⟺  Obs(P, R_t) ≠ Obs(T(P), R_t)
 *
 * 它不读 R97 的任何规则，因此是真正独立的第二条真值通道。把两者的结论叠在
 * 一起，才能回答「R97 放行的变换有多少在目标环境里真的保语义」——这是
 * Level 1 回答不了的问题，因为实体观测一致不等于变换保语义。
 */

const ORACLE_TARGET_RUNTIME_IDS = Object.freeze([
  RUNTIME_IDS.LANGUAGE,
  RUNTIME_IDS.NODE,
  RUNTIME_IDS.EDGE,
]);

const POLICY_VERSION = "transformation-oracle-v1";

export const runTransformationOracle = async ({
  cases = TRANSFORMATION_ORACLE_CASES,
  outputDir = null,
  generatedAt = new Date().toISOString(),
} = {}) => {
  const plans = cases.map((testCase) => ({
    testCase,
    analysis: analyzeAndDecide({
      source: testCase.foldPoint,
      filePath: oracleFilePath(testCase.caseId),
      targetRuntimeIds: ORACLE_TARGET_RUNTIME_IDS,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: POLICY_VERSION,
      contractVersion: "transformation-oracle-v1",
    }),
  }));

  const allDecisions = plans.flatMap((entry) => entry.analysis.decisions);
  const evidence = await buildRuntimeEvidence(
    allDecisions,
    ORACLE_TARGET_RUNTIME_IDS,
    POLICY_VERSION,
    null,
  );

  const r97ByCase = new Map(
    plans.map(({ testCase, analysis }) => [
      testCase.caseId,
      summarizeDecision(
        analysis.decisions.map((plan) =>
          decideProtection({
            query: plan.query,
            semanticContract: plan.semanticContract,
            evidenceRecords: evidence.records,
          }),
        ),
      ),
    ]),
  );

  // 变换前后都放进同一个判卷执行器，只是分成两组 case。
  const differentialCases = cases.flatMap((testCase) => [
    {
      caseId: `${testCase.caseId}::before`,
      source: testCase.source,
      requiredRuntimes: [testCase.targetRuntime],
    },
    {
      caseId: `${testCase.caseId}::after`,
      source: testCase.folded,
      requiredRuntimes: [testCase.targetRuntime],
    },
  ]);
  const execution = await executeDifferentialCases({ cases: differentialCases });

  const results = cases.map((testCase) => {
    const before =
      execution.observationsByRuntime[testCase.targetRuntime]?.[
        `${testCase.caseId}::before`
      ] ?? null;
    const after =
      execution.observationsByRuntime[testCase.targetRuntime]?.[
        `${testCase.caseId}::after`
      ] ?? null;
    const behavior = compareBehavior(before, after);
    const r97 = r97ByCase.get(testCase.caseId);
    return Object.freeze({
      caseId: testCase.caseId,
      category: testCase.category,
      description: testCase.description,
      evaluatorRuntime: testCase.evaluatorRuntime,
      targetRuntime: testCase.targetRuntime,
      r97Action: r97.action,
      r97States: r97.states,
      r97ReasonCodes: r97.reasonCodes,
      behavior,
      verdict: classifyVerdict(r97.action, behavior.same),
    });
  });

  const summary = summarize({ results, generatedAt, evidence });
  if (outputDir) {
    writeReport(summary, outputDir);
  }
  return summary;
};

const oracleFilePath = (caseId) => `oracle/${caseId}.js`;

/**
 * R97 对这个折叠点的整体动作。
 *
 * 没有 finding 也是一种结论：说明这个点不在保护范围内（例如它引用的名字是
 * 局部绑定），等价于不拦。
 */
const summarizeDecision = (decisions) => {
  if (decisions.length === 0) {
    return {
      action: "ALLOW",
      states: Object.freeze([]),
      reasonCodes: Object.freeze([]),
    };
  }
  const states = decisions.map((decision) => decision.knowledgeState);
  const reasonCodes = [
    ...new Set(decisions.flatMap((decision) => decision.reasonCodes)),
  ];
  const blocked = states.some((state) => state !== KNOWLEDGE_STATE.FOLD);
  return {
    action: blocked ? "BLOCK" : "ALLOW",
    states: Object.freeze(states),
    reasonCodes: Object.freeze(reasonCodes),
  };
};

/**
 * 形式化观测等价性判定（对标 OBsmith Section 3.4 的 Observational Equivalence 定义）：
 * P ≈_E Q ⟺ Norm(Trace_E(P)) = Norm(Trace_E(Q))
 * 比较规范化后的执行终结状态、异常类型或序列化返回值。
 */
export const isObservationallyEquivalent = (beforeObs, afterObs) => {
  const comp = compareBehavior(beforeObs, afterObs);
  return comp.verified && comp.same === true;
};

const compareBehavior = (before, after) => {
  const beforeShape = observationShape(before);
  const afterShape = observationShape(after);
  if (beforeShape === null || afterShape === null) {
    return Object.freeze({
      verified: false,
      same: null,
      before: beforeShape,
      after: afterShape,
    });
  }
  return Object.freeze({
    verified: true,
    same: beforeShape === afterShape,
    before: beforeShape,
    after: afterShape,
  });
};

/**
 * 只比较**可观察的行为形状**：返回值的规范化结果，或者异常的类名。
 *
 * 与判卷探针保持同一个口径——不比较错误消息文本，避免把环境措辞差异当成
 * 语义差异。
 */
const observationShape = (observation) => {
  if (!observation || typeof observation !== "object") {
    return null;
  }
  if (observation.status !== "observed") {
    return `${observation.status}`;
  }
  if (observation.outcome === "exception") {
    return `exception:${observation.errorName}`;
  }
  return `value:${JSON.stringify(observation.result)}`;
};

const classifyVerdict = (r97Action, behaviorSame) => {
  if (behaviorSame === null) {
    return "unverified";
  }
  if (r97Action === "ALLOW") {
    return behaviorSame ? "correct-allow" : "unsafe-allow";
  }
  return behaviorSame ? "over-protection" : "correct-block";
};

const summarize = ({ results, generatedAt, evidence }) => {
  const byVerdict = {};
  for (const result of results) {
    byVerdict[result.verdict] = (byVerdict[result.verdict] ?? 0) + 1;
  }
  const verified = results.filter((result) => result.verdict !== "unverified");
  const allowed = verified.filter((result) => result.r97Action === "ALLOW");
  const unsafeAllowed = allowed.filter(
    (result) => result.verdict === "unsafe-allow",
  );
  const expectedUnsafe = results.filter(
    (result) => result.behavior.same === false,
  );

  return Object.freeze({
    generatedAt,
    caseCount: results.length,
    verifiedCaseCount: verified.length,
    byVerdict: Object.freeze(byVerdict),
    // 变换 oracle 的两个核心量：放行的变换里有没有在目标环境改变行为的，
    // 以及已知会改变行为的变换有没有被拦住。
    allowedFoldCount: allowed.length,
    unsafeAllowCount: unsafeAllowed.length,
    foldPrecision: allowed.length === 0
      ? null
      : (allowed.length - unsafeAllowed.length) / allowed.length,
    divergentTransformationCount: expectedUnsafe.length,
    blockedDivergentCount: expectedUnsafe.filter(
      (result) => result.r97Action === "BLOCK",
    ).length,
    evidenceAvailability: evidence.availability,
    results: Object.freeze(results),
  });
};

const renderMarkdown = (summary) => {
  const lines = [
    "# Transformation Oracle（Level 2）",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    "判卷（Level 1）问的是「实体观测能不能迁移」；这一层问的是",
    "「变换前后在**目标环境**里的行为一样吗」：",
    "",
    "```",
    "unsafe  ⟺  Obs(P, R_t) ≠ Obs(T(P), R_t)",
    "```",
    "",
    "它不读 R97 的规则，因此是独立的第二条真值通道。",
    "",
    "| 指标 | 数值 |",
    "|---|---:|",
    `| 用例 | ${summary.caseCount} |`,
    `| 可执行验证 | ${summary.verifiedCaseCount} |`,
    `| R97 放行 | ${summary.allowedFoldCount} |`,
    `| **放行中在目标环境改变行为** | **${summary.unsafeAllowCount}** |`,
    `| Fold Precision（变换口径） | ${summary.foldPrecision === null ? "—" : `${(summary.foldPrecision * 100).toFixed(2)}%`} |`,
    `| 已知会改变行为的变换 | ${summary.divergentTransformationCount} |`,
    `| 其中被 R97 拦住 | ${summary.blockedDivergentCount} |`,
    "",
    "## 逐例结果",
    "",
    "| 用例 | 类别 | 目标 | R97 | 变换前 | 变换后 | 结论 |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const result of summary.results) {
    lines.push(
      `| \`${result.caseId}\` | ${result.category} | ${result.targetRuntime} | ${result.r97Action} | ${result.behavior.before ?? "—"} | ${result.behavior.after ?? "—"} | ${VERDICT_LABELS[result.verdict] ?? result.verdict} |`,
    );
  }
  lines.push(
    "",
    "`unsafe-allow` 才是不安全；`over-protection` 是保守方向的代价；",
    "`unverified` 表示目标环境没能执行（例如没有可用的浏览器），单独计数不混入结论。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

const VERDICT_LABELS = Object.freeze({
  "correct-allow": "正确放行",
  "unsafe-allow": "**不安全放行**",
  "correct-block": "正确拦截",
  "over-protection": "过度保护",
  unverified: "未验证",
});

const writeReport = (summary, outputDir) => {
  mkdirSync(outputDir, { recursive: true });
  const payload = {
    generatedAt: summary.generatedAt,
    caseCount: summary.caseCount,
    verifiedCaseCount: summary.verifiedCaseCount,
    byVerdict: summary.byVerdict,
    allowedFoldCount: summary.allowedFoldCount,
    unsafeAllowCount: summary.unsafeAllowCount,
    foldPrecision: summary.foldPrecision,
    divergentTransformationCount: summary.divergentTransformationCount,
    blockedDivergentCount: summary.blockedDivergentCount,
    evidenceAvailability: summary.evidenceAvailability,
    results: summary.results,
  };
  writeFileSync(
    path.join(outputDir, "transformation-oracle.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "transformation-oracle.md"),
    renderMarkdown(summary),
    "utf8",
  );
};

export const parseTransformationOracleArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets", "transformation-oracle"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--out") {
      if (typeof next !== "string" || next.startsWith("--")) {
        throw new Error("--out requires a value");
      }
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

export const oracleCaseDigest = (cases = TRANSFORMATION_ORACLE_CASES) =>
  createHash("sha256")
    .update(cases.map((testCase) => testCase.caseId).join("|"))
    .digest("hex")
    .slice(0, 16);

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseTransformationOracleArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/transformation-oracle.mjs [--out <dir>]",
        "",
        "Level 2 变换 oracle：比较变换前后在目标环境里的可观察行为。",
      ].join("\n"),
    );
  } else {
    const summary = await runTransformationOracle(options);
    console.log(
      JSON.stringify(
        {
          caseCount: summary.caseCount,
          verifiedCaseCount: summary.verifiedCaseCount,
          byVerdict: summary.byVerdict,
          allowedFoldCount: summary.allowedFoldCount,
          unsafeAllowCount: summary.unsafeAllowCount,
          foldPrecision: summary.foldPrecision,
          divergentTransformationCount: summary.divergentTransformationCount,
          blockedDivergentCount: summary.blockedDivergentCount,
        },
        null,
        2,
      ),
    );
  }
}
