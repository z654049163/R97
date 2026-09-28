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

import { findBrowserPath } from "../evidence/browser-probe.mjs";
import { withCdpPage } from "../evidence/cdp-client.mjs";
import {
  buildDirectProbeExpression,
  evaluateDirectProbeInNode,
} from "./direct-probe.mjs";

/**
 * F2 is the exact framework-pattern filter from the legacy JSIMPLIFIER
 * pipeline. It is included unchanged to measure the real cost of its broad
 * short-name rules rather than judging them from their comments.
 */
export const FRAMEWORK_FILTER_STRATEGIES = Object.freeze([
  Object.freeze({
    id: "F0",
    label: "不过滤",
    description: "保留全部候选运行时实体",
    patterns: Object.freeze([]),
  }),
  Object.freeze({
    id: "F1",
    label: "保守框架外壳过滤",
    description: "只删除高置信度的模板引擎、双下划线内部名和混淆器名称",
    patterns: Object.freeze([
      Object.freeze({
        name: "wechat-template-shell",
        source: "^\\$gwx_\\d+$",
        regex: /^\$gwx_\d+$/u,
      }),
      Object.freeze({
        name: "dunder-internal",
        source: "^__\\w+__$",
        regex: /^__\w+__$/u,
      }),
      Object.freeze({
        name: "obfuscator-hex",
        source: "^_0x[a-fA-F0-9]+$",
        regex: /^_0x[a-fA-F0-9]+$/u,
      }),
    ]),
  }),
  Object.freeze({
    id: "F2",
    label: "旧系统完整模式过滤",
    description: "复现旧 S3 的全部 11 条正则，包括单字母编号和 nv_ 前缀",
    patterns: Object.freeze([
      Object.freeze({
        name: "wechat-template-shell",
        source: "^\\$gwx_\\d+$",
        regex: /^\$gwx_\d+$/u,
      }),
      Object.freeze({
        name: "dunder-internal",
        source: "^__\\w+__$",
        regex: /^__\w+__$/u,
      }),
      Object.freeze({
        name: "obfuscator-hex",
        source: "^_0x[a-fA-F0-9]+$",
        regex: /^_0x[a-fA-F0-9]+$/u,
      }),
      Object.freeze({
        name: "underscore-letter-number",
        source: "^_[a-zA-Z]\\d*$",
        regex: /^_[a-zA-Z]\d*$/u,
      }),
      Object.freeze({
        name: "underscore-capitalized",
        source: "^_[A-Z][a-z]+$",
        regex: /^_[A-Z][a-z]+$/u,
      }),
      Object.freeze({
        name: "underscore-lowercase",
        source: "^_[a-z]{2,}$",
        regex: /^_[a-z]{2,}$/u,
      }),
      Object.freeze({
        name: "underscore-lowercase-number",
        source: "^_[a-z]+_\\d+$",
        regex: /^_[a-z]+_\d+$/u,
      }),
      Object.freeze({
        name: "underscore-snake-case",
        source: "^_[a-z]+_[a-z]+$",
        regex: /^_[a-z]+_[a-z]+$/u,
      }),
      Object.freeze({
        name: "wechat-native-wrapper",
        source: "^nv_[a-z]+$",
        regex: /^nv_[a-z]+$/u,
      }),
      Object.freeze({
        name: "one-letter-number",
        source: "^[a-z]\\d+[a-z]?$",
        regex: /^[a-z]\d+[a-z]?$/u,
      }),
      Object.freeze({
        name: "two-letter-number",
        source: "^[a-z]{2}\\d+[a-z]?$",
        regex: /^[a-z]{2}\d+[a-z]?$/u,
      }),
    ]),
  }),
  Object.freeze({
    id: "F3",
    label: "修正后宽口径框架族压力测试",
    description:
      "根据真实语料中的微信模板、渲染、运行时包装和打包器名称扩大过滤范围，仅用于测试安全边界",
    patterns: Object.freeze([
      Object.freeze({
        name: "wechat-template-prefix",
        source: "^\\$gwx_",
        regex: /^\$gwx_/u,
      }),
      Object.freeze({
        name: "wechat-runtime-helper",
        source: "^\\$(?:gwn|gwl)$",
        regex: /^\$(?:gwn|gwl)$/u,
      }),
      Object.freeze({
        name: "wechat-render-runtime",
        source: "^wh$",
        regex: /^wh$/u,
      }),
      Object.freeze({
        name: "wechat-generated-short-name",
        source: "^(?:gra|grb|snap_bb)$",
        regex: /^(?:gra|grb|snap_bb)$/u,
      }),
      Object.freeze({
        name: "wechat-native-or-transpiler-wrapper",
        source: "^(?:nv_|nt_)",
        regex: /^(?:nv_|nt_)/u,
      }),
      Object.freeze({
        name: "bundler-internal",
        source: "^_(?:util|require)$",
        regex: /^_(?:util|require)$/u,
      }),
    ]),
  }),
]);

const TOP_K_VALUES = Object.freeze([100, 250, 500]);

export const runFrameworkFilterAblation = async ({
  outputDir,
  corpusPath,
  wechatReportPath,
  probeEdge = true,
}) => {
  assertInputPath(corpusPath, "Corpus");
  assertInputPath(wechatReportPath, "WeChat probe report");

  const corpus = await collectCorpusStats(corpusPath);
  const entityIds = [...corpus.entities.keys()];
  const nodeValues = evaluateDirectProbeInNode(entityIds);
  const wechatReport = JSON.parse(readFileSync(wechatReportPath, "utf8"));
  const wechatValues = wechatReport.wechatValues;
  if (!wechatValues || typeof wechatValues !== "object") {
    throw new Error(`Missing wechatValues in ${wechatReportPath}`);
  }

  const edgeResult = probeEdge
    ? await collectEdgeValues(entityIds)
    : { available: false, values: null, error: "disabled by command line" };
  const truth = buildGroundTruth({
    entityIds,
    nodeValues,
    wechatValues,
    edgeValues: edgeResult.values,
  });
  const strategies = FRAMEWORK_FILTER_STRATEGIES.map((strategy) =>
    evaluateStrategy({
      strategy,
      corpus,
      truth,
    }),
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    corpusPath,
    wechatReportPath,
    wechatMetadata: {
      generatedAt: wechatReport.generatedAt ?? null,
      runtimeId: wechatReport.runtimeId ?? null,
      sdkVersion: wechatReport.sdkVersion ?? null,
      platform: wechatReport.platform ?? null,
      probeErrorCount: wechatReport.probeErrorCount ?? null,
    },
    edge: {
      available: edgeResult.available,
      error: edgeResult.error,
    },
    corpus: {
      rawRecordCount: corpus.rawRecordCount,
      entityCount: entityIds.length,
      totalOccurrences: corpus.totalOccurrences,
      projectCount: corpus.projects.size,
    },
    groundTruth: {
      nodeWechatComparableCount: truth.nodeWechatComparable.size,
      nodeWechatDifferentialCount: truth.nodeWechatDifferential.size,
      nodeWechatOnlyCount: truth.wechatOnly.size,
      nodeEdgeDifferentialCount:
        truth.nodeEdgeComparable.size === 0
          ? null
          : truth.nodeEdgeDifferential.size,
      note:
        "Node-WeChat 是主真值；Node-Edge 只作为补充宿主验证。缺失观测不判为相同。",
    },
    strategies,
  };
  summary.recommendation = buildRecommendation(summary);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "framework-filter-ablation.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "framework-filter-ablation.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const evaluateStrategy = ({ strategy, corpus, truth }) => {
  const filtered = new Set();
  const matchedPatterns = strategy.patterns.map((pattern) => ({
    name: pattern.name,
    source: pattern.source,
    entityCount: 0,
    occurrences: 0,
    nodeWechatDifferentialCount: 0,
    nodeEdgeDifferentialCount: 0,
    examples: [],
  }));

  for (const [entityId, stats] of corpus.entities) {
    const root = entityRoot(entityId);
    const matchedIndexes = strategy.patterns
      .map((pattern, index) => (pattern.regex.test(root) ? index : -1))
      .filter((index) => index >= 0);
    if (matchedIndexes.length === 0) {
      continue;
    }

    filtered.add(entityId);
    for (const index of matchedIndexes) {
      const patternStats = matchedPatterns[index];
      patternStats.entityCount += 1;
      patternStats.occurrences += stats.occurrences;
      if (truth.nodeWechatDifferential.has(entityId)) {
        patternStats.nodeWechatDifferentialCount += 1;
      }
      if (truth.nodeEdgeDifferential.has(entityId)) {
        patternStats.nodeEdgeDifferentialCount += 1;
      }
      if (patternStats.examples.length < 5) {
        patternStats.examples.push(entityId);
      }
    }
  }

  const retained = [...corpus.entities.keys()].filter(
    (entityId) => !filtered.has(entityId),
  );
  const retainedOccurrences = retained.reduce(
    (sum, entityId) => sum + corpus.entities.get(entityId).occurrences,
    0,
  );
  const filteredOccurrences = corpus.totalOccurrences - retainedOccurrences;
  const removedNodeWechat = intersect(
    filtered,
    truth.nodeWechatDifferential,
  );
  const removedNodeEdge = intersect(filtered, truth.nodeEdgeDifferential);
  const removedAnyDifferential = union(removedNodeWechat, removedNodeEdge);
  const removedWechatOnly = intersect(filtered, truth.wechatOnly);
  const topK = rankRetained(retained, corpus.entities);

  return {
    id: strategy.id,
    label: strategy.label,
    description: strategy.description,
    filteredEntityCount: filtered.size,
    retainedEntityCount: retained.length,
    entityReductionRate: ratio(filtered.size, corpus.entities.size),
    filteredOccurrences,
    occurrenceReductionRate: ratio(
      filteredOccurrences,
      corpus.totalOccurrences,
    ),
    nodeWechatDifferentialRemoved: removedNodeWechat.size,
    nodeEdgeDifferentialRemoved: removedNodeEdge.size,
    anyDifferentialRemoved: removedAnyDifferential.size,
    wechatOnlyRemoved: removedWechatOnly.size,
    safetyPassed: removedAnyDifferential.size === 0,
    topK: TOP_K_VALUES.map((k) => {
      const selected = new Set(topK.slice(0, k));
      return {
        k,
        retainedProbed: selected.size,
        nodeWechatDifferentialFound: intersect(
          selected,
          truth.nodeWechatDifferential,
        ).size,
        nodeEdgeDifferentialFound: intersect(
          selected,
          truth.nodeEdgeDifferential,
        ).size,
      };
    }),
    probesToFindAllKnownDifferentials:
      removedAnyDifferential.size === 0
        ? findLastDifferentialRank(topK, truth.anyDifferential)
        : null,
    patternMatches: matchedPatterns,
    removedDifferentialExamples: [...removedAnyDifferential]
      .sort()
      .slice(0, 20),
    removedWechatOnlyExamples: [...removedWechatOnly]
      .sort()
      .slice(0, 20),
  };
};

const collectCorpusStats = async (filePath) => {
  const entities = new Map();
  const projects = new Set();
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let rawRecordCount = 0;
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
      if (typeof record.entityId !== "string" || record.entityId === "") {
        continue;
      }
      rawRecordCount += 1;
      let stats = entities.get(record.entityId);
      if (!stats) {
        stats = { occurrences: 0, projects: new Set() };
        entities.set(record.entityId, stats);
      }
      stats.occurrences += 1;
      const project = projectName(record);
      if (project !== null) {
        stats.projects.add(project);
        projects.add(project);
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  return {
    rawRecordCount,
    totalOccurrences: [...entities.values()].reduce(
      (sum, stats) => sum + stats.occurrences,
      0,
    ),
    entities,
    projects,
  };
};

const collectEdgeValues = async (entityIds) => {
  const profileDir = path.join(process.cwd(), ".runtime", "edge-profile");
  mkdirSync(profileDir, { recursive: true });
  try {
    const values = await withCdpPage(
      { browserPath: findBrowserPath(), profileDir },
      ({ evaluate }) => evaluate(buildDirectProbeExpression(entityIds)),
    );
    return { available: true, values, error: null };
  } catch (error) {
    return {
      available: false,
      values: null,
      error: String(error?.message ?? error),
    };
  }
};

const buildGroundTruth = ({
  entityIds,
  nodeValues,
  wechatValues,
  edgeValues,
}) => {
  const nodeWechatComparable = new Set();
  const nodeWechatDifferential = new Set();
  const nodeEdgeComparable = new Set();
  const nodeEdgeDifferential = new Set();
  const wechatOnly = new Set();

  for (const entityId of entityIds) {
    const node = normalizeObservation(nodeValues[entityId]);
    const wechat = wechatValues[entityId];
    if (isObservation(wechat)) {
      nodeWechatComparable.add(entityId);
      if (!sameObservation(node, normalizeObservation(wechat))) {
        nodeWechatDifferential.add(entityId);
      }
      if (wechat.existence === true && node.existence !== true) {
        wechatOnly.add(entityId);
      }
    }

    if (edgeValues && isObservation(edgeValues[entityId])) {
      nodeEdgeComparable.add(entityId);
      if (
        !sameObservation(node, normalizeObservation(edgeValues[entityId]))
      ) {
        nodeEdgeDifferential.add(entityId);
      }
    }
  }

  return {
    nodeWechatComparable,
    nodeWechatDifferential,
    nodeEdgeComparable,
    nodeEdgeDifferential,
    wechatOnly,
    anyDifferential: union(
      nodeWechatDifferential,
      nodeEdgeDifferential,
    ),
  };
};

const normalizeObservation = (value) => {
  if (!value || typeof value !== "object" || value.error) {
    return null;
  }
  return {
    existence: value.existence === true,
    type: typeof value.type === "string" ? value.type : "undefined",
    callability: value.callability === true,
  };
};

const isObservation = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sameObservation = (left, right) =>
  left !== null &&
  right !== null &&
  left.existence === right.existence &&
  left.type === right.type &&
  left.callability === right.callability;

const rankRetained = (retained, entityStats) =>
  [...retained].sort((left, right) => {
    const occurrenceDifference =
      entityStats.get(right).occurrences - entityStats.get(left).occurrences;
    return occurrenceDifference || left.localeCompare(right);
  });

const findLastDifferentialRank = (ranked, differentials) => {
  let lastRank = null;
  for (let index = 0; index < ranked.length; index += 1) {
    if (differentials.has(ranked[index])) {
      lastRank = index + 1;
    }
  }
  return lastRank;
};

const buildRecommendation = (summary) => {
  const conservative = summary.strategies.find((item) => item.id === "F1");
  const legacy = summary.strategies.find((item) => item.id === "F2");
  const stress = summary.strategies.find((item) => item.id === "F3");
  const stressNote =
    stress && !stress.safetyPassed
      ? ` 宽口径压力配置虽然缩减了 ${percent(stress.entityReductionRate)} 的实体，却删除了 ${stress.nodeWechatDifferentialRemoved} 个真实 Node-微信差异和 ${stress.wechatOnlyRemoved} 个微信独有 API，不能用于正式决策。`
      : "";

  if (!conservative.safetyPassed) {
    return {
      decision: "do-not-enable",
      reason:
        `保守过滤已删除至少一个真实跨运行时差异实体，不能作为候选删除器。${stressNote}`,
      selectedStrategy: "F0",
    };
  }
  if (!legacy.safetyPassed) {
    return {
      decision: "enable-conservative-only",
      reason:
        `旧完整规则删除了真实差异实体，保守规则未删除；框架过滤若保留，只能采用保守模式。${stressNote}`,
      selectedStrategy: "F1",
    };
  }
  if (conservative.entityReductionRate < 0.02) {
    return {
      decision: "keep-as-ranking-only",
      reason:
        `旧规则未删除真实差异，但只减少 ${percent(legacy.occurrenceReductionRate)} 的调用点；保守过滤的实体缩减不足 2%，固定预算收益也近似噪声，不值得进入主决策链。${stressNote}`,
      selectedStrategy: "F0",
    };
  }
  return {
    decision: "keep-as-pre-probe-optimization",
    reason:
      `保守过滤删除部分候选且未触发已知真值损失，可作为探测前的保守优化。${stressNote}`,
    selectedStrategy: "F1",
  };
};

const projectName = (record) => {
  for (const key of ["project", "projectName", "projectId"]) {
    if (typeof record[key] === "string" && record[key] !== "") {
      return record[key];
    }
  }
  return null;
};

const entityRoot = (entityId) => entityId.split(".")[0];

const intersect = (left, right) =>
  new Set([...left].filter((value) => right.has(value)));

const union = (left, right) => new Set([...left, ...right]);

const ratio = (numerator, denominator) =>
  denominator === 0 ? null : numerator / denominator;

const percent = (value) =>
  value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;

const assertInputPath = (filePath, label) => {
  if (!existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 框架模式过滤真实消融实验",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    "## 实验口径",
    "",
    `主语料包含 ${summary.corpus.rawRecordCount} 条候选记录、${summary.corpus.entityCount} 个去重运行时实体、${summary.corpus.projectCount} 个项目。`,
    "",
    `主真值为真实 Node 与真实微信开发者工具报告：${summary.groundTruth.nodeWechatComparableCount} 个实体可比较，其中 ${summary.groundTruth.nodeWechatDifferentialCount} 个存在实际差异。`,
    "",
    `补充真值为真实 Node 与真实 Edge：${summary.edge.available ? `${summary.groundTruth.nodeEdgeDifferentialCount} 个实体存在差异。` : `本次未取得，原因：${summary.edge.error}`}`,
    "",
    "框架过滤定义为“在探测前直接删除命中名称模式的实体”，不是只调整排序。",
    "",
    "## 消融结果",
    "",
    "| 策略 | 删除实体 | 实体缩减 | 删除调用点占比 | 删除 Node-微信差异 | 删除 Node-Edge 差异 | 删除微信独有 API | 已知真值安全性 |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
  ];

  for (const strategy of summary.strategies) {
    lines.push(
      `| ${strategy.id} ${strategy.label} | ${strategy.filteredEntityCount} | ${percent(strategy.entityReductionRate)} | ${percent(strategy.occurrenceReductionRate)} | ${strategy.nodeWechatDifferentialRemoved} | ${strategy.nodeEdgeDifferentialRemoved} | ${strategy.wechatOnlyRemoved} | ${strategy.safetyPassed ? "通过" : "失败"} |`,
    );
  }

  lines.push(
    "",
    "## 固定探测预算",
    "",
    "| 策略 | 预算 | 找到 Node-微信差异 | 找到 Node-Edge 差异 |",
    "|---|---:|---:|---:|",
  );
  for (const strategy of summary.strategies) {
    for (const budget of strategy.topK) {
      lines.push(
        `| ${strategy.id} | ${budget.k} | ${budget.nodeWechatDifferentialFound}/${summary.groundTruth.nodeWechatDifferentialCount} | ${summary.groundTruth.nodeEdgeDifferentialCount === null ? "n/a" : `${budget.nodeEdgeDifferentialFound}/${summary.groundTruth.nodeEdgeDifferentialCount}`} |`,
      );
    }
  }

  lines.push("", "## 规则明细", "");
  for (const strategy of summary.strategies.filter(
    (item) => item.patternMatches.length > 0,
  )) {
    lines.push(
      `### ${strategy.id} ${strategy.label}`,
      "",
      "| 规则 | 删除实体 | 删除调用点 | 其中真实 Node-微信差异 |",
      "|---|---:|---:|---:|",
    );
    for (const pattern of strategy.patternMatches) {
      lines.push(
        `| \`${pattern.source}\` | ${pattern.entityCount} | ${pattern.occurrences} | ${pattern.nodeWechatDifferentialCount} |`,
      );
    }
    lines.push("");
  }

  const failed = summary.strategies.filter(
    (strategy) => !strategy.safetyPassed,
  );
  if (failed.length > 0) {
    lines.push("## 被错误删除的真实差异示例", "");
    for (const strategy of failed) {
      lines.push(
        `### ${strategy.id} ${strategy.label}`,
        "",
        ...strategy.removedDifferentialExamples.map(
          (entityId) => `- \`${entityId}\``,
        ),
        "",
      );
    }
  }

  lines.push(
    "## 结论",
    "",
    `建议：**${summary.recommendation.decision}**。${summary.recommendation.reason}`,
    "",
    `选定的候选策略：\`${summary.recommendation.selectedStrategy}\`。`,
    "",
    "“已知真值安全性通过”只表示当前真实观测集没有检出被删除差异，不等同于证明该名称规则普遍安全；未观测运行时和未覆盖样本仍需按保守原则处理。",
    "",
    "固定预算按实体在真实语料中的出现次数从高到低排序；它衡量的是“同样只探测多少实体时还能发现多少真实差异”，不是模型准确率。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parseFrameworkFilterAblationArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/framework-filter-ablation"),
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    wechatReportPath: path.resolve(
      "datasets/wechat-live/wechat-probe-report.json",
    ),
    probeEdge: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    switch (argument) {
      case "--out":
        options.outputDir = path.resolve(next);
        index += 1;
        break;
      case "--corpus":
        options.corpusPath = path.resolve(next);
        index += 1;
        break;
      case "--wechat-report":
        options.wechatReportPath = path.resolve(next);
        index += 1;
        break;
      case "--skip-edge":
        options.probeEdge = false;
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

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseFrameworkFilterAblationArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/framework-filter-ablation.mjs [options]",
        "",
        "Options:",
        "  --out <path>             Output directory",
        "  --corpus <path>          Real miniapp JSONL corpus",
        "  --wechat-report <path>   Real WeChat probe report",
        "  --skip-edge              Skip the supplemental Edge probe",
      ].join("\n"),
    );
  } else {
    const summary = await runFrameworkFilterAblation(options);
    console.log(
      JSON.stringify(
        {
          corpus: summary.corpus,
          groundTruth: summary.groundTruth,
          recommendation: summary.recommendation,
          strategies: summary.strategies.map((strategy) => ({
            id: strategy.id,
            label: strategy.label,
            filteredEntityCount: strategy.filteredEntityCount,
            entityReductionRate: strategy.entityReductionRate,
            occurrenceReductionRate: strategy.occurrenceReductionRate,
            nodeWechatDifferentialRemoved:
              strategy.nodeWechatDifferentialRemoved,
            nodeEdgeDifferentialRemoved:
              strategy.nodeEdgeDifferentialRemoved,
            wechatOnlyRemoved: strategy.wechatOnlyRemoved,
            safetyPassed: strategy.safetyPassed,
          })),
        },
        null,
        2,
      ),
    );
  }
}
