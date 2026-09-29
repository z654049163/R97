import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_PROVENANCE,
  KNOWLEDGE_STATE,
  REASON_CODE,
  TARGET_RUNTIME_SOURCE,
  TRANSFORMATION_KIND,
} from "../constants.mjs";
import { analyzeSource } from "../analyzer.mjs";
import { buildEvidenceRecords } from "../evidence/evidence-builder.mjs";
import { collectBrowserObservations } from "../evidence/browser-probe.mjs";
import { collectLanguageObservations } from "../evidence/language-probe.mjs";
import { collectNodeObservations } from "../evidence/node-probe.mjs";
import { importWechatProbeResult } from "../evidence/wechat-probe.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import {
  isNodeBuiltinRoot,
  nodeBuiltinRequestFromRoot,
} from "../module-runtime.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { SYNTHETIC_CASES } from "./cases.mjs";
import { collectGroundTruth } from "./differential-ground-truth.mjs";
import {
  DEFAULT_LEGACY_RULE_MAP,
  loadLegacyBlacklist,
} from "./legacy-blacklist.mjs";

const DEFAULT_TARGET_RUNTIME_IDS = Object.freeze([
  RUNTIME_IDS.LANGUAGE,
  RUNTIME_IDS.NODE,
]);

const DEFAULT_PREFIXES = Object.freeze([
  "App",
  "Behavior",
  "Buffer",
  "Component",
  "Page",
  "document",
  "fetch",
  "getApp",
  "getCurrentPages",
  "globalThis",
  "localStorage",
  "process",
  "require",
  "sessionStorage",
  "setInterval",
  "setTimeout",
  "window",
  "wx",
]);

const RESERVED_IDENTIFIERS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

export const runBenchmark = ({
  outputDir,
  corpusPath = null,
  legacyMapPath = DEFAULT_LEGACY_RULE_MAP,
  corpusLimit = 5000,
  perEntityCap = null,
  independentCheck = false,
  targetRuntimeIds = DEFAULT_TARGET_RUNTIME_IDS,
  evaluatorRuntimeId = RUNTIME_IDS.LANGUAGE,
  wechatReportPath = null,
  sourceRoot = null,
}) => {
  return runBenchmarkAsync({
    outputDir,
    corpusPath,
    legacyMapPath,
    corpusLimit,
    perEntityCap,
    independentCheck,
    targetRuntimeIds,
    evaluatorRuntimeId,
    wechatReportPath,
    sourceRoot,
  });
};

const runBenchmarkAsync = async ({
  outputDir,
  corpusPath,
  legacyMapPath,
  corpusLimit,
  perEntityCap,
  independentCheck,
  targetRuntimeIds,
  evaluatorRuntimeId,
  wechatReportPath,
  sourceRoot,
}) => {
  mkdirSync(outputDir, { recursive: true });
  const legacy = loadLegacyBlacklist(legacyMapPath);
  const synthetic = await runSyntheticBenchmark({
    legacy,
    targetRuntimeIds,
    wechatReportPath,
  });
  const corpus = corpusPath
      ? await runCorpusBenchmark({
          corpusPath,
          corpusLimit,
          perEntityCap,
          independentCheck,
          legacy,
          targetRuntimeIds,
          evaluatorRuntimeId,
          wechatReportPath,
          sourceRoot,
      })
    : null;
  const corpusResults = corpus?.results ?? null;
  const corpusSummary = corpus
    ? Object.fromEntries(
        Object.entries(corpus).filter(([key]) => key !== "results"),
      )
    : null;
  const summary = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      targetRuntimeIds: [...targetRuntimeIds],
      evaluatorRuntimeId,
      legacySource: legacy.source,
      legacySymbolCount: legacy.symbols.size,
      corpusPath,
      wechatReportPath,
    },
    synthetic,
    corpus: corpusSummary,
  };

  writeFileSync(
    path.join(outputDir, "benchmark-synthetic.json"),
    `${JSON.stringify(synthetic, null, 2)}\n`,
    "utf8",
  );
  if (corpusSummary) {
    writeFileSync(
      path.join(outputDir, "benchmark-corpus.json"),
      `${JSON.stringify(corpusSummary, null, 2)}\n`,
      "utf8",
    );
    if (corpusResults) {
      writeFileSync(
        path.join(outputDir, "benchmark-results.jsonl"),
        `${corpusResults.map((result) => JSON.stringify(result)).join("\n")}\n`,
        "utf8",
      );
    }
    const chart = renderSafetyUtilityChart(corpusSummary);
    if (chart) {
      writeFileSync(
        path.join(outputDir, "safety-utility.svg"),
        chart,
        "utf8",
      );
    }
  }
  writeFileSync(
    path.join(outputDir, "benchmark-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "benchmark-summary.md"),
    renderMarkdown(summary),
    "utf8",
  );

  return summary;
};

// A synthetic case that names a real target runtime can only be labelled from
// the evidence that was actually collected: with that runtime offline the
// honest expectation is UNKNOWN, with it observed the same case becomes a real
// contract mismatch.
const resolveSyntheticExpected = (testCase, availability) => {
  const required = testCase.requiresEvidence;
  if (required && testCase.expectedWhenEvidencePresent) {
    return availability?.[required] === true
      ? testCase.expectedWhenEvidencePresent
      : testCase.expected;
  }
  return testCase.expected;
};

export const runSyntheticBenchmark = async ({
  legacy,
  targetRuntimeIds = DEFAULT_TARGET_RUNTIME_IDS,
  wechatReportPath = null,
}) => {
  const plansByCase = SYNTHETIC_CASES.map((testCase) =>
    ({
      testCase,
      result: analyzeCase(testCase, [], targetRuntimeIds),
    }),
  );
  const allPlans = plansByCase.flatMap((item) => item.result.decisions);
  const evidence = await buildRuntimeEvidence(
    allPlans,
    targetRuntimeIds,
    "benchmark-policy-v1",
    wechatReportPath,
  );
  const results = plansByCase.map(({ testCase }) => {
    const result = analyzeCase(
      testCase,
      evidence.records,
      targetRuntimeIds,
    );
    const allowed = result.decisions.every(
      (item) => item.decision.enforcementAction === "ALLOW_FOLD",
    );
    const expected = resolveSyntheticExpected(
      testCase,
      evidence.availability,
    );
    return {
      caseId: testCase.caseId,
      category: testCase.category,
      source: testCase.source,
      expected,
      rationale: testCase.rationale,
      entityId: result.decisions[0]?.runtimeEntity.entityId ?? null,
      actualStates: result.decisions.map(
        (item) => item.decision.knowledgeState,
      ),
      action: allowed ? "ALLOW_FOLD" : "BLOCK_FOLD",
      reasonCodes: unique(
        result.decisions.flatMap((item) => item.decision.reasonCodes),
      ),
      correct:
        expected === "FOLD"
          ? allowed
          : !allowed,
    };
  });

  return {
    caseCount: results.length,
    evidenceAvailability: evidence.availability,
    results,
    metrics: evaluateMethods(
      results.map((result) => ({
        expected: result.expected,
        actualAction: result.action,
        entityId: result.entityId,
        knowledgeState:
          result.actualStates.length === 1 ? result.actualStates[0] : "MIXED",
      })),
      legacy,
    ),
  };
};

export const runCorpusBenchmark = async ({
  corpusPath,
  corpusLimit,
  perEntityCap = null,
  independentCheck = false,
  legacy,
  targetRuntimeIds = DEFAULT_TARGET_RUNTIME_IDS,
  evaluatorRuntimeId = RUNTIME_IDS.LANGUAGE,
  wechatReportPath = null,
  sourceRoot = null,
}) => {
  if (!existsSync(corpusPath)) {
    throw new Error(`Corpus file does not exist: ${corpusPath}`);
  }

  const stratified =
    Number.isFinite(perEntityCap) && perEntityCap > 0;
  const rawRecords = await readDeduplicatedCorpusRecords(
    corpusPath,
    corpusLimit,
    { perEntityCap },
  );
  const mappedRecords = rawRecords
    .slice(0, stratified ? rawRecords.length : corpusLimit)
    .map((record) => ({
      ...record,
      generatedSource: sourceForRecord(record),
    }));
  const records = mappedRecords.filter(
    (record) => record.generatedSource !== null,
  );
  // 不能构成独立表达式的记录（保留字实体、未知 transformationKind）不进入
  // 评测。此前它们只体现为「语料 1248 实体 vs 基准 1246 实体」的差值，
  // 论文里无法解释；这里把被排除的实体与记录显式列出来。
  const excludedRecords = mappedRecords.filter(
    (record) => record.generatedSource === null,
  );
  // ---- 文件级分析（迭代 2.5）----
  //
  // 记录重建出来的表达式（`cloud.init();` 这种）没有 define/require 上下文，
  // bundle 模块表解析看不到任何东西。传入 sourceRoot 后改为分析原始
  // app-service.js，再按 programPointId 把判定回填到记录上；同一文件只分析一次。
  // 必须显式传 --source-root 才启用：语料记录里虽然带 sourceRoot 字段，
  // 但那个目录一旦不存在，静默退化成"所有记录都匹配不到判定"会污染基准结果。
  const effectiveSourceRoot = sourceRoot ?? null;
  const analyzedFiles = new Set();
  const readRecordSource = (record) => {
    if (!effectiveSourceRoot) return null;
    const absolutePath = path.join(effectiveSourceRoot, record.file);
    return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
  };

  const analyzeRecords = (recordList, evidenceRecords) => {
    const decisionsBySampleId = new Map();
    if (!effectiveSourceRoot) {
      for (const record of recordList) {
        const result = analyzeAndDecide({
          source: record.generatedSource,
          filePath: record.file,
          targetRuntimeIds,
          targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
          evaluatorRuntimeId,
          policyVersion: "benchmark-policy-v1",
          contractVersion: "benchmark-v1",
          evidenceRecords,
        });
        decisionsBySampleId.set(record.sampleId, result.decisions[0] ?? null);
      }
      return decisionsBySampleId;
    }

    const byFile = new Map();
    for (const record of recordList) {
      const bucket = byFile.get(record.file) ?? [];
      bucket.push(record);
      byFile.set(record.file, bucket);
    }
    for (const [file, bucket] of byFile.entries()) {
      // 只有含 module_import 记录的文件才需要文件级分析——它们是 bundle 模块表
      // 解析的唯一受益者。其余文件走表达式模式，避免给 1000+ 个大文件建 AST
      // （实测把 1046 个文件的 analysis 全缓存下来会吃掉 4.7 GB 内存）。
      const needsFileAnalysis = bucket.some(
        (record) => record.bindingKind === "module_import",
      );
      if (!needsFileAnalysis) {
        for (const record of bucket) {
          const result = analyzeAndDecide({
            source: record.generatedSource,
            filePath: record.file,
            targetRuntimeIds,
            targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
            evaluatorRuntimeId,
            policyVersion: "benchmark-policy-v1",
            contractVersion: "benchmark-v1",
            evidenceRecords,
          });
          decisionsBySampleId.set(record.sampleId, result.decisions[0] ?? null);
        }
        continue;
      }
      const source = readRecordSource(bucket[0]);
      if (source === null) {
        for (const record of bucket) {
          decisionsBySampleId.set(record.sampleId, null);
        }
        continue;
      }
      const analysis = analyzeSource({ source, filePath: file });
      analyzedFiles.add(file);
      const result = analyzeAndDecide({
        source,
        filePath: file,
        precomputedAnalysis: analysis,
        targetRuntimeIds,
        targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
        evaluatorRuntimeId,
        policyVersion: "benchmark-policy-v1",
        contractVersion: "benchmark-v1",
        evidenceRecords,
      });
      const byPointId = new Map();
      const byEntity = new Map();
      const byEntityIdOnly = new Map();
      const byLocation = new Map();
      for (const decision of result.decisions) {
        if (!byPointId.has(decision.programPointId)) {
          byPointId.set(decision.programPointId, decision);
        }
        const entityKey = `${decision.runtimeEntity.entityId}\u0000${decision.query.transformationKind}`;
        if (!byEntity.has(entityKey)) {
          byEntity.set(entityKey, decision);
        }
        if (!byEntityIdOnly.has(decision.runtimeEntity.entityId)) {
          byEntityIdOnly.set(decision.runtimeEntity.entityId, decision);
        }
        // 语料记录和重新分析共用同一份源码，行列号是最稳的关联键：
        // bundle 解析会改变 entityId 与 programPointId，但不会改变位置。
        const start = decision.programPoint?.start;
        if (start) {
          const locationKey = `${start.line}:${start.column}`;
          if (!byLocation.has(locationKey)) {
            byLocation.set(locationKey, decision);
          }
        }
      }
      for (const record of bucket) {
        const direct = byPointId.get(record.programPointId);
        const fallback = byEntity.get(
          `${record.entityId}\u0000${record.transformationKind}`,
        );
        const looser = byEntityIdOnly.get(record.entityId);
        const recordStart = record.programPoint?.start;
        const byPosition = recordStart
          ? byLocation.get(`${recordStart.line}:${recordStart.column}`)
          : undefined;
        decisionsBySampleId.set(
          record.sampleId,
          direct ?? byPosition ?? fallback ?? looser ?? null,
        );
      }
    }
    return decisionsBySampleId;
  };

  const initialDecisions = analyzeRecords(records, []);
  const allPlans = records
    .map((record) => initialDecisions.get(record.sampleId))
    .filter(Boolean);
  const evidence = await buildRuntimeEvidence(
    allPlans,
    targetRuntimeIds,
    "benchmark-policy-v1",
    wechatReportPath,
  );
  const startedAt = performance.now();
  const finalDecisions = analyzeRecords(records, evidence.records);
  // 文件级分析下，部分记录在重新分析后不再产生对应 finding——例如 bundle 导出
  // 被判定为纯语言（finding 消失），或实体路径改成宿主根。这些不能当成 UNKNOWN
  // 计入结果，否则会虚高未决率；显式排除并单独计数。
  const matchedRecords = records.filter((record) =>
    Boolean(finalDecisions.get(record.sampleId)),
  );
  const unmatchedDecisionCount = records.length - matchedRecords.length;
  const results = matchedRecords.map((record) => {
    const decision = finalDecisions.get(record.sampleId);
    const expected = expectedStateFromEvidence(decision, evidence.records);
    const actualState = decision?.decision.knowledgeState ?? "UNKNOWN";
    const actualAction =
      decision?.decision.enforcementAction ?? "BLOCK_FOLD";

    return {
      sampleId: record.sampleId,
      project: record.project,
      file: record.file,
      entityId: record.entityId,
      transformationKind: record.transformationKind,
      bindingKind: record.bindingKind,
      resolutionStatus: record.resolutionStatus,
      generatedSource: record.generatedSource,
      expected,
      actualState,
      actualAction,
      uncertaintySource: decision?.decision.uncertaintySource ?? null,
      targetRuntimeStatus:
        decision?.query.targetRuntimeStatus ?? "unknown",
      reasonCodes: decision?.decision.reasonCodes ?? [],
    };
  });
  const elapsedMs = performance.now() - startedAt;
  const methodResults = results.map((result) => ({
    expected: result.expected,
    actualAction: result.actualAction,
    entityId: result.entityId,
    knowledgeState: result.actualState,
  }));
  const groundTruth = independentCheck
    ? await collectGroundTruth({
        entityIds: [...new Set(results.map((result) => result.entityId))],
        wechatReportPath,
      })
    : null;
  const methodActual = evaluateMethods(
    methodResults,
    legacy,
    groundTruth?.divergent ?? null,
  );
  methodActual["R97-full"].elapsedMs = elapsedMs;
  methodActual["R97-full"].decisionsPerSecond =
    elapsedMs === 0 ? null : (results.length * 1000) / elapsedMs;

  const independentReference = groundTruth
    ? summarizeIndependentReference(results, groundTruth, targetRuntimeIds)
    : null;

  return {
    // 逐条结果供审计与人工标注使用；写报告时会从汇总 JSON 里剥离，单独落成
    // benchmark-results.jsonl，避免 benchmark-summary.json 体积膨胀。
    results,
    corpusPath,
    sampling: stratified
      ? { mode: "per-entity-cap", perEntityCap }
      : { mode: "record-reservoir", corpusLimit },
    rawRecordCount: rawRecords.length,
    deduplicatedCount: records.length,
    sampleCount: results.length,
    entityView: summarizeEntityView(results),
    excludedFromEvaluation: {
      recordCount: excludedRecords.length,
      entityIds: [
        ...new Set(excludedRecords.map((record) => record.entityId)),
      ].sort(),
      examples: excludedRecords.slice(0, 10).map((record) => ({
        entityId: record.entityId,
        transformationKind: record.transformationKind,
        bindingKind: record.bindingKind,
      })),
    },
    fileLevelAnalysis: {
      enabled: Boolean(effectiveSourceRoot),
      sourceRoot: effectiveSourceRoot,
      filesAnalyzed: analyzedFiles.size,
      unmatchedDecisionCount,
    },
    independentReference,
    evidenceAvailability: evidence.availability,
    runtimeEvidence: evidence.runtimeEvidence,
    byExpected: countBy(results, (result) => result.expected),
    byActual: countBy(results, (result) => result.actualState),
    byTransformation: countBy(
      results,
      (result) => result.transformationKind,
    ),
    byReasonCode: countReasons(results),
    byUncertaintySource: countUncertaintySources(results),
    byTargetRuntimeStatus: countBy(
      results,
      (result) => result.targetRuntimeStatus,
    ),
    targetRuntimeImpact: summarizeTargetRuntimeImpact(results),
    examples: selectExamples(results),
    metrics: methodActual,
    // Fold Rate 的点估计在高度聚类的样本上不足以支撑结论，附带按 project
    // 重抽的 95% 区间（见 bootstrapFoldRateCi 的说明）。
    foldRateConfidence: bootstrapFoldRateCi(results),
  };
};

/**
 * Fold Rate 的 cluster bootstrap 置信区间。
 *
 * 样本高度聚类：同一个 project 里有成百上千个程序点，同一个 entityId 可以出现
 * 几万次（`Object.defineProperty` 217346 次）。把 3895 条记录当 IID 直接套
 * Wilson 区间会严重低估不确定性——同一份代码里的折叠点远不是独立样本。
 *
 * 这里按 **project** 做有放回重抽（cluster bootstrap）：抽上层单元、保留簇内
 * 全部记录，因此簇内相关性被正确带进区间。报告的是 Fold Rate 即
 * `ALLOW_FOLD / TOTAL` 的 2.5%–97.5% 分位。
 */
const bootstrapFoldRateCi = (
  results,
  { iterations = 2000, seed = 970917 } = {},
) => {
  const clustersByProject = new Map();
  for (const result of results) {
    const key = result.project ?? "<unknown>";
    const bucket = clustersByProject.get(key) ?? [];
    bucket.push(result);
    clustersByProject.set(key, bucket);
  }
  const clusters = [...clustersByProject.values()];
  if (clusters.length < 2 || results.length === 0) {
    return null;
  }

  const random = createSeededRandom(seed);
  const rates = [];
  for (let round = 0; round < iterations; round += 1) {
    let allowed = 0;
    let total = 0;
    for (let pick = 0; pick < clusters.length; pick += 1) {
      const cluster = clusters[Math.floor(random() * clusters.length)];
      for (const item of cluster) {
        total += 1;
        if (item.actualAction === "ALLOW_FOLD") {
          allowed += 1;
        }
      }
    }
    rates.push(allowed / total);
  }
  rates.sort((left, right) => left - right);

  const point = results.filter(
    (result) => result.actualAction === "ALLOW_FOLD",
  ).length / results.length;
  return {
    point,
    lower: rates[Math.floor(iterations * 0.025)],
    upper: rates[Math.floor(iterations * 0.975)],
    iterations,
    clusterKey: "project",
    clusterCount: clusters.length,
  };
};

/**
 * 把 R97 的放行结论挂到实测差分上。
 *
 * oracle 一致率来自 `expectedStateFromEvidence`，那是 R97 自己的规则，
 * 没有独立信息量。这里改用真实 Node 与真实 Edge 对同一实体路径的直接读取
 * 结果作为真值，回答「放行的折叠里有多少在实测上跨宿主并不一致」。
 */
const summarizeIndependentReference = (
  results,
  groundTruth,
  targetRuntimeIds,
) => {
  const divergent = groundTruth.divergent;
  // 判卷标准 = 用同一份判卷探针观测到的宿主。语言基线是求值参照，不是宿主。
  const oracleRuntimeIds = groundTruth.provenance.runtimes
    .filter((runtime) => runtime.isHost !== false)
    .map((runtime) => runtime.runtimeId);
  const entityIds = [...new Set(results.map((result) => result.entityId))];
  const differentialEntities = entityIds.filter(
    (entityId) => divergent[entityId],
  );
  const differentialRecords = results.filter(
    (result) => divergent[result.entityId],
  );
  const allowedFolds = results.filter(
    (result) => result.actualAction === "ALLOW_FOLD",
  );
  const allowedOnDifferential = allowedFolds.filter(
    (result) => divergent[result.entityId],
  );
  const differentialRoots = countByRoot(differentialEntities);
  // 差分真值来自若干宿主。只有当这些宿主都在本次声明的目标集里，测到的差异
  // 才构成「不安全折叠」；否则它只是信息性信号（例如声明目标是 Node，Edge 上
  // 不允许 SharedArrayBuffer 与该目标无关）。
  const oracleInScope = oracleRuntimeIds.every((runtimeId) =>
    targetRuntimeIds.includes(runtimeId),
  );
  return {
    description: `判卷探针 r97-oracle-probe 在 ${oracleRuntimeIds.join(" / ")} 上的直接读取`,
    oracleRuntimeIds,
    oracleInScope,
    targetRuntimeIds: [...targetRuntimeIds],
    provenance: groundTruth.provenance,
    excluded: groundTruth.excluded,
    entityCount: entityIds.length,
    differentialEntityCount: differentialEntities.length,
    differentialRecordCount: differentialRecords.length,
    differentialEntities: differentialEntities.slice(0, 20),
    differentialRoots: Object.fromEntries(
      Object.entries(differentialRoots).sort(
        (left, right) => right[1] - left[1],
      ),
    ),
    allowedFold: allowedFolds.length,
    allowedFoldOnDifferentialEntity: allowedOnDifferential.length,
    allowedFoldOnDifferentialExamples: [
      ...new Set(allowedOnDifferential.map((result) => result.entityId)),
    ].slice(0, 20),
  };
};

/**
 * 按根节点统计实体数量。
 *
 * 必须用无原型对象：根节点可能是 `constructor`、`toString`、`__proto__`
 * 这类名字，普通 `{}` 会把继承来的同名属性当成已有计数，`+ 1` 立刻退化成
 * 字符串拼接，把统计表污染成 `function Object() { [native code] }1`。
 */
export const countByRoot = (entityIds) => {
  const counts = Object.create(null);
  for (const entityId of entityIds) {
    const root = String(entityId).split(".")[0];
    counts[root] = (Object.hasOwn(counts, root) ? counts[root] : 0) + 1;
  }
  return counts;
};

const countUncertaintySources = (results) => {
  const counts = { binding: 0, runtime: 0, behavior: 0 };
  for (const result of results) {
    if (result.uncertaintySource && counts[result.uncertaintySource] !== undefined) {
      counts[result.uncertaintySource] += 1;
    }
  }
  return counts;
};

/**
 * 实体口径汇总：同一个 entityId 的所有抽样点合并成一个判定。
 *
 * 只要该实体在任一被抽到的用法上不是 FOLD，就不算「可折叠实体」。
 * 这个口径回答「1250 个不同运行时实体里有多少能被安全判定」，与按出现
 * 频率加权的记录口径回答的是不同问题，两者必须并列报告。
 */
const summarizeEntityView = (results) => {
  const byEntity = new Map();
  for (const result of results) {
    const entry = byEntity.get(result.entityId) ?? {
      total: 0,
      fold: 0,
      protect: 0,
      unknown: 0,
      unsafeFold: 0,
    };
    entry.total += 1;
    if (result.actualState === KNOWLEDGE_STATE.FOLD) {
      entry.fold += 1;
    } else if (result.actualState === KNOWLEDGE_STATE.PROTECT) {
      entry.protect += 1;
    } else {
      entry.unknown += 1;
    }
    if (
      result.actualAction === "ALLOW_FOLD" &&
      result.expected !== KNOWLEDGE_STATE.FOLD
    ) {
      entry.unsafeFold += 1;
    }
    byEntity.set(result.entityId, entry);
  }

  const counts = {
    total: byEntity.size,
    fold: 0,
    protect: 0,
    unknown: 0,
    entitiesWithUnsafeFold: 0,
  };
  for (const entry of byEntity.values()) {
    if (entry.protect > 0) {
      counts.protect += 1;
    } else if (entry.unknown > 0) {
      counts.unknown += 1;
    } else {
      counts.fold += 1;
    }
    if (entry.unsafeFold > 0) {
      counts.entitiesWithUnsafeFold += 1;
    }
  }

  return {
    ...counts,
    foldRate: ratio(counts.fold, counts.total),
    protectRate: ratio(counts.protect, counts.total),
    unknownRate: ratio(counts.unknown, counts.total),
    // 真正已经有足够信息判定的比例：FOLD + PROTECT。总放行率低可能只是
    // UNKNOWN 多，而不是策略保守——这两个数必须一起看。
    decidableRate: ratio(counts.total - counts.unknown, counts.total),
  };
};

const analyzeCase = (
  testCase,
  evidenceRecords = [],
  defaultTargetRuntimeIds = DEFAULT_TARGET_RUNTIME_IDS,
) =>
  analyzeAndDecide({
    source: testCase.source,
    filePath: `${testCase.caseId}.js`,
    targetRuntimeIds:
      testCase.targetRuntimeIds ?? defaultTargetRuntimeIds,
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId:
      testCase.evaluatorRuntimeId ?? RUNTIME_IDS.LANGUAGE,
    policyVersion: "benchmark-policy-v1",
    contractVersion: "benchmark-v1",
    evidenceRecords,
  });

export const buildRuntimeEvidence = async (
  plans,
  targetRuntimeIds = DEFAULT_TARGET_RUNTIME_IDS,
  policyVersion = "benchmark-policy-v1",
  wechatReportPath = null,
) => {
  const entityDimensions = Object.fromEntries(
    plans.map((plan) => [
      plan.runtimeEntity.entityId,
      [
        "existence",
        "type",
        "callability",
      ],
    ]),
  );
  if (Object.keys(entityDimensions).length === 0) {
    return {
      records: [],
      availability: {
        language: true,
        node: true,
        wechat: false,
        browser: false,
      },
      runtimeEvidence: {
        browser: null,
      },
    };
  }

  const observedAt = new Date().toISOString();
  const language = collectLanguageObservations({
    entityDimensions,
    observedAt,
  });
  const node = collectNodeObservations({
    entityDimensions,
    observedAt,
  });
  const runtimeCollections = {
    [RUNTIME_IDS.LANGUAGE]: language,
    [RUNTIME_IDS.NODE]: node,
  };
  let wechat = null;
  let wechatReport = null;
  if (targetRuntimeIds.includes(RUNTIME_IDS.WECHAT)) {
    if (!wechatReportPath) {
      throw new Error(
        "The WeChat target runtime requires --wechat-report with a real DevTools probe report",
      );
    }
    if (!existsSync(wechatReportPath)) {
      throw new Error(`WeChat probe report does not exist: ${wechatReportPath}`);
    }
    try {
      wechatReport = JSON.parse(readFileSync(wechatReportPath, "utf8"));
    } catch (error) {
      throw new Error(
        `Invalid WeChat probe report ${wechatReportPath}: ${error.message}`,
      );
    }
    wechat = importWechatProbeResult({
      report: wechatReport,
      entityDimensions,
      observedAt,
    });
    runtimeCollections[RUNTIME_IDS.WECHAT] = wechat;
  }
  let browser = null;
  if (targetRuntimeIds.includes(RUNTIME_IDS.EDGE)) {
    browser = await collectBrowserObservations({
      entityDimensions,
      observedAt,
    });
    runtimeCollections[RUNTIME_IDS.EDGE] = browser;
  }
  const records = buildEvidenceRecords({
    decisionPlans: plans,
    runtimeCollections,
    policyVersion,
    validFrom: observedAt,
    validUntil: addDays(observedAt, 30),
  });

  return {
    records,
    availability: {
      language: true,
      node: true,
      wechat: wechat !== null,
      browser: browser !== null,
    },
    runtimeEvidence: {
      wechat: wechat
        ? {
            runtimeId: wechat.runtimeId,
            observedEntityCount: Object.keys(wechat.observations).length,
            sdkVersion: wechatReport?.sdkVersion ?? null,
          }
        : null,
      browser: browser
        ? {
            runtimeId: browser.runtimeId,
            observedEntityCount: Object.keys(browser.observations).length,
            browserVersion: browser.browserVersion,
          }
        : null,
    },
  };
};

const expectedStateFromEvidence = (plan, evidenceRecords) => {
  if (!plan) {
    return KNOWLEDGE_STATE.UNKNOWN;
  }
  if (
    plan.bindingRef.resolutionStatus !== "resolved" ||
    plan.query.targetRuntimeSource === TARGET_RUNTIME_SOURCE.INFERRED
  ) {
    return KNOWLEDGE_STATE.UNKNOWN;
  }
  const requiredRuntimeIds =
    plan.semanticContract.validityScope?.requiredRuntimeIds ?? [];
  if (
    requiredRuntimeIds.some(
      (runtimeId) => !plan.query.targetRuntimeIds.includes(runtimeId),
    )
  ) {
    return KNOWLEDGE_STATE.PROTECT;
  }

  const runtimeIds = [
    plan.query.evaluatorRuntimeId,
    ...plan.query.targetRuntimeIds,
  ];
  const observationsByRuntime = new Map();
  for (const runtimeId of unique(runtimeIds)) {
    const records = evidenceRecords.filter(
      (record) =>
        record.entityId === plan.runtimeEntity.entityId &&
        record.usageContextId === plan.usageContext.usageContextId &&
        record.semanticContractId === plan.semanticContract.contractId &&
        record.evaluatorRuntimeId === plan.query.evaluatorRuntimeId &&
        record.policyVersion === plan.query.policyVersion &&
        Object.hasOwn(record.observations, runtimeId),
    );
    const complete = records.filter((record) =>
      hasRequiredDimensions(
        record.observations[runtimeId],
        plan.semanticContract.requiredDimensions,
      ),
    );
    if (complete.length === 0) {
      return KNOWLEDGE_STATE.UNKNOWN;
    }
    const reference = complete[0].observations[runtimeId];
    const conflict = complete.some(
      (record) =>
        !semanticValuesEqual(
          reference,
          record.observations[runtimeId],
          plan.semanticContract.requiredDimensions,
        ),
    );
    if (conflict) {
      return KNOWLEDGE_STATE.UNKNOWN;
    }
    if (hasForbiddenSideEffect(complete.map((record) => record.observations[runtimeId]))) {
      return KNOWLEDGE_STATE.PROTECT;
    }
    observationsByRuntime.set(runtimeId, reference);
  }

  const evaluator = observationsByRuntime.get(plan.query.evaluatorRuntimeId);
  if (!evaluator) {
    return KNOWLEDGE_STATE.UNKNOWN;
  }
  for (const runtimeId of plan.query.targetRuntimeIds) {
    const target = observationsByRuntime.get(runtimeId);
    if (
      !target ||
      !semanticValuesEqual(
        evaluator,
        target,
        plan.semanticContract.requiredDimensions,
      )
    ) {
      return KNOWLEDGE_STATE.PROTECT;
    }
  }
  return KNOWLEDGE_STATE.FOLD;
};

const hasRequiredDimensions = (observation, requiredDimensions) =>
  Array.isArray(observation?.observedDimensions) &&
  requiredDimensions.every(
    (dimension) =>
      observation.observedDimensions.includes(dimension) &&
      Object.hasOwn(observation.values, dimension),
  );

const semanticValuesEqual = (left, right, dimensions) =>
  dimensions.every((dimension) =>
    JSON.stringify(left.values[dimension]) ===
    JSON.stringify(right.values[dimension]),
  );

const hasForbiddenSideEffect = (observations) =>
  observations.some((observation) =>
    (observation.sideEffects ?? []).some((sideEffect) =>
      [
        "network",
        "storage_write",
        "payment",
        "native_bridge",
        "visible_ui",
      ].includes(sideEffect),
    ),
  );

const evaluateMethods = (results, legacy, groundTruth = null) => {
  const methods = {
    "A0-aggressive-fold": [],
    "A1-legacy-blacklist": [],
    "A2-prefix-blacklist": [],
    "A-safe-all-protect": [],
    "R97-full": [],
  };

  for (const result of results) {
    const root = result.entityId?.split(".")[0] ?? "";
    methods["A0-aggressive-fold"].push({
      ...result,
      actualAction: "ALLOW_FOLD",
      knowledgeState: KNOWLEDGE_STATE.FOLD,
    });
    methods["A1-legacy-blacklist"].push({
      ...result,
      actualAction: legacy.symbols.has(root)
        ? "BLOCK_FOLD"
        : "ALLOW_FOLD",
      knowledgeState: legacy.symbols.has(root)
        ? KNOWLEDGE_STATE.PROTECT
        : KNOWLEDGE_STATE.FOLD,
    });
    methods["A2-prefix-blacklist"].push({
      ...result,
      actualAction: matchesPrefix(root, DEFAULT_PREFIXES)
        ? "BLOCK_FOLD"
        : "ALLOW_FOLD",
      knowledgeState: matchesPrefix(root, DEFAULT_PREFIXES)
        ? KNOWLEDGE_STATE.PROTECT
        : KNOWLEDGE_STATE.FOLD,
    });
    methods["A-safe-all-protect"].push({
      ...result,
      actualAction: "BLOCK_FOLD",
      knowledgeState: KNOWLEDGE_STATE.PROTECT,
    });
    methods["R97-full"].push(result);
  }

  return Object.fromEntries(
    Object.entries(methods).map(([name, methodResults]) => [
      name,
      summarizeMethod(methodResults, groundTruth),
    ]),
  );
};

const summarizeMethod = (results, groundTruth = null) => {
  const counts = {
    total: results.length,
    allowedFold: 0,
    blockedFold: 0,
    unsafeFold: 0,
    unsafeFoldMeasured: 0,
    usefulFold: 0,
    overProtection: 0,
    unknown: 0,
    correctState: 0,
  };

  for (const result of results) {
    if (result.actualAction === "ALLOW_FOLD") {
      counts.allowedFold += 1;
    } else {
      counts.blockedFold += 1;
    }
    if (
      result.expected !== KNOWLEDGE_STATE.FOLD &&
      result.actualAction === "ALLOW_FOLD"
    ) {
      counts.unsafeFold += 1;
    }
    if (
      groundTruth &&
      groundTruth[result.entityId] === true &&
      result.actualAction === "ALLOW_FOLD"
    ) {
      counts.unsafeFoldMeasured += 1;
    }
    if (
      result.expected === KNOWLEDGE_STATE.FOLD &&
      result.actualAction === "ALLOW_FOLD"
    ) {
      counts.usefulFold += 1;
    }
    if (
      result.expected === KNOWLEDGE_STATE.FOLD &&
      result.actualAction === "BLOCK_FOLD"
    ) {
      counts.overProtection += 1;
    }
    if (result.knowledgeState === KNOWLEDGE_STATE.UNKNOWN) {
      counts.unknown += 1;
    }
    if (result.knowledgeState === result.expected) {
      counts.correctState += 1;
    }
  }

  const expectedFold = results.filter(
    (result) => result.expected === KNOWLEDGE_STATE.FOLD,
  ).length;
  const expectedNonFold = results.length - expectedFold;
  return {
    ...counts,
    foldRate: ratio(counts.allowedFold, counts.total),
    unknownRate: ratio(counts.unknown, counts.total),
    // FOLD + PROTECT = TOTAL − UNKNOWN：系统真正有足够信息判定的比例。
    // 它比 foldRate 更能说明「低放行率是策略保守还是证据不足」。
    decidableRate: ratio(counts.total - counts.unknown, counts.total),
    unsafeFoldMeasuredRate: ratio(
      counts.unsafeFoldMeasured,
      counts.allowedFold,
    ),
    exactStateAccuracy: ratio(counts.correctState, counts.total),
    safeFoldCoverage: ratio(counts.usefulFold, expectedFold),
    overProtectionRate: ratio(counts.overProtection, expectedFold),
    unsafeFoldRate: ratio(counts.unsafeFold, expectedNonFold),
    blockedNonFoldRate: ratio(
      expectedNonFold - counts.unsafeFold,
      expectedNonFold,
    ),
  };
};

export const sourceForRecord = (record) => {
  const entity = record.entityId;
  if (typeof entity !== "string" || entity.trim() === "") {
    return null;
  }
  const builtinImport = getBuiltinImport(entity);
  const expression = toJavaScriptExpression(
    builtinImport?.rewrittenEntityId ?? entity,
  );
  if (expression === null) {
    return null;
  }
  let statement;
  switch (record.transformationKind) {
    case TRANSFORMATION_KIND.CONST_EVAL:
      statement = record.usageContext?.accessMode === "typeof"
        ? `typeof ${expression};`
        : `${expression};`;
      break;
    case TRANSFORMATION_KIND.BRANCH_PRUNE:
      statement = `if (${expression}) {}`;
      break;
    case TRANSFORMATION_KIND.CALL_EVAL:
      statement = `${expression}();`;
      break;
    case TRANSFORMATION_KIND.DEAD_CODE_DELETE:
      statement = `${expression};`;
      break;
    default:
      return null;
  }
  return builtinImport
    ? `import * as ${builtinImport.alias} from ${JSON.stringify(builtinImport.request)};\n${statement}`
    : statement;
};

const getBuiltinImport = (entityId) => {
  const root = entityId.split(".")[0];
  if (!isNodeBuiltinRoot(root)) {
    return null;
  }
  const request = nodeBuiltinRequestFromRoot(root);
  const alias = root
    .slice("node:".length)
    .replaceAll(/[^A-Za-z0-9_$]/gu, "_");
  if (!request || !alias) {
    return null;
  }
  return {
    alias,
    request,
    rewrittenEntityId: entityId.replace(root, alias),
  };
};

export const toJavaScriptExpression = (entityId) => {
  const parts = entityId.split(".");
  if (
    parts.length === 0 ||
    !parts.every((part) => part !== "" && !part.includes("<")) ||
    RESERVED_IDENTIFIERS.has(parts[0])
  ) {
    return null;
  }
  let expression = parts[0];
  for (const part of parts.slice(1)) {
    expression += /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)
      ? `.${part}`
      : `[${JSON.stringify(part)}]`;
  }
  return expression;
};

export const readJsonLines = (filePath) =>
  readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSONL at ${filePath}:${index + 1}: ${error.message}`,
        );
      }
    });

export const corpusRecordKey = (record) =>
  [
    record.project ?? "",
    record.file ?? "",
    record.programPointId ?? "",
    record.entityId,
    record.transformationKind,
    record.usageContext?.usageContextId ?? "-",
  ].join("|");

/**
 * 全语料确定性抽样。两种口径互斥：
 *
 * 语料按项目、文件顺序写入，只取文件头部会让评测集中在少数几个文件上。
 * 之前的「顺序去重 + 截断」既不抽样、又按表达式形状去重，把 120 万条发现
 * 压成两千余条，报出来的比例不代表语料。
 *
 * - 只给 limit：全语料均匀蓄水池，得到「按记录加权」的样本。长尾语料下
 *   高频实体会主导样本，稀有宿主实体几乎不会出现。
 * - 给 perEntityCap：每个 entityId 一个独立蓄水池，得到「按实体分层」的样本。
 *   低实体不会被高频实体挤掉，样本量上界是 实体数 × perEntityCap。
 *   此时 limit 不参与抽样，样本量由实体数与 cap 决定。
 *
 * 两种口径回答不同问题，不能互相替代，报告里必须分开写。
 */
const CORPUS_SAMPLE_SEED = 0x5eed97;

const createSeededRandom = (seed) => {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= (state << 13) & 0xffffffff;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= (state << 5) & 0xffffffff;
    state >>>= 0;
    return state / 0x100000000;
  };
};

export const readDeduplicatedCorpusRecords = async (
  filePath,
  limit = Number.POSITIVE_INFINITY,
  { perEntityCap = null } = {},
) => {
  const stratified = Number.isFinite(perEntityCap) && perEntityCap > 0;
  const bounded = !stratified && Number.isFinite(limit) && limit >= 0;
  const records = [];
  const seen = new Set();
  const random = createSeededRandom(CORPUS_SAMPLE_SEED);
  let accepted = 0;
  const buckets = stratified ? new Map() : null;
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (line.trim() === "") {
        continue;
      }
      let record;
      try {
        record = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSONL at ${filePath}:${lineNumber}: ${error.message}`,
        );
      }
      const key = corpusRecordKey(record);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (stratified) {
        const entityKey = record.entityId ?? "";
        const bucket = buckets.get(entityKey) ?? { records: [], accepted: 0 };
        bucket.accepted += 1;
        if (bucket.records.length < perEntityCap) {
          bucket.records.push(record);
        } else {
          const slot = Math.floor(random() * bucket.accepted);
          if (slot < perEntityCap) {
            bucket.records[slot] = record;
          }
        }
        buckets.set(entityKey, bucket);
        continue;
      }
      if (!bounded) {
        records.push(record);
        continue;
      }
      accepted += 1;
      if (records.length < limit) {
        records.push(record);
        continue;
      }
      if (limit === 0) {
        continue;
      }
      const slot = Math.floor(random() * accepted);
      if (slot < limit) {
        records[slot] = record;
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  if (stratified) {
    for (const bucket of buckets.values()) {
      records.push(...bucket.records);
    }
  }
  return records;
};

export const deduplicateCorpusRecords = (records) => {
  const seen = new Set();
  return records.filter((record) => {
    const key = corpusRecordKey(record);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const selectExamples = (results) => {
  const selected = [];
  for (const expected of ["FOLD", "PROTECT", "UNKNOWN"]) {
    selected.push(
      ...results
        .filter((result) => result.expected === expected)
        .slice(0, 10),
    );
  }
  return selected;
};

const countBy = (items, selector) =>
  items.reduce((counts, item) => {
    const key = selector(item) ?? "<unknown>";
    counts[key] = (Object.hasOwn(counts, key) ? counts[key] : 0) + 1;
    return counts;
  }, {});

const countReasons = (results) =>
  results.reduce((counts, result) => {
    for (const reasonCode of result.reasonCodes) {
      counts[reasonCode] =
        (Object.hasOwn(counts, reasonCode) ? counts[reasonCode] : 0) + 1;
    }
    return counts;
  }, {});

const summarizeTargetRuntimeImpact = (results) => {
  const groups = new Map();
  for (const result of results) {
    const status = result.targetRuntimeStatus ?? "<unknown>";
    const group = groups.get(status) ?? [];
    group.push(result);
    groups.set(status, group);
  }

  return Object.fromEntries(
    [...groups.entries()].map(([status, group]) => {
      const expectedFold = group.filter(
        (result) => result.expected === KNOWLEDGE_STATE.FOLD,
      ).length;
      return [
        status,
        {
          sampleCount: group.length,
          unsafeFold: group.filter(
            (result) =>
              result.expected !== KNOWLEDGE_STATE.FOLD &&
              result.actualAction === "ALLOW_FOLD",
          ).length,
          overProtection: group.filter(
            (result) =>
              result.expected === KNOWLEDGE_STATE.FOLD &&
              result.actualAction === "BLOCK_FOLD",
          ).length,
          overProtectionRate: ratio(
            group.filter(
              (result) =>
                result.expected === KNOWLEDGE_STATE.FOLD &&
                result.actualAction === "BLOCK_FOLD",
            ).length,
            expectedFold,
          ),
          blockedForUnconfirmedTarget: group.filter((result) =>
            result.reasonCodes.some(
              (reasonCode) =>
                reasonCode === REASON_CODE.TARGET_RUNTIME_UNCONFIRMED ||
                reasonCode === REASON_CODE.TARGET_RUNTIME_INFERRED,
            ),
          ).length,
        },
      ];
    }),
  );
};

const matchesPrefix = (root, prefixes) =>
  prefixes.some(
    (prefix) => root === prefix || root.startsWith(`${prefix}.`),
  );

const addDays = (isoDateTime, days) => {
  const date = new Date(isoDateTime);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const unique = (values) => [...new Set(values)];

const ratio = (numerator, denominator) =>
  denominator === 0 ? 0 : numerator / denominator;

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 基准评测摘要",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    "## 合成语义差异测试集",
    "",
    renderMetricsTable(summary.synthetic.metrics),
    "",
  ];
  if (summary.corpus) {
    lines.push(
      "## 真实小程序语料测试集",
      "",
      `样本数：${summary.corpus.sampleCount}`,
      "",
      `抽样口径：${renderSampling(summary.corpus.sampling)}`,
      "",
      renderMetricsTable(
        summary.corpus.metrics,
        summary.corpus.foldRateConfidence ?? null,
      ),
      "",
      "### 两个口径并列",
      "",
      "下表把同一批决策按两种方式汇总。两者回答不同问题，不能互相替代，也没有哪一个是「真值」。",
      "",
      renderEntityView(summary.corpus),
      "",
      "### 独立差分校验",
      "",
      renderIndependentReference(summary.corpus.independentReference),
      "",
      "### 预期状态分布",
      "",
      renderCountTable(summary.corpus.byExpected),
      "",
      "### 未决来源（UNKNOWN 按哪一层能消除它拆分）",
      "",
      renderCountTable(summary.corpus.byUncertaintySource ?? {}),
      "",
      "`binding` = 静态绑定没解析出来；`runtime` = 目标未确认或缺某个必需运行时的观测；`behavior` = 契约维度缺失或证据不可折叠。",
      "三者的强制动作完全相同（都是 BLOCK_FOLD），拆分只影响可解释性与改进优先级。",
      "",
    );
  } else {
    lines.push("## 真实小程序语料测试集", "", "未提供语料文件。", "");
  }
  return `${lines.join("\n")}\n`;
};

const renderSampling = (sampling) =>
  sampling?.mode === "per-entity-cap"
    ? `按实体分层，每个 entityId 最多保留 ${sampling.perEntityCap} 条`
    : `按记录在全语料均匀抽样，上限 ${sampling?.corpusLimit ?? "-"} 条`;

const renderEntityView = (corpus) => {
  const entity = corpus.entityView;
  const records = corpus.byActual;
  const totalRecords = corpus.sampleCount;
  const recordFold = records.FOLD ?? 0;
  const recordProtect = records.PROTECT ?? 0;
  const recordUnknown = records.UNKNOWN ?? 0;
  return [
    "| 口径 | 单位数 | FOLD | PROTECT | UNKNOWN | 放行率 |",
    "|---|---:|---:|---:|---:|---:|",
    `| 按记录加权（出现频率） | ${totalRecords} | ${recordFold} | ${recordProtect} | ${recordUnknown} | ${percent(ratio(recordFold, totalRecords))} |`,
    `| 按实体加权（每个 entityId 一个判定） | ${entity.total} | ${entity.fold} | ${entity.protect} | ${entity.unknown} | ${percent(entity.foldRate)} |`,
    "",
    "按记录加权回答「真实代码里按出现频率加权能放行多少折叠点」；",
    "按实体加权回答「语料里不同运行时实体有多少能被安全判定」，避免少数高频实体主导结论。",
    "实体口径下，只要该实体在任一被抽到的用法上不是 FOLD，就不计入可折叠实体。",
  ].join("\n");
};

const renderIndependentReference = (reference) => {
  if (!reference) {
    return "未运行。加上 `--independent-check` 会用真实 Node 与真实 Edge 直接读取同一实体路径，作为不依赖 R97 自身规则的实测真值。";
  }
  return [
    `参照：${reference.description}。`,
    reference.oracleInScope
      ? `Oracle 运行时 ${reference.oracleRuntimeIds.join(" + ")} 均在本次目标集内（${reference.targetRuntimeIds.join(", ")}），测到的差异构成不安全折叠。`
      : `注意：本次目标集是 ${reference.targetRuntimeIds.join(", ")}，不包含 oracle 运行时 ${reference.oracleRuntimeIds.join(" + ")}。下面的差异是信息性信号，不构成本次目标下的不安全折叠。`,
    "",
    "| 指标 | 数值 |",
    "|---|---:|",
    `| 参与校验的实体 | ${reference.entityCount} |`,
    `| 实测跨宿主不一致的实体 | ${reference.differentialEntityCount} |`,
    `| R97 放行的折叠点 | ${reference.allowedFold} |`,
    `| 其中落在实测不一致实体上的放行 | ${reference.allowedFoldOnDifferentialEntity} |`,
    "",
    reference.differentialRecordCount === 0
      ? "本样本里实测跨宿主不一致的记录数为 0，这次独立校验没有反例，不能据此声称安全。换用实体分层抽样（`--per-entity-cap`）才能把稀有宿主实体纳入样本。"
      : reference.allowedFoldOnDifferentialEntity === 0
        ? `本样本中有 ${reference.differentialRecordCount} 条实测跨宿主不一致记录，R97 一条都没有放行。`
        : `注意：以下实体在实测中跨宿主不一致，但被放行了：${reference.allowedFoldOnDifferentialExamples.join("、")}`,
    "",
    renderProvenance(reference.provenance),
    "",
    renderExclusions(reference.excluded),
  ].join("\n");
};

const renderProvenance = (provenance) => {
  if (!provenance) {
    return "";
  }
  const rows = [
    "**判卷探针与采集信息**",
    "",
    "| 运行时 | 探针实现 | 有观测的实体 | 采集时间 | 版本画像 |",
    "|---|---|---:|---|---|",
  ];
  for (const runtime of provenance.runtimes) {
    rows.push(
      `| ${runtime.runtimeId} | ${runtime.probeImplementation} | ${runtime.observedEntityCount} | ${runtime.collectedAt ?? "本次现场测量"} | ${runtime.versionProfile ?? "-"} |`,
    );
  }
  rows.push(
    "",
    "差异判定 = 所有已观测运行时的两两比较中至少一对不一致。语言基线是求值参照，",
    "它与任一宿主的差异同样计入——这正是「求值环境的结果迁移不过去」的定义。",
    "",
    "Node / Edge / 真实微信三边跑的是同一份判卷探针，因此差异可归因于环境；语言基线是求值参照，",
    "它跑在隔离 vm 里、用的是同一份判卷探针，是求值参照而不是宿主，因此不参与 `oracleInScope` 判定。",
    "微信是离线快照：判卷时读的是采集时刻的基础库状态，不是现场重测。",
  );
  return rows.join("\n");
};

const renderExclusions = (excluded) => {
  if (!excluded || excluded.length === 0) {
    return "";
  }
  const rows = [
    "**不参与判卷的根节点**",
    "",
    "| 根节点 | 涉及实体 | 原因 |",
    "|---|---:|---|",
  ];
  for (const entry of excluded) {
    rows.push(`| ${entry.root} | ${entry.entityCount} | ${entry.reason} |`);
  }
  return rows.join("\n");
};

const CHART_POINT_COLORS = Object.freeze({
  "A0-aggressive-fold": "#c0392b",
  "A1-legacy-blacklist": "#e67e22",
  "A2-prefix-blacklist": "#8e44ad",
  "A-safe-all-protect": "#7f8c8d",
  "R97-full": "#1a7f5a",
});

/**
 * Safety-utility 曲线：横轴是放行率（效用），纵轴是「放行的折叠里有多少
 * 落在实测跨宿主不一致的记录上」（不安全率，真值来自真实 Node 与真实
 * Edge 的直接读取，不是 R97 自己的规则）。
 *
 * 保护一切的策略必然落在右下角：放行率 0，不安全率 0。这不是好结果，
 * 图的作用正是把「0 误放行」放回效用语境里看。
 */
const renderSafetyUtilityChart = (corpus) => {
  const reference = corpus.independentReference;
  if (!reference || reference.differentialRecordCount === 0) {
    return null;
  }
  const denominator = reference.differentialRecordCount;
  const points = Object.entries(corpus.metrics).map(([name, values]) => ({
    name,
    x: values.foldRate,
    y: (values.unsafeFoldMeasured ?? 0) / denominator,
    allowedFold: values.allowedFold,
    unsafeMeasured: values.unsafeFoldMeasured ?? 0,
  }));

  const width = 860;
  const height = 520;
  const pad = { left: 96, right: 210, top: 64, bottom: 74 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const scaleX = (value) => pad.left + value * plotWidth;
  const scaleY = (value) => pad.top + (1 - value) * plotHeight;
  const percent = (value) => `${(value * 100).toFixed(1)}%`;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${pad.left}" y="34" font-size="19" font-weight="600" fill="#1b2733">R97 safety-utility 权衡</text>`,
    `<text x="${pad.left}" y="55" font-size="12.5" fill="#5b6b7c">纵轴真值来自真实 Node 与真实 Edge 的直接读取，共 ${denominator} 条实测跨宿主不一致记录；本样本覆盖 ${reference.entityCount} 个实体。</text>`,
  ];

  for (let step = 0; step <= 5; step += 1) {
    const value = step / 5;
    const y = scaleY(value);
    parts.push(
      `<line x1="${pad.left}" y1="${y}" x2="${pad.left + plotWidth}" y2="${y}" stroke="#e4e9ee" stroke-width="1"/>`,
      `<text x="${pad.left - 12}" y="${y + 4}" font-size="11.5" fill="#5b6b7c" text-anchor="end">${percent(value)}</text>`,
    );
    const x = scaleX(value);
    parts.push(
      `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotHeight}" stroke="#f0f3f6" stroke-width="1"/>`,
      `<text x="${x}" y="${pad.top + plotHeight + 22}" font-size="11.5" fill="#5b6b7c" text-anchor="middle">${percent(value)}</text>`,
    );
  }

  parts.push(
    `<line x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${pad.left + plotWidth}" y2="${pad.top + plotHeight}" stroke="#9aa7b4" stroke-width="1.4"/>`,
    `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotHeight}" stroke="#9aa7b4" stroke-width="1.4"/>`,
    `<text x="${pad.left + plotWidth / 2}" y="${height - 24}" font-size="13" fill="#33414f" text-anchor="middle">放行率（效用）</text>`,
    `<text x="26" y="${pad.top + plotHeight / 2}" font-size="13" fill="#33414f" text-anchor="middle" transform="rotate(-90 26 ${pad.top + plotHeight / 2})">放行中落在实测差分记录上的比例（不安全）</text>`,
  );

  const legendX = pad.left + plotWidth + 16;
  const rowHeight = 34;
  let cursorY = pad.top + 10;
  const legend = [...points]
    .sort((left, right) => left.y - right.y)
    .map((point) => {
      const rowY = Math.max(scaleY(point.y), cursorY);
      cursorY = rowY + rowHeight;
      return { point, rowY };
    });
  const overflow =
    legend.length === 0
      ? 0
      : Math.max(0, legend.at(-1).rowY - (pad.top + plotHeight - 20));
  if (overflow > 0) {
    for (const entry of legend) {
      entry.rowY -= overflow;
    }
  }

  for (const { point, rowY } of legend) {
    const color = CHART_POINT_COLORS[point.name] ?? "#34495e";
    const cx = scaleX(point.x);
    const cy = scaleY(point.y);
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${color}" fill-opacity="0.92" stroke="#ffffff" stroke-width="1.6"/>`,
      `<line x1="${cx + 8}" y1="${cy}" x2="${legendX - 7}" y2="${rowY}" stroke="${color}" stroke-width="1" stroke-dasharray="3 3" stroke-opacity="0.7"/>`,
      `<circle cx="${legendX}" cy="${rowY}" r="5" fill="${color}"/>`,
      `<text x="${legendX + 12}" y="${rowY + 4}" font-size="12.5" fill="#26333f">${point.name}</text>`,
      `<text x="${legendX + 12}" y="${rowY + 19}" font-size="11" fill="#6b7a89">放行 ${point.allowedFold}，其中实测差分 ${point.unsafeMeasured}</text>`,
    );
  }

  parts.push(
    `<text x="${pad.left}" y="${height - 6}" font-size="11" fill="#7a8896">R97 严格优于全量保护（同为 0 不安全，但恢复放行）；黑名单是另一条取舍曲线，不是被支配。</text>`,
    "</svg>",
  );
  return `${parts.join("\n")}\n`;
};

const renderMetricsTable = (metrics, foldRateConfidence = null) => {
  const hasMeasured = Object.values(metrics).some(
    (values) => values.unsafeFoldMeasured !== undefined,
  );
  const rows = [
    hasMeasured
      ? "| 方法 | 放行数 | 放行率 | 未决率 | 其中实测不实折叠 | oracle 折叠召回 | 误放行率（oracle） | 过度保护率 | oracle 一致率 |"
      : "| 方法 | 放行数 | 放行率 | 未决率 | oracle 折叠召回 | 误放行率 | 过度保护率 | oracle 一致率 |",
    hasMeasured
      ? "|---|---:|---:|---:|---:|---:|---:|---:|---:|"
      : "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [name, values] of Object.entries(metrics)) {
    const measured = hasMeasured
      ? ` ${values.unsafeFoldMeasured ?? 0} |`
      : "";
    rows.push(
      `| ${name} | ${values.allowedFold}/${values.total} | ${percent(values.foldRate)} | ${percent(values.unknownRate)} |${measured} ${percent(values.safeFoldCoverage)} | ${percent(values.unsafeFoldRate)} | ${percent(values.overProtectionRate)} | ${percent(values.exactStateAccuracy)} |`,
    );
  }
  return [
    ...rows,
    "",
    hasMeasured
      ? "「其中实测不实折叠」的真值是真实 Node 与真实 Edge 的直接读取结果，不依赖 R97 自身规则；它是 safety-utility 曲线纵轴的分子。"
      : "",
    "放行率 = 允许折叠 / 全部候选点，是覆盖率口径。未决率 = UNKNOWN / 全部候选点。",
    foldRateConfidence
      ? `R97 放行率的 95% 置信区间（按 project 聚类 bootstrap，${foldRateConfidence.iterations} 次重抽 / ${foldRateConfidence.clusterCount} 个簇）：**${percent(foldRateConfidence.point)} [${percent(foldRateConfidence.lower)}, ${percent(foldRateConfidence.upper)}]**。样本高度聚类——同一份代码里有成百上千个折叠点，同一实体可以出现几万次——因此重抽单元是 project 而不是单条记录；把记录当 IID 套 Wilson 区间会严重低估不确定性。`
      : "",
    "oracle 折叠召回与 oracle 一致率以 `expectedStateFromEvidence` 为参照，该 oracle 由同一套证据规则推导，",
    "因此 R97-full 一行天然接近 1，这两个数只反映引擎与规则的一致性，不代表对独立真值的召回。",
    "安全性请以误放行率和独立行为差分校验（`eval:behavior:full`）为准。",
  ].join("\n");
};

const renderCountTable = (counts) => {
  const rows = ["| 类别 | 数量 |", "|---|---:|"];
  for (const [key, value] of Object.entries(counts)) {
    rows.push(`| ${key} | ${value} |`);
  }
  return rows.join("\n");
};

const percent = (value) => `${(value * 100).toFixed(2)}%`;

export const parseBenchmarkArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/benchmark"),
    corpusPath: path.resolve("datasets/real-miniapp-candidates.jsonl"),
    legacyMapPath: DEFAULT_LEGACY_RULE_MAP,
    corpusLimit: 5000,
    perEntityCap: null,
    independentCheck: false,
    targetRuntimeIds: [...DEFAULT_TARGET_RUNTIME_IDS],
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    wechatReportPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    switch (argument) {
      case "--out":
        options.outputDir = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--corpus":
        options.corpusPath = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--legacy-map":
        options.legacyMapPath = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--wechat-report":
        options.wechatReportPath = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--source-root":
        // 迭代 2.5：指定原始 app-service.js 的根目录后，基准改按文件分析，
        // 而不是用记录重建的单条表达式。
        options.sourceRoot = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--corpus-limit":
        options.corpusLimit = positiveInteger(argument, next);
        index += 1;
        break;
      case "--per-entity-cap":
        options.perEntityCap = positiveInteger(argument, next);
        index += 1;
        break;
      case "--independent-check":
        options.independentCheck = true;
        break;
      case "--targets":
        options.targetRuntimeIds = parseTargets(argument, next);
        index += 1;
        break;
      case "--evaluator":
        [options.evaluatorRuntimeId] = parseTargets(argument, next);
        index += 1;
        break;
      case "--include-browser":
        options.targetRuntimeIds = unique([
          ...options.targetRuntimeIds,
          RUNTIME_IDS.EDGE,
        ]);
        break;
      case "--include-wechat":
        options.targetRuntimeIds = unique([
          ...options.targetRuntimeIds,
          RUNTIME_IDS.WECHAT,
        ]);
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const value = (argument, input) => {
  if (typeof input !== "string" || input.startsWith("--")) {
    throw new Error(`${argument} requires a value`);
  }
  return input;
};

const positiveInteger = (argument, input) => {
  const parsed = Number.parseInt(value(argument, input), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${argument} requires a positive integer`);
  }
  return parsed;
};

const TARGET_ALIASES = Object.freeze({
  language: RUNTIME_IDS.LANGUAGE,
  node: RUNTIME_IDS.NODE,
  browser: RUNTIME_IDS.EDGE,
  edge: RUNTIME_IDS.EDGE,
  wechat: RUNTIME_IDS.WECHAT,
});

const parseTargets = (argument, input) => {
  const raw = value(argument, input);
  const targets = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => {
      const resolved = TARGET_ALIASES[item.toLowerCase()] ?? item;
      return resolved;
    });
  if (targets.length === 0) {
    throw new Error(`${argument} requires at least one runtime id`);
  }
  return unique(targets);
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseBenchmarkArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/run-benchmark.mjs [options]",
        "",
        "Options:",
        "  --out <path>          Output directory",
        "  --corpus <path>       Real miniapp JSONL corpus",
        "  --legacy-map <path>   Legacy PRA rule map",
        "  --wechat-report <path> Real DevTools probe report",
        "  --corpus-limit <n>    Maximum corpus rows to evaluate",
        "  --per-entity-cap <n>  Stratified sample: keep at most n records per entity",
        "  --independent-check   Probe Node vs Edge directly and report measured divergence",
        "  --targets <list>      Comma-separated targets: language,node,browser,wechat",
        "  --evaluator <id>      Evaluator runtime: language,node,browser,wechat",
        "  --include-browser     Add the real headless Edge runtime to targets",
        "  --include-wechat      Add the real WeChat runtime to targets",
        "  --source-root <path>  Analyze original app-service.js files instead of rebuilt snippets",
      ].join("\n"),
    );
  } else {
    const summary = await runBenchmark(options);
    console.log(JSON.stringify(summary, null, 2));
  }
}
