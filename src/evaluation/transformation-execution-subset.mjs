import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_STATE,
  TARGET_RUNTIME_SOURCE,
  TRANSFORMATION_KIND,
} from "../constants.mjs";
import {
  evaluateSourceInLanguageBaseline,
  executeDifferentialCases,
} from "./differential-reference.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
  toJavaScriptExpression,
} from "./run-benchmark.mjs";

/**
 * 语料规模的 Level 2 变换验证。
 *
 * `transformation-oracle.mjs` 用的是 20 个手工设计用例，回答的是「机制对不对」。
 * 这一层回答的是「在真实语料上，R97 实际放行的那些折叠点，把求值基线算出来的
 * 值写死之后，目标环境里的行为还一样吗」：
 *
 *     P   = 求值基线里跑折叠点表达式
 *     T(P)= 把该表达式替换成基线结果的字面量
 *     不安全 ⟺ Obs(T(P), R_t) ≠ Obs(P, R_t)
 *
 * 这是唯一直接检验「R97 放行的变换本身保不保语义」的通道。判卷（Level 1）只比较
 * 同一实体的观测能不能迁移，那只是必要条件。
 */

const DEFAULT_TARGET_RUNTIME_IDS = Object.freeze([
  RUNTIME_IDS.LANGUAGE,
  RUNTIME_IDS.NODE,
  RUNTIME_IDS.EDGE,
]);

const POLICY_VERSION = "transformation-subset-v1";

const buildProbeExpression = (record, expression) => {
  switch (record.transformationKind) {
    case TRANSFORMATION_KIND.CONST_EVAL:
      return record.usageContext?.accessMode === "typeof"
        ? `typeof ${expression}`
        : expression;
    case TRANSFORMATION_KIND.BRANCH_PRUNE:
      return expression;
    case TRANSFORMATION_KIND.CALL_EVAL:
      return `(${expression})()`;
    case TRANSFORMATION_KIND.DEAD_CODE_DELETE:
      return expression;
    default:
      return null;
  }
};

/**
 * 变换前：在目标环境里真实求值这个折叠点，把结果序列化成
 * `ok:<json>:<typeof>` 或 `throw:<ErrorName>`，便于跨环境逐字比较。
 *
 * 这里直接内联表达式而不是内联一个序列化函数：`(v) => {...}(v)` 会被解析成
 * `(v) => ({...}(v))`——箭头函数不能立即调用，会得到 SyntaxError。
 *
 * **分支剪枝只比较条件的真假**：`if (globalThis)` 关心的是 truthiness，不是
 * `globalThis` 能不能被序列化。第一版把两类变换用同一个序列化口径比较，于是
 * `globalThis` 在 Node 里因为循环引用抛 TypeError、在隔离 vm 里序列化成 `{}`，
 * 被误报成一次不安全变换。
 */
/**
 * 只有**标量结果**才进入验证：对象与函数无法写成字面量，真实的折叠器也不会
 * 折叠它们。用「序列化结果」当替代品会伪造出差异——`globalThis` 在隔离 vm 里
 * 序列化成 `{}`、在 Node 里因为循环引用直接抛 TypeError，但没有任何折叠器会把
 * `globalThis` 替换成 `{}`。
 */
const SCALAR_OUTCOME_KINDS = new Set([
  "string",
  "number",
  "boolean",
  "undefined",
]);

const outcomeKind = (outcome) => {
  if (typeof outcome !== "string" || outcome.startsWith("throw:")) {
    return "exception";
  }
  const parts = outcome.split(":");
  return parts.length >= 3 ? parts.at(-1) : null;
};

const buildBeforeSource = (record, probeExpression) => {
  if (record.transformationKind === TRANSFORMATION_KIND.BRANCH_PRUNE) {
    return `(() => { try { return "branch:" + Boolean(${probeExpression}); } catch (e) { return "throw:" + ((e && e.name) || "Error"); } })()`;
  }
  return `(() => { try { const v = (${probeExpression}); const json = JSON.stringify(v); return "ok:" + (json === undefined ? "<undefined>" : json) + ":" + typeof v; } catch (e) { return "throw:" + ((e && e.name) || "Error"); } })()`;
};

/** 变换后：把求值基线算出来的结果直接写死。 */
const buildAfterSource = (baselineOutcome) =>
  `(() => ${JSON.stringify(baselineOutcome)})()`;

export const runTransformationExecutionSubset = async ({
  corpusPath,
  perEntityCap = 5,
  sampleLimit = 500,
  seed = 970917,
  outputDir = null,
  generatedAt = new Date().toISOString(),
}) => {
  const records = (
    await readDeduplicatedCorpusRecords(
      corpusPath,
      Number.POSITIVE_INFINITY,
      { perEntityCap },
    )
  )
    .map((record) => ({
      ...record,
      generatedSource: sourceForRecord(record),
    }))
    .filter((record) => record.generatedSource !== null);

  const plans = records.flatMap((record) =>
    analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      targetRuntimeIds: DEFAULT_TARGET_RUNTIME_IDS,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: POLICY_VERSION,
      contractVersion: "benchmark-v1",
    }).decisions,
  );
  const evidence = await buildRuntimeEvidence(
    plans,
    DEFAULT_TARGET_RUNTIME_IDS,
    POLICY_VERSION,
    null,
  );

  // 只验证 R97 **实际放行**的折叠点：其余点被拦住了，变换不会发生。
  const allowed = [];
  for (const record of records) {
    const decision = analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      targetRuntimeIds: DEFAULT_TARGET_RUNTIME_IDS,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: POLICY_VERSION,
      contractVersion: "benchmark-v1",
      evidenceRecords: evidence.records,
    }).decisions[0];
    if (decision?.decision.knowledgeState !== KNOWLEDGE_STATE.FOLD) {
      continue;
    }
    const expression = toJavaScriptExpression(record.entityId);
    const probeExpression = expression
      ? buildProbeExpression(record, expression)
      : null;
    if (!probeExpression) {
      continue;
    }
    allowed.push({ record, probeExpression });
  }

  const sampled = deterministicSample(allowed, sampleLimit, seed);

  // 变换后的程序由**求值基线**的结果决定，因此先在基线里跑一遍。
  const verified = [];
  let baselineFailed = 0;
  let skippedNonScalar = 0;
  const increment = (counts, key) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  const rootOf = (entityId) => String(entityId).split(".")[0];
  const skippedByOutcomeKind = {};
  const skippedByTransformation = {};
  const verifiedByTransformation = {};
  const skippedByRoot = {};
  const verifiedByRoot = {};
  const skippedExamples = [];
  for (const item of sampled) {
    const baselineObservation = await evaluateSourceInLanguageBaseline(
      buildBeforeSource(item.record, item.probeExpression),
    );
    const baselineOutcome = baselineObservation?.result?.value;
    if (typeof baselineOutcome !== "string") {
      baselineFailed += 1;
      continue;
    }
    const kind = outcomeKind(baselineOutcome);
    if (kind !== "exception" && !SCALAR_OUTCOME_KINDS.has(kind)) {
      skippedNonScalar += 1;
      increment(skippedByOutcomeKind, kind);
      increment(
        skippedByTransformation,
        item.record.transformationKind ?? "<unknown>",
      );
      increment(skippedByRoot, rootOf(item.record.entityId));
      if (skippedExamples.length < 20) {
        skippedExamples.push({
          entityId: item.record.entityId,
          project: item.record.project ?? null,
          transformationKind: item.record.transformationKind ?? null,
          outcomeKind: kind,
        });
      }
      continue;
    }
    increment(
      verifiedByTransformation,
      item.record.transformationKind ?? "<unknown>",
    );
    increment(verifiedByRoot, rootOf(item.record.entityId));
    verified.push({
      ...item,
      baselineOutcome,
      before: buildBeforeSource(item.record, item.probeExpression),
      after: buildAfterSource(baselineOutcome),
    });
  }

  // 变换前后两段程序都放进同一个判卷执行器，只是分成两组 case。
  // 分批送进 CDP：一次性把上千个 case 塞给浏览器会触发未处理的 rejection，
  // 而且失败时无法定位。每批 100 个，单批失败只丢这一批。
  const BATCH_SIZE = 100;
  const observations = {};
  for (let start = 0; start < verified.length; start += BATCH_SIZE) {
    const batch = verified.slice(start, start + BATCH_SIZE);
    const differentialCases = batch.flatMap((item, offset) => {
      const index = start + offset;
      return [
        {
          caseId: `${index}::before`,
          source: item.before,
          requiredRuntimes: ["node", "edge"],
        },
        {
          caseId: `${index}::after`,
          source: item.after,
          requiredRuntimes: ["node", "edge"],
        },
      ];
    });
    try {
      const execution = await executeDifferentialCases({
        cases: differentialCases,
      });
      for (const runtimeKey of Object.keys(execution.observationsByRuntime)) {
        observations[runtimeKey] = {
          ...(observations[runtimeKey] ?? {}),
          ...execution.observationsByRuntime[runtimeKey],
        };
      }
    } catch (error) {
      process.stderr.write(
        `[subset] 批次 ${start}–${start + batch.length} 执行失败，跳过：${error?.message ?? error}\n`,
      );
    }
  }

  const results = verified.map((item, index) => {
    const perRuntime = {};
    for (const runtimeKey of ["node", "edge"]) {
      const before = observations[runtimeKey]?.[`${index}::before`] ?? null;
      const after = observations[runtimeKey]?.[`${index}::after`] ?? null;
      const beforeOutcome = before?.result?.value ?? null;
      const afterOutcome = after?.result?.value ?? null;
      perRuntime[runtimeKey] = {
        observed: typeof beforeOutcome === "string" && typeof afterOutcome === "string",
        before: beforeOutcome,
        after: afterOutcome,
        same: beforeOutcome === afterOutcome,
      };
    }
    return {
      entityId: item.record.entityId,
      project: item.record.project,
      transformationKind: item.record.transformationKind,
      baselineOutcome: item.baselineOutcome,
      perRuntime,
      verdict: classifyResult(perRuntime),
    };
  });

  const summary = summarize({
    results,
    allowedCount: allowed.length,
    sampledCount: sampled.length,
    baselineFailed,
    skippedNonScalar,
    skippedByOutcomeKind,
    skippedByTransformation,
    verifiedByTransformation,
    skippedByRoot,
    verifiedByRoot,
    skippedExamples,
    generatedAt,
    corpusPath,
  });
  if (outputDir) {
    writeReport(summary, outputDir);
  }
  return summary;
};

const classifyResult = (perRuntime) => {
  const observed = Object.values(perRuntime).filter((item) => item.observed);
  if (observed.length === 0) {
    return "unverified";
  }
  return observed.every((item) => item.same) ? "safe" : "unsafe";
};

const summarize = ({
  results,
  allowedCount,
  sampledCount,
  baselineFailed,
  skippedNonScalar,
  skippedByOutcomeKind,
  skippedByTransformation,
  verifiedByTransformation,
  skippedByRoot,
  verifiedByRoot,
  skippedExamples,
  generatedAt,
  corpusPath,
}) => {
  const byVerdict = {};
  for (const result of results) {
    byVerdict[result.verdict] = (byVerdict[result.verdict] ?? 0) + 1;
  }
  const unsafe = results.filter((result) => result.verdict === "unsafe");
  return Object.freeze({
    generatedAt,
    corpusPath,
    allowedFoldCount: allowedCount,
    sampledCount,
    baselineEvaluationFailed: baselineFailed,
    skippedNonScalar,
    skippedByOutcomeKind: Object.freeze({ ...skippedByOutcomeKind }),
    skippedByTransformation: Object.freeze({ ...skippedByTransformation }),
    verifiedByTransformation: Object.freeze({ ...verifiedByTransformation }),
    skippedByRoot: Object.freeze({ ...skippedByRoot }),
    verifiedByRoot: Object.freeze({ ...verifiedByRoot }),
    skippedExamples: Object.freeze(skippedExamples),
    verifiedCount: results.length,
    byVerdict: Object.freeze(byVerdict),
    unsafeCount: unsafe.length,
    observedTransformPrecision:
      results.length === 0
        ? null
        : (results.length - unsafe.length) / results.length,
    unsafeExamples: Object.freeze(unsafe.slice(0, 20)),
    results: Object.freeze(results),
  });
};

const renderMarkdown = (summary) => {
  const lines = [
    "# 语料规模的变换执行验证（Level 2）",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    "对 R97 **实际放行**的折叠点，把求值基线算出来的结果写死成变换后的程序，再在",
    "目标环境里分别执行变换前后两段，直接比较可观察行为：",
    "",
    "```",
    "P    = 在基线里求值折叠点",
    "T(P) = 把该表达式替换成基线结果的字面量",
    "不安全 ⟺ Obs(T(P), R_t) ≠ Obs(P, R_t)",
    "```",
    "",
    "| 指标 | 数值 |",
    "|---|---:|",
    `| R97 放行的折叠点 | ${summary.allowedFoldCount} |`,
    `| 抽样送入执行验证 | ${summary.sampledCount} |`,
    `| 结果非标量（跳过，折叠器也不会碰） | ${summary.skippedNonScalar} |`,
    `| 基线求值失败（跳过） | ${summary.baselineEvaluationFailed} |`,
    `| 完成验证 | ${summary.verifiedCount} |`,
    `| **行为不一致** | **${summary.unsafeCount}** |`,
    `| 观测变换精度 | ${summary.observedTransformPrecision === null ? "—" : `${(summary.observedTransformPrecision * 100).toFixed(2)}%`} |`,
    "",
    "## 跳过构成（选择偏差检查）",
    "",
    "`skippedNonScalar` = 基线结果是对象/数组/函数等非标量，折叠器不会把它写成字面量。",
    "",
    "| 基线结果类型 | 数量 |",
    "|---|---:|",
    ...Object.entries(summary.skippedByOutcomeKind ?? {})
      .sort((left, right) => right[1] - left[1])
      .map(([kind, count]) => `| ${kind} | ${count} |`),
    "",
    "验证子集与跳过子集在变换类型上的分布：",
    "",
    "| transformationKind | 已验证 | 跳过 |",
    "|---|---:|---:|",
    ...(() => {
      const verified = summary.verifiedByTransformation ?? {};
      const skipped = summary.skippedByTransformation ?? {};
      const keys = [
        ...new Set([...Object.keys(verified), ...Object.keys(skipped)]),
      ].sort();
      return keys.map(
        (key) => `| ${key} | ${verified[key] ?? 0} | ${skipped[key] ?? 0} |`,
      );
    })(),
    "",
    "跳过最多的实体根（前 10）：",
    "",
    "| 根节点 | 跳过数 |",
    "|---|---:|",
    ...Object.entries(summary.skippedByRoot ?? {})
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([root, count]) => `| \`${root}\` | ${count} |`),
    "",
    "## 不一致样例",
    "",
    "| 实体 | 变换类型 | 基线结果 | node | edge |",
    "|---|---|---|---|---|",
  ];
  for (const item of summary.unsafeExamples) {
    lines.push(
      `| \`${item.entityId}\` | ${item.transformationKind} | \`${item.baselineOutcome}\` | \`${item.perRuntime.node.before}\` → \`${item.perRuntime.node.after}\` | \`${item.perRuntime.edge.before}\` → \`${item.perRuntime.edge.after}\` |`,
    );
  }
  if (summary.unsafeExamples.length === 0) {
    lines.push("| — | — | — | — | — |");
  }
  lines.push(
    "",
    "行为不一致意味着：在求值基线里算出的值，写到目标环境后语义变了——这正是 R97",
    "要拦下的错误折叠。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

const writeReport = (summary, outputDir) => {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "transformation-execution-subset.json"),
    `${JSON.stringify(
      {
        generatedAt: summary.generatedAt,
        corpusPath: summary.corpusPath,
        allowedFoldCount: summary.allowedFoldCount,
        sampledCount: summary.sampledCount,
        baselineEvaluationFailed: summary.baselineEvaluationFailed,
        skippedNonScalar: summary.skippedNonScalar,
        skippedByOutcomeKind: summary.skippedByOutcomeKind,
        skippedByTransformation: summary.skippedByTransformation,
        verifiedByTransformation: summary.verifiedByTransformation,
        skippedByRoot: summary.skippedByRoot,
        verifiedByRoot: summary.verifiedByRoot,
        skippedExamples: summary.skippedExamples,
        verifiedCount: summary.verifiedCount,
        byVerdict: summary.byVerdict,
        unsafeCount: summary.unsafeCount,
        observedTransformPrecision: summary.observedTransformPrecision,
        unsafeExamples: summary.unsafeExamples,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "transformation-execution-subset.md"),
    renderMarkdown(summary),
    "utf8",
  );
};

/** 确定性抽样：同一份语料每次取同一批，便于复核。 */
const deterministicSample = (items, limit, seed) => {
  if (items.length <= limit) {
    return items;
  }
  const random = createSeededRandom(seed);
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [pool[index], pool[pick]] = [pool[pick], pool[index]];
  }
  return pool.slice(0, limit);
};

const createSeededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const parseTransformationSubsetArgs = (argv) => {
  const options = {
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    perEntityCap: 5,
    sampleLimit: 500,
    outputDir: path.resolve("datasets/transformation-execution-subset"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--corpus") {
      options.corpusPath = path.resolve(next);
      index += 1;
    } else if (argument === "--sample-limit") {
      options.sampleLimit = Number.parseInt(next, 10);
      index += 1;
    } else if (argument === "--out") {
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
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(
      `[subset] 未处理的 rejection: ${reason?.stack ?? reason}\n`,
    );
  });
  const options = parseTransformationSubsetArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/transformation-execution-subset.mjs [options]",
        "",
        "  --corpus <path>        语料 JSONL",
        "  --sample-limit <n>     最多验证多少个放行点（默认 500）",
        "  --out <dir>            输出目录",
      ].join("\n"),
    );
  } else {
    const summary = await runTransformationExecutionSubset(options);
    console.log(
      JSON.stringify(
        {
          allowedFoldCount: summary.allowedFoldCount,
          sampledCount: summary.sampledCount,
          verifiedCount: summary.verifiedCount,
          byVerdict: summary.byVerdict,
          unsafeCount: summary.unsafeCount,
          observedTransformPrecision: summary.observedTransformPrecision,
        },
        null,
        2,
      ),
    );
  }
}
