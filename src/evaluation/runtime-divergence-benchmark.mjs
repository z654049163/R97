import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWLEDGE_STATE, TARGET_RUNTIME_SOURCE } from "../constants.mjs";
import {
  collectBrowserObservations,
  findBrowserPath,
} from "../evidence/browser-probe.mjs";
import { withCdpPage } from "../evidence/cdp-client.mjs";
import { collectLanguageObservations } from "../evidence/language-probe.mjs";
import { collectNodeObservations } from "../evidence/node-probe.mjs";
import { importWechatProbeResult } from "../evidence/wechat-probe.mjs";
import { NODE_BUILTIN_ROOTS } from "../module-runtime.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import {
  buildDirectProbeExpression,
  evaluateDirectProbeInNode,
} from "./direct-probe.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
} from "./run-benchmark.mjs";

const PROBE_DIMENSIONS = Object.freeze(["existence", "type", "callability"]);

/** 与 `inferRequiredRuntimeIds` 保持同一份宿主根集合。 */
const HOST_ROOT_RUNTIME_IDS = Object.freeze({
  [RUNTIME_IDS.WECHAT]: Object.freeze([
    "App",
    "Behavior",
    "Component",
    "Page",
    "getApp",
    "getCurrentPages",
    "wx",
  ]),
  [RUNTIME_IDS.NODE]: Object.freeze([
    "Buffer",
    "__dirname",
    "__filename",
    "exports",
    "module",
    "process",
    "require",
    ...NODE_BUILTIN_ROOTS,
  ]),
  [RUNTIME_IDS.EDGE]: Object.freeze([
    "XMLHttpRequest",
    "document",
    "localStorage",
    "location",
    "navigator",
    "sessionStorage",
    "window",
  ]),
});

/**
 * 微信基础库私有全局。它们不在宿主根表里（源码里是隐式全局赋值，例如
 * `wh=$gwh();`），但真实微信探针已证明它们在微信中存在且为函数。
 */
const WECHAT_PRIVATE_ROOT_PATTERN =
  /^(\$gwx|\$gwn|\$gwl|\$gwh|wh|gra|grb|nt_\d|nv_|__wx|__subContextEngine__)/u;

/**
 * 人工构造的压力用例子集。与自然困难集分开报告，不混在一起统计：
 * 审稿人一定会问「这些是不是你挑出来的」，所以挑出来的部分必须单独可见。
 */
export const SYNTHETIC_STRESS_ENTITIES = Object.freeze([
  "setImmediate",
  "clearImmediate",
  "Buffer.from",
  "process.version",
  "SharedArrayBuffer",
  "Intl.DateTimeFormat",
  "Date.prototype.getTimezoneOffset",
  "wx.request",
  "window.document",
  "document.cookie",
  "navigator.userAgent",
  "console.log",
]);

const rootOf = (entityId) => String(entityId).split(".")[0];

const hostRuntimeOfRoot = (root) => {
  for (const [runtimeId, roots] of Object.entries(HOST_ROOT_RUNTIME_IDS)) {
    if (roots.includes(root)) {
      return runtimeId;
    }
  }
  return null;
};

export const isDifficultyEntity = (entityId) =>
  hostRuntimeOfRoot(rootOf(entityId)) !== null ||
  WECHAT_PRIVATE_ROOT_PATTERN.test(rootOf(entityId));

/**
 * View C：困难集上的运行时差异检出。
 *
 * 主基准按语料分布抽样，回答「整体上放行了多少、错放了多少」。这里换一个
 * 问题：**把已知与宿主强相关的实体全部挑出来，逐个体检运行时差异，看 R97
 * 有没有漏掉任何一个**。指标是检出率，不是覆盖率。
 *
 * 真值来自第二套探针实现（直接属性访问），与 R97 决策链用的描述符探针相互
 * 独立；R97 的目标集包含所有被探测到的宿主，因此任何被独立探针确认为跨宿主
 * 不一致的实体都不应该被放行。
 */
export const runRuntimeDivergenceBenchmark = async ({
  outputDir = null,
  corpusPath,
  corpusLimit = Number.POSITIVE_INFINITY,
  perEntityCap = 5,
  wechatReportPath = null,
  includeSynthetic = true,
  generatedAt = new Date().toISOString(),
}) => {
  if (!corpusPath || !existsSync(corpusPath)) {
    throw new Error(`Corpus file does not exist: ${corpusPath}`);
  }
  const records = await readDeduplicatedCorpusRecords(
    corpusPath,
    corpusLimit,
    { perEntityCap },
  );
  const naturalEntityIds = [
    ...new Set(records.map((record) => record.entityId)),
  ].filter(isDifficultyEntity);
  const syntheticEntityIds = includeSynthetic
    ? [...SYNTHETIC_STRESS_ENTITIES]
    : [];

  const natural = await evaluateEntitySet({
    entityIds: naturalEntityIds,
    wechatReportPath,
  });
  const synthetic = includeSynthetic
    ? await evaluateEntitySet({
        entityIds: syntheticEntityIds,
        wechatReportPath,
      })
    : null;

  const summary = {
    generatedAt,
    corpusPath,
    sampling: { perEntityCap },
    natural: summarize(natural),
    synthetic: synthetic ? summarize(synthetic) : null,
    naturalDetails: natural,
    syntheticDetails: synthetic,
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "runtime-divergence.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDir, "runtime-divergence.md"),
      renderMarkdown(summary),
      "utf8",
    );
  }
  return summary;
};

const evaluateEntitySet = async ({ entityIds, wechatReportPath }) => {
  if (entityIds.length === 0) {
    return [];
  }
  const entityDimensions = Object.fromEntries(
    entityIds.map((entityId) => [entityId, [...PROBE_DIMENSIONS]]),
  );
  const observedAt = new Date().toISOString();

  const language = collectLanguageObservations({
    entityDimensions,
    observedAt,
  });
  const node = collectNodeObservations({ entityDimensions, observedAt });
  const edge = await collectBrowserObservations({
    entityDimensions,
    observedAt,
  });
  const wechat = loadWechatObservations({
    entityDimensions,
    wechatReportPath,
    observedAt,
  });

  const targetRuntimeIds = [
    RUNTIME_IDS.LANGUAGE,
    RUNTIME_IDS.NODE,
    RUNTIME_IDS.EDGE,
  ];
  if (wechat) {
    targetRuntimeIds.push(RUNTIME_IDS.WECHAT);
  }

  const plans = entityIds.flatMap((entityId) => {
    const result = analyzeAndDecide({
      source: `${entityId};`,
      filePath: "<runtime-divergence>",
      targetRuntimeIds,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: "runtime-divergence-v1",
      contractVersion: "benchmark-v1",
    });
    return result.decisions;
  });
  const entityEvidence = await buildRuntimeEvidence(
    plans,
    targetRuntimeIds,
    "runtime-divergence-v1",
    wechatReportPath,
  );

  const directNode = evaluateDirectProbeInNode(entityIds);
  const profileDir = path.join(process.cwd(), ".runtime", "edge-profile");
  mkdirSync(profileDir, { recursive: true });
  const directEdge = await withCdpPage(
    { browserPath: findBrowserPath(), profileDir },
    ({ evaluate }) => evaluate(buildDirectProbeExpression(entityIds)),
  );

  const decisionsByEntity = new Map();
  for (const entityId of entityIds) {
    const result = analyzeAndDecide({
      source: `${entityId};`,
      filePath: "<runtime-divergence>",
      targetRuntimeIds,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: "runtime-divergence-v1",
      contractVersion: "benchmark-v1",
      evidenceRecords: entityEvidence.records,
    });
    decisionsByEntity.set(
      entityId,
      result.decisions.find(
        (item) => item.runtimeEntity.entityId === entityId,
      ) ?? result.decisions[0] ?? null,
    );
  }

  return entityIds.map((entityId) => {
    const observations = {
      [RUNTIME_IDS.LANGUAGE]:
        language.observations[entityId]?.values ?? null,
      [RUNTIME_IDS.NODE]: normalizeDirect(directNode[entityId]),
      [RUNTIME_IDS.EDGE]: normalizeDirect(directEdge[entityId]),
    };
    if (wechat) {
      observations[RUNTIME_IDS.WECHAT] =
        wechat.observations[entityId]?.values ?? null;
    }
    const observedRuntimes = Object.entries(observations)
      .filter(([, values]) => values !== null)
      .map(([runtimeId]) => runtimeId);
    const divergent = hasPairwiseDivergence(observations, observedRuntimes);
    const decision = decisionsByEntity.get(entityId);
    const state = decision?.decision.knowledgeState ?? KNOWLEDGE_STATE.UNKNOWN;
    return {
      entityId,
      expectedRuntimeIds: hostRuntimeOfRoot(rootOf(entityId)),
      observedRuntimes,
      divergent,
      decision: state,
      reasonCodes: decision?.decision.reasonCodes ?? [],
      observations,
      missed: divergent && state === KNOWLEDGE_STATE.FOLD,
    };
  });
};

const loadWechatObservations = ({
  entityDimensions,
  wechatReportPath,
  observedAt,
}) => {
  if (!wechatReportPath || !existsSync(wechatReportPath)) {
    return null;
  }
  try {
    const report = JSON.parse(readFileSync(wechatReportPath, "utf8"));
    return importWechatProbeResult({
      report,
      entityDimensions,
      observedAt,
      // 判卷场景需要原始观测：这里问的是「两个宿主是否不同」，
      // 「不存在 vs 存在」本身就是差异，不能裁掉。
      scopeKind: "raw",
    });
  } catch {
    return null;
  }
};

const normalizeDirect = (value) => {
  if (!value || typeof value !== "object" || value.error) {
    return null;
  }
  const values = {};
  for (const dimension of PROBE_DIMENSIONS) {
    if (Object.hasOwn(value, dimension)) {
      values[dimension] = value[dimension];
    }
  }
  return Object.keys(values).length === 0 ? null : values;
};

const hasPairwiseDivergence = (observations, runtimeIds) => {
  for (let left = 0; left < runtimeIds.length; left += 1) {
    for (let right = left + 1; right < runtimeIds.length; right += 1) {
      if (
        !sameObservation(
          observations[runtimeIds[left]],
          observations[runtimeIds[right]],
        )
      ) {
        return true;
      }
    }
  }
  return false;
};

const sameObservation = (left, right) => {
  if (!left || !right) {
    return false;
  }
  for (const dimension of PROBE_DIMENSIONS) {
    const leftHas = Object.hasOwn(left, dimension);
    const rightHas = Object.hasOwn(right, dimension);
    if (!leftHas && !rightHas) {
      continue;
    }
    if (leftHas !== rightHas || left[dimension] !== right[dimension]) {
      return false;
    }
  }
  return true;
};

export const summarize = (details) => {
  const divergent = details.filter((detail) => detail.divergent);
  const blocked = divergent.filter(
    (detail) => detail.decision !== KNOWLEDGE_STATE.FOLD,
  );
  const missed = divergent.filter((detail) => detail.missed);
  return {
    entityCount: details.length,
    observedEntityCount: details.filter(
      (detail) => detail.observedRuntimes.length >= 2,
    ).length,
    divergentEntityCount: divergent.length,
    blockedDivergentCount: blocked.length,
    missedCount: missed.length,
    detectionRate:
      divergent.length === 0 ? null : blocked.length / divergent.length,
    missedEntities: missed.map((detail) => detail.entityId).slice(0, 30),
    divergentEntities: divergent.map((detail) => detail.entityId).slice(0, 30),
  };
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 运行时差异困难集（View C）",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    "主基准按语料分布抽样，回答整体放行与错误放行。本表换一个问题：把已知与宿主",
    "强相关的实体全部挑出来，逐个体检运行时差异，看 R97 有没有漏掉任何一个。",
    "",
    "真值来自第二套探针实现（直接属性访问），与 R97 决策链用的描述符探针相互独立。",
    "R97 的目标集包含所有被探测到的宿主，因此任何被独立探针确认为跨宿主不一致的实体",
    "都不应被放行。",
    "",
    "## 自然困难集（从语料派生，不人工挑选）",
    "",
    renderSet(summary.natural),
    "",
  ];
  if (summary.synthetic) {
    lines.push(
      "## 人工压力用例子集（单独统计，不与自然集混合）",
      "",
      renderSet(summary.synthetic),
      "",
    );
  }
  lines.push(
    "## 检出率说明",
    "",
    "- 检出率 = 被阻断的差异实体 / 实测差异实体。100% 表示独立探针发现的每一处跨宿主差异，R97 都没有放行。",
    "- 差异判定使用所有已观测运行时的两两比较，包含语言基线、真实 Node、真实 Edge，以及（若提供报告）真实微信。",
    "- 检出率衡量的是「R97 的观测链有没有漏掉已知差异」，不是「R97 能折叠多少」，两者互为补充。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

const renderSet = (entry) => {
  const rows = [
    "| 指标 | 数值 |",
    "|---|---:|",
    `| 困难集实体 | ${entry.entityCount} |`,
    `| 至少两个运行时给出观测 | ${entry.observedEntityCount} |`,
    `| 实测跨运行时不一致 | ${entry.divergentEntityCount} |`,
    `| 其中被 R97 阻断 | ${entry.blockedDivergentCount} |`,
    `| 漏放（差异实体被 FOLD） | ${entry.missedCount} |`,
    `| 检出率 | ${entry.detectionRate === null ? "-" : `${(entry.detectionRate * 100).toFixed(2)}%`} |`,
  ];
  if (entry.divergentEntityCount > 0) {
    rows.push(
      "",
      `差异实体（前 30）：${entry.divergentEntities.join("、")}`,
    );
  }
  return rows.join("\n");
};

export const parseRuntimeDivergenceArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/runtime-divergence"),
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    perEntityCap: 5,
    wechatReportPath: path.resolve(
      "datasets/wechat-live/wechat-probe-report.json",
    ),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--out") {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (argument === "--corpus") {
      options.corpusPath = path.resolve(next);
      index += 1;
    } else if (argument === "--per-entity-cap") {
      options.perEntityCap = Number.parseInt(next, 10);
      index += 1;
    } else if (argument === "--wechat-report") {
      options.wechatReportPath = path.resolve(next);
      index += 1;
    } else if (argument === "--no-synthetic") {
      options.includeSynthetic = false;
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
  const options = parseRuntimeDivergenceArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/runtime-divergence-benchmark.mjs [--out <path>] [--corpus <path>] [--per-entity-cap <n>] [--no-synthetic]",
    );
  } else {
    const summary = await runRuntimeDivergenceBenchmark(options);
    console.log(
      JSON.stringify(
        {
          natural: summary.natural,
          synthetic: summary.synthetic,
        },
        null,
        2,
      ),
    );
    process.exitCode = summary.natural.missedCount === 0 ? 0 : 1;
  }
}
