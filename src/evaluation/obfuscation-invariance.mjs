import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline";
import { Worker } from "node:worker_threads";

import { KNOWLEDGE_STATE, TARGET_RUNTIME_SOURCE } from "../constants.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { decideProtection } from "../decision-engine.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { buildRuntimeEvidence } from "./run-benchmark.mjs";

/**
 * 混淆不变性基准（obfuscation-invariance）。
 *
 * 动机：主基准的语料是真实生产包与干净的官方测试代码，缺少「同一份代码被
 * 受控混淆后，R97 的判定是否保持健全」的直接证据。本基准用 javascript-obfuscator
 * 对真实语料文件做两组可控强度的混淆，然后对同一文件的原始版与混淆版各跑
 * 一遍完整判定管线，回答三个问题：
 *
 *   1. 决策一致性：同一实体在混淆前后是否得到同样的实体级判定；
 *   2. 零差分保持：混淆版中被 FOLD 的实体是否仍然不落在实测差分实体上；
 *   3. UNKNOWN 增量归因：混淆带来的新未决集中在哪些 reason code 上。
 *
 * 实体配对前提：`renameGlobals: false`（javascript-obfuscator 默认），全局名
 * 不被重命名，实体按 entityId 跨版本对齐；混淆器新引入的全局辅助函数
 * （字符串数组解码器等）作为「混淆器新实体」单独统计。
 *
 * 差分实体集不依赖外部产物：直接用本次评测现场采集的证据读数判定——同一
 * 实体在任意两个运行时上同维观测值不同即记为差分，与性能报告的口径一致。
 */

const POLICY_VERSION = "obfuscation-invariance-v1";
const CONTRACT_VERSION = "benchmark-v1";

const OBFUSCATION_CONFIGS = Object.freeze([
  {
    configId: "M1-string-array",
    label: "轻混淆：字符串数组化",
    options: Object.freeze({
      stringArray: true,
      stringArrayThreshold: 0.8,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      renameGlobals: false,
      selfDefending: false,
      unicodeEscapeSequence: false,
    }),
  },
  {
    configId: "M2-control-flow",
    label: "重混淆：+控制流平坦化+死代码注入",
    options: Object.freeze({
      stringArray: true,
      stringArrayThreshold: 0.8,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      renameGlobals: false,
      selfDefending: false,
      unicodeEscapeSequence: false,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.7,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.3,
    }),
  },
]);

const CORPUS_SOURCES = Object.freeze([
  {
    kind: "miniapp",
    label: "微信小程序生产包",
    corpusPath: "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    targetRuntimeIds: Object.freeze([
      RUNTIME_IDS.LANGUAGE,
      RUNTIME_IDS.NODE,
      RUNTIME_IDS.EDGE,
      RUNTIME_IDS.WECHAT,
    ]),
    wechatReportPath: "datasets/wechat-live/wechat-probe-report.json",
  },
  {
    kind: "node",
    label: "Node 真实仓库",
    corpusPath: "datasets/external-node-repos/real-miniapp-candidates.jsonl",
    targetRuntimeIds: Object.freeze([
      RUNTIME_IDS.LANGUAGE,
      RUNTIME_IDS.NODE,
      RUNTIME_IDS.EDGE,
    ]),
    wechatReportPath: null,
  },
  {
    kind: "browser",
    label: "浏览器真实仓库",
    corpusPath: "datasets/external-browser-repos/real-miniapp-candidates.jsonl",
    targetRuntimeIds: Object.freeze([
      RUNTIME_IDS.LANGUAGE,
      RUNTIME_IDS.NODE,
      RUNTIME_IDS.EDGE,
    ]),
    wechatReportPath: null,
  },
]);

const DEFAULT_OPTIONS = Object.freeze({
  outputDir: path.resolve("datasets/obfuscation-invariance"),
  wechatReportPath: path.resolve("datasets/wechat-live/wechat-probe-report.json"),
  limitFilesPerKind: 15,
  minFileBytes: 3000,
  maxFileBytes: 120000,
  obfuscateTimeoutMs: 60000,
});

/* ────────────────────────── 语料文件抽样 ────────────────────────── */

/**
 * 流式扫描语料 JSONL，只取文件级元数据（真实语料含上百万条记录，不能整读）。
 * 体积分层抽样：小 / 中 / 大三档各占 limit 的三分之一，消除“只测小文件”
 * 的偏倚；档内按体积升序取，保证确定性可复现。
 */
const SIZE_STRATA = Object.freeze([
  { id: "small", min: 3000, max: 10000 },
  { id: "medium", min: 10000, max: 60000 },
  { id: "large", min: 60000, max: 120000 },
]);

const readCorpusFiles = async (corpusPath, { minFileBytes, maxFileBytes, limit }) => {
  const byFile = new Map();
  const input = createReadStream(path.resolve(corpusPath), { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!record.sourceRoot || !record.file) continue;
    const key = `${record.sourceRoot}::${record.file}`;
    if (byFile.has(key)) continue;
    const sourceBytes = Number(record.sourceBytes ?? 0);
    if (sourceBytes < minFileBytes || sourceBytes > maxFileBytes) continue;
    byFile.set(key, {
      kind: record.sourceKind,
      sourceRoot: record.sourceRoot,
      file: record.file,
      sourceBytes,
    });
  }
  input.close();
  const files = [];
  const perStratum = Math.max(1, Math.floor(limit / SIZE_STRATA.length));
  let remainder = limit;
  for (let index = 0; index < SIZE_STRATA.length; index += 1) {
    const stratum = SIZE_STRATA[index];
    const take = index === SIZE_STRATA.length - 1
      ? remainder
      : Math.min(perStratum, remainder);
    remainder -= take;
    const stratumFiles = [...byFile.values()]
      .filter(
        (entry) =>
          entry.sourceBytes >= stratum.min &&
          entry.sourceBytes < stratum.max,
      )
      .sort((a, b) => a.sourceBytes - b.sourceBytes)
      .slice(0, take);
    for (const entry of stratumFiles) {
      files.push({ ...entry, sizeStratum: stratum.id });
    }
  }
  const totalCandidateFiles = [...byFile.values()].length;
  return { files, totalCandidateFiles, strataCounts: countStrata(files) };
};

const countStrata = (files) => {
  const counts = {};
  for (const entry of files) {
    counts[entry.sizeStratum] = (counts[entry.sizeStratum] ?? 0) + 1;
  }
  return counts;
};

/* ────────────────────────── 受控混淆（worker + 超时） ────────────────────────── */

const WORKER_SCRIPT = `
const { parentPort, workerData } = require("node:worker_threads");
const { obfuscate } = require("javascript-obfuscator");
try {
  const code = obfuscate(workerData.source, workerData.options).getObfuscatedCode();
  parentPort.postMessage({ ok: true, code });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String((error && error.message) || error) });
}
`;

const obfuscateSource = (source, options, timeoutMs) =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { source, options },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, error: `obfuscate-timeout(${timeoutMs}ms)`, ms: Date.now() - startedAt });
    }, timeoutMs);
    worker.on("message", (message) => {
      clearTimeout(timer);
      resolve({ ...message, ms: Date.now() - startedAt });
    });
    worker.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: String(error.message || error), ms: Date.now() - startedAt });
    });
  });

/* ────────────────────────── 判定与聚合 ────────────────────────── */

const analyzeVariant = (source, filePath, targetRuntimeIds) =>
  analyzeAndDecide({
    source,
    filePath,
    targetRuntimeIds,
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    policyVersion: POLICY_VERSION,
    contractVersion: CONTRACT_VERSION,
  });

/** 实体级判定聚合：任一 PROTECT ➔ PROTECT；否则任一 UNKNOWN ➔ UNKNOWN；否则 FOLD。 */
const aggregateByEntity = (redecided) => {
  const byEntity = new Map();
  for (const item of redecided) {
    if (!byEntity.has(item.entityId)) {
      byEntity.set(item.entityId, { fold: 0, protect: 0, unknown: 0, reasonCodes: {} });
    }
    const entry = byEntity.get(item.entityId);
    if (item.knowledgeState === KNOWLEDGE_STATE.FOLD) entry.fold += 1;
    else if (item.knowledgeState === KNOWLEDGE_STATE.PROTECT) entry.protect += 1;
    else entry.unknown += 1;
    for (const code of item.reasonCodes) {
      entry.reasonCodes[code] = (entry.reasonCodes[code] ?? 0) + 1;
    }
  }
  const verdicts = new Map();
  for (const [entityId, entry] of byEntity) {
    verdicts.set(
      entityId,
      entry.protect > 0
        ? KNOWLEDGE_STATE.PROTECT
        : entry.unknown > 0
          ? KNOWLEDGE_STATE.UNKNOWN
          : KNOWLEDGE_STATE.FOLD,
    );
  }
  return { byEntity, verdicts };
};

/** 从现场证据读数推导实测差分实体：同实体在任意两个运行时上同维观测值不同。 */
const deriveDifferentialEntities = (evidenceRecords) => {
  const byEntity = new Map();
  for (const record of evidenceRecords) {
    const entityId = record.entityId;
    if (!entityId) continue;
    if (!byEntity.has(entityId)) byEntity.set(entityId, new Map());
    const byRuntime = byEntity.get(entityId);
    for (const [runtimeId, observation] of Object.entries(record.observations ?? {})) {
      const values = observation.values ?? {};
      const prev = byRuntime.get(runtimeId);
      if (prev) {
        for (const [dim, value] of Object.entries(values)) {
          if (prev.values[dim] !== undefined && prev.values[dim] !== value) {
            prev.conflict = true;
          }
        }
        Object.assign(prev.values, values);
      } else {
        byRuntime.set(runtimeId, { values: { ...values }, conflict: false });
      }
    }
  }
  const differential = new Set();
  for (const [entityId, byRuntime] of byEntity) {
    const runtimes = [...byRuntime.entries()];
    if (runtimes.length < 2) continue;
    let divergent = false;
    for (let i = 0; i < runtimes.length && !divergent; i += 1) {
      for (let j = i + 1; j < runtimes.length && !divergent; j += 1) {
        const a = runtimes[i][1];
        const b = runtimes[j][1];
        if (a.conflict || b.conflict) {
          divergent = true;
          break;
        }
        for (const dim of Object.keys(a.values)) {
          if (dim in b.values && a.values[dim] !== b.values[dim]) {
            divergent = true;
            break;
          }
        }
      }
    }
    if (divergent) differential.add(entityId);
  }
  return differential;
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/* ────────────────────────── 主流程 ────────────────────────── */

export const runObfuscationInvariance = async (options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const generatedAt = new Date().toISOString();
  const kindBuckets = [];

  for (const source of CORPUS_SOURCES) {
    const { files, totalCandidateFiles, strataCounts } = await readCorpusFiles(source.corpusPath, {
      minFileBytes: config.minFileBytes,
      maxFileBytes: config.maxFileBytes,
      limit: config.limitFilesPerKind,
    });
    const wechatReportPath =
      source.wechatReportPath && existsSync(path.resolve(source.wechatReportPath))
        ? path.resolve(source.wechatReportPath)
        : config.wechatReportPath && source.kind === "miniapp" && existsSync(config.wechatReportPath)
          ? config.wechatReportPath
          : null;

    /* 第一趟：全部变体建 plans（无证据） */
    const variants = [];
    for (const fileEntry of files) {
      const absolutePath = path.join(path.resolve(fileEntry.sourceRoot), fileEntry.file);
      if (!existsSync(absolutePath)) continue;
      const originalSource = readFileSync(absolutePath, "utf8");
      const baseId = sha256(`${fileEntry.sourceRoot}::${fileEntry.file}`).slice(0, 16);
      const fileVariants = [
        {
          variantId: "original",
          configId: null,
          label: "原始版",
          source: originalSource,
          obfuscateMs: 0,
        },
      ];
      for (const obfConfig of OBFUSCATION_CONFIGS) {
        const outcome = await obfuscateSource(
          originalSource,
          obfConfig.options,
          config.obfuscateTimeoutMs,
        );
        fileVariants.push({
          variantId: obfConfig.configId,
          configId: obfConfig.configId,
          label: obfConfig.label,
          source: outcome.ok ? outcome.code : null,
          obfuscateError: outcome.ok ? null : outcome.error,
          obfuscateMs: outcome.ms,
        });
      }
      for (const variant of fileVariants) {
        if (variant.source === null) continue;
        const analysis = analyzeVariant(
          variant.source,
          `${source.kind}-${baseId}-${variant.variantId}.js`,
          source.targetRuntimeIds,
        );
        variants.push({
          fileKey: `${fileEntry.sourceRoot}::${fileEntry.file}`,
          kind: source.kind,
          variant,
          analysis,
        });
      }
    }

    /* 一次性构建证据（语言/Node 进程内、Edge CDP、微信读预采报告） */
    const allDecisions = variants.flatMap(({ analysis }) => analysis.decisions);
    const evidence = await buildRuntimeEvidence(
      allDecisions,
      source.targetRuntimeIds,
      POLICY_VERSION,
      wechatReportPath,
    );

    /* 第二趟：带证据终判 */
    const differentialEntities = deriveDifferentialEntities(evidence.records);
    const perVariant = [];
    for (const entry of variants) {
      const redecided = entry.analysis.decisions.map((plan) => {
        const decision = decideProtection({
          query: plan.query,
          semanticContract: plan.semanticContract,
          evidenceRecords: evidence.records,
        });
        return {
          entityId: plan.runtimeEntity.entityId,
          knowledgeState: decision.knowledgeState,
          reasonCodes: decision.reasonCodes,
        };
      });
      const aggregated = aggregateByEntity(redecided);
      const foldEntities = [...aggregated.verdicts.entries()]
        .filter(([, verdict]) => verdict === KNOWLEDGE_STATE.FOLD)
        .map(([entityId]) => entityId);
      const unsoundFolds = foldEntities.filter((entityId) =>
        differentialEntities.has(entityId),
      );
      perVariant.push({
        fileKey: entry.fileKey,
        variantId: entry.variant.variantId,
        configId: entry.variant.configId,
        label: entry.variant.label,
        obfuscateError: entry.variant.obfuscateError ?? null,
        obfuscateMs: entry.variant.obfuscateMs,
        sourceBytes: Buffer.byteLength(entry.variant.source ?? "", "utf8"),
        findingCount: entry.analysis.decisions.length,
        byKnowledgeState: summarizeStates(redecided),
        reasonCodes: summarizeReasonCodes(redecided),
        entityCount: aggregated.verdicts.size,
        verdicts: aggregated.verdicts,
        unsoundFolds,
      });
    }

    kindBuckets.push({
      kind: source.kind,
      label: source.label,
      corpusPath: source.corpusPath,
      targetRuntimeIds: source.targetRuntimeIds,
      wechatReportUsed: wechatReportPath,
      totalCandidateFiles,
      selectedFiles: files.length,
      sizeStrataCounts: strataCounts,
      evidenceAvailability: evidence.availability,
      differentialEntityCount: differentialEntities.size,
      perVariant,
    });
  }

  const summary = summarizeInvariance(kindBuckets, OBFUSCATION_CONFIGS);
  return { generatedAt, policyVersion: POLICY_VERSION, kindBuckets, summary };
};

const summarizeStates = (redecided) => {
  const counts = { FOLD: 0, PROTECT: 0, UNKNOWN: 0 };
  for (const item of redecided) {
    counts[item.knowledgeState] = (counts[item.knowledgeState] ?? 0) + 1;
  }
  return counts;
};

const summarizeReasonCodes = (redecided) => {
  const counts = {};
  for (const item of redecided) {
    for (const code of item.reasonCodes) {
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  return counts;
};

const compareVariantPair = (original, obfuscated) => {
  const shared = [];
  const originalOnly = [];
  const obfuscatedOnly = [];
  for (const [entityId, verdict] of original.verdicts) {
    if (obfuscated.verdicts.has(entityId)) {
      shared.push({ entityId, before: verdict, after: obfuscated.verdicts.get(entityId) });
    } else {
      originalOnly.push({ entityId, verdict });
    }
  }
  for (const [entityId, verdict] of obfuscated.verdicts) {
    if (!original.verdicts.has(entityId)) {
      obfuscatedOnly.push({ entityId, verdict });
    }
  }
  const transitions = {};
  for (const { before, after } of shared) {
    const key = `${before}->${after}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
  }
  const consistent = shared.filter(({ before, after }) => before === after).length;
  return {
    sharedEntityCount: shared.length,
    consistentEntityCount: consistent,
    consistencyRate: shared.length === 0 ? null : consistent / shared.length,
    transitions,
    originalOnlyCount: originalOnly.length,
    obfuscatedOnlyCount: obfuscatedOnly.length,
    obfuscatedOnlySamples: obfuscatedOnly.slice(0, 12),
    originalOnlySamples: originalOnly.slice(0, 12),
    unsoundFolds: obfuscated.unsoundFolds,
  };
};

const summarizeInvariance = (kindBuckets, obfuscationConfigs) => {
  const perKind = kindBuckets.map((bucket) => {
    const byFile = new Map();
    for (const variant of bucket.perVariant) {
      if (!byFile.has(variant.fileKey)) byFile.set(variant.fileKey, {});
      byFile.get(variant.fileKey)[variant.variantId] = variant;
    }
    const configs = obfuscationConfigs.map((obfConfig) => {
      const pairs = [];
      for (const [fileKey, variants] of byFile) {
        if (variants.original && variants[obfConfig.configId]) {
          pairs.push({
            fileKey,
            comparison: compareVariantPair(variants.original, variants[obfConfig.configId]),
            originalStates: variants.original.byKnowledgeState,
            obfuscatedStates: variants[obfConfig.configId].byKnowledgeState,
            originalReasonCodes: variants.original.reasonCodes,
            obfuscatedReasonCodes: variants[obfConfig.configId].reasonCodes,
            obfuscateError: variants[obfConfig.configId].obfuscateError,
          });
        }
      }
      const shared = pairs.reduce((sum, p) => sum + p.comparison.sharedEntityCount, 0);
      const consistent = pairs.reduce((sum, p) => sum + p.comparison.consistentEntityCount, 0);
      const transitions = {};
      for (const pair of pairs) {
        for (const [key, count] of Object.entries(pair.comparison.transitions)) {
          transitions[key] = (transitions[key] ?? 0) + count;
        }
      }
      return {
        configId: obfConfig.configId,
        label: obfConfig.label,
        comparedFiles: pairs.length,
        obfuscationFailures: pairs.filter((p) => p.obfuscateError).length,
        sharedEntityCount: shared,
        consistentEntityCount: consistent,
        consistencyRate: shared === 0 ? null : consistent / shared,
        transitions,
        totalUnsoundFolds: pairs.reduce((sum, p) => sum + p.comparison.unsoundFolds.length, 0),
        reasonCodeDelta: reasonCodeDelta(pairs),
        pairs,
      };
    });
    return {
      kind: bucket.kind,
      label: bucket.label,
      selectedFiles: bucket.selectedFiles,
      differentialEntityCount: bucket.differentialEntityCount,
      evidenceAvailability: bucket.evidenceAvailability,
      configs,
    };
  });
  const totals = perKind.reduce(
    (acc, kind) => {
      for (const config of kind.configs) {
        acc.shared += config.sharedEntityCount;
        acc.consistent += config.consistentEntityCount;
        acc.unsound += config.totalUnsoundFolds;
      }
      return acc;
    },
    { shared: 0, consistent: 0, unsound: 0 },
  );
  return {
    perKind,
    totals: {
      ...totals,
      consistencyRate: totals.shared === 0 ? null : totals.consistent / totals.shared,
    },
  };
};

const reasonCodeDelta = (pairs) => {
  const delta = {};
  for (const pair of pairs) {
    const codes = new Set([
      ...Object.keys(pair.originalReasonCodes ?? {}),
      ...Object.keys(pair.obfuscatedReasonCodes ?? {}),
    ]);
    for (const code of codes) {
      delta[code] =
        (delta[code] ?? 0) +
        ((pair.obfuscatedReasonCodes?.[code] ?? 0) - (pair.originalReasonCodes?.[code] ?? 0));
    }
  }
  return Object.fromEntries(
    Object.entries(delta).sort(([, a], [, b]) => Math.abs(b) - Math.abs(a)),
  );
};

/* ────────────────────────── 报告渲染 ────────────────────────── */

const pct = (value) => (value === null ? "—" : `${(value * 100).toFixed(2)}%`);

const renderMarkdown = (result) => {
  const lines = [];
  lines.push("# R97 混淆不变性基准报告");
  lines.push("");
  lines.push(`生成时间：${result.generatedAt}`);
  lines.push("");
  lines.push("## 实验设计");
  lines.push("");
  lines.push("- 用 `javascript-obfuscator` 对三生态真实语料文件做两组受控混淆（`renameGlobals: false` 保证实体可跨版本配对）；");
  lines.push("- 同一文件的原始版与混淆版各跑一遍完整判定管线（两趟判定 + 四宿主证据）；");
  lines.push("- 实测差分实体集由本次评测现场证据读数推导（同实体任意两运行时同维观测不同）。");
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push("| 指标 | 数值 |");
  lines.push("|---|---:|");
  lines.push(`| 共享实体配对总数 | ${result.summary.totals.shared} |`);
  lines.push(`| 判定一致 | ${result.summary.totals.consistent} |`);
  lines.push(`| 决策一致性 | ${pct(result.summary.totals.consistencyRate)} |`);
  lines.push(`| 🔥 混淆版不安全折叠（FOLD ∩ 实测差分） | **${result.summary.totals.unsound}** |`);
  lines.push("");
  for (const kind of result.summary.perKind) {
    lines.push(`## ${kind.label}（${kind.kind}，抽样 ${kind.selectedFiles} 文件，实测差分实体 ${kind.differentialEntityCount}）`);
    lines.push("");
    for (const config of kind.configs) {
      lines.push(`### ${config.label}（${config.configId}）`);
      lines.push("");
      lines.push("| 指标 | 数值 |");
      lines.push("|---|---:|");
      lines.push(`| 对比文件数（混淆失败另计） | ${config.comparedFiles}（失败 ${config.obfuscationFailures}） |`);
      lines.push(`| 共享实体配对 | ${config.sharedEntityCount} |`);
      lines.push(`| 决策一致 | ${config.consistentEntityCount}（${pct(config.consistencyRate)}） |`);
      lines.push(`| 不安全折叠 | ${config.totalUnsoundFolds} |`);
      const transitionRows = Object.entries(config.transitions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => `${key}: ${count}`)
        .join("； ");
      lines.push(`| 判定迁移 | ${transitionRows || "—"} |`);
      lines.push("");
      const deltaRows = Object.entries(config.reasonCodeDelta)
        .slice(0, 8)
        .map(([code, delta]) => `${code}: ${delta >= 0 ? "+" : ""}${delta}`)
        .join("； ");
      lines.push(`reason code 增量（混淆 − 原始）：${deltaRows || "—"}`);
      lines.push("");
    }
  }
  lines.push("## 口径说明");
  lines.push("");
  lines.push("- **决策一致性**：实体级判定（任一 PROTECT ➔ PROTECT，否则任一 UNKNOWN ➔ UNKNOWN，否则 FOLD）在混淆前后相同即计一致。混淆引入的**新实体**（字符串数组解码器等）不参与一致性分母，单独统计；");
  lines.push("- **不安全折叠**：混淆版被 FOLD 的实体落在实测差分实体集上；该指标必须为 0（零差分保持）；");
  lines.push("- 混淆把字符串字面量包进解码调用是**预期内的 FOLD➔UNKNOWN 迁移**来源：解码器是文件内定义的实体，按 code-defined-global 保守未决。");
  return `${lines.join("\n")}\n`;
};

export const parseObfuscationInvarianceArgs = (argv) => {
  const options = { ...DEFAULT_OPTIONS };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--out") options.outputDir = path.resolve(value);
    else if (key === "--limit-files") options.limitFilesPerKind = Number(value);
    else if (key === "--min-file-bytes") options.minFileBytes = Number(value);
    else if (key === "--max-file-bytes") options.maxFileBytes = Number(value);
    else if (key === "--timeout-ms") options.obfuscateTimeoutMs = Number(value);
  }
  return options;
};

export const main = async (argv = process.argv.slice(2)) => {
  const options = parseObfuscationInvarianceArgs(argv);
  const result = await runObfuscationInvariance(options);
  mkdirSync(options.outputDir, { recursive: true });
  writeFileSync(
    path.join(options.outputDir, "obfuscation-invariance.json"),
    JSON.stringify(result, null, 2),
  );
  writeFileSync(
    path.join(options.outputDir, "obfuscation-invariance.md"),
    renderMarkdown(result),
  );
  console.log(`[obfuscation-invariance] 决策一致性: ${pct(result.summary.totals.consistencyRate)}`);
  console.log(`[obfuscation-invariance] 不安全折叠: ${result.summary.totals.unsound}`);
  console.log(`[obfuscation-invariance] 报告已写入 ${options.outputDir}`);
};

if (process.argv[1] && path.resolve(process.argv[1]).endsWith("obfuscation-invariance.mjs")) {
  await main();
}
