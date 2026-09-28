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

export const runResultReuseValidation = async ({
  outputDir,
  corpusPath,
  wechatReportPaths,
  nodeRepeatCount = 20,
  edgeRepeatCount = 5,
  frequentThreshold = 100,
}) => {
  assertInputPath(corpusPath, "Corpus");
  for (const reportPath of wechatReportPaths) {
    assertInputPath(reportPath, "WeChat probe report");
  }

  const corpus = await aggregateCorpus(corpusPath);
  const wechatReports = wechatReportPaths.map((reportPath) => ({
    reportPath,
    report: JSON.parse(readFileSync(reportPath, "utf8")),
  }));
  const entityIds = [...new Set(
    wechatReports.flatMap(
      ({ report }) => Object.keys(report.wechatValues ?? {}),
    ),
  )].sort();

  const nodeSnapshots = [];
  for (let index = 0; index < nodeRepeatCount; index += 1) {
    nodeSnapshots.push(evaluateDirectProbeInNode(entityIds));
  }
  const edgeResult = await repeatEdgeProbe(entityIds, edgeRepeatCount);
  const wechatSnapshots = wechatReports.map(
    ({ report }) => report.wechatValues,
  );

  const repeatability = {
    node: snapshotStability(nodeSnapshots),
    edge: edgeResult.available
      ? snapshotStability(edgeResult.snapshots)
      : {
          available: false,
          error: edgeResult.error,
        },
    // 重复性比较需要至少两份报告。只有一份时不能报「稳定」——一次采样谈不上
    // 可重复，那会把「没测」说成「测得很好」。
    wechat:
      wechatSnapshots.length >= 2
        ? compareSnapshots(wechatSnapshots[0], wechatSnapshots[1])
        : {
            available: false,
            repeatCount: wechatSnapshots.length,
            // 显式置 null：调用方用 `=== 0` 判断「稳定」，null 会落到 false
            // 分支（保守），而渲染层要把它显示成「—」而不是 undefined。
            differentObservationCount: null,
            commonEntityCount: null,
            reason:
              "重复性比较需要至少两份微信探针报告；当前只有一份。" +
              "第二份曾在 datasets/wechat-repeat-validation 下留档，2026-09-23 的" +
              "文件清理把它删掉了（当时没发现本脚本依赖它），需要重采。",
          },
  };
  const firstNode = nodeSnapshots[0];
  const firstWechat = wechatSnapshots[0];
  const crossRuntime = compareSnapshots(firstNode, firstWechat);
  const repeatedStable = repeatability.wechat.differentObservationCount === 0;
  const frequentEntities = [...corpus.entities.entries()]
    .filter(([, stats]) => stats.occurrences >= frequentThreshold)
    .sort(
      (left, right) =>
        right[1].occurrences - left[1].occurrences ||
        left[0].localeCompare(right[0]),
    );
  const frequentCrossRuntime = frequentEntities
    .filter(([entityId]) => Object.hasOwn(firstNode, entityId) &&
      Object.hasOwn(firstWechat, entityId))
    .map(([entityId, stats]) => ({
      entityId,
      occurrences: stats.occurrences,
      projectCount: stats.projects.size,
      nodeObservation: firstNode[entityId],
      wechatObservation: firstWechat[entityId],
      differential: !sameObservation(
        firstNode[entityId],
        firstWechat[entityId],
      ),
    }));
  const frequentDifferential = frequentCrossRuntime.filter(
    (item) => item.differential,
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    corpusPath,
    wechatReportPaths,
    config: {
      nodeRepeatCount,
      edgeRepeatCount,
      frequentThreshold,
    },
    corpus: {
      recordCount: corpus.recordCount,
      entityCount: corpus.entities.size,
      projectCount: corpus.projects.size,
    },
    repeatability,
    crossRuntime: {
      commonEntityCount: crossRuntime.commonEntityCount,
      differentObservationCount: crossRuntime.differentObservationCount,
    },
    frequent: {
      entityCount: frequentCrossRuntime.length,
      differentialEntityCount: frequentDifferential.length,
      differentialRate: ratio(
        frequentDifferential.length,
        frequentCrossRuntime.length,
      ),
      examples: frequentCrossRuntime.slice(0, 30),
      differentialExamples: frequentDifferential.slice(0, 20),
    },
    decision: buildDecision({ repeatability, frequentDifferential }),
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "result-reuse-validation.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "result-reuse-validation.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
};

const aggregateCorpus = async (filePath) => {
  const entities = new Map();
  const projects = new Set();
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let recordCount = 0;

  try {
    for await (const line of lines) {
      if (line.trim() === "") {
        continue;
      }
      const record = JSON.parse(line);
      if (typeof record.entityId !== "string" || record.entityId === "") {
        continue;
      }
      recordCount += 1;
      let stats = entities.get(record.entityId);
      if (!stats) {
        stats = { occurrences: 0, projects: new Set() };
        entities.set(record.entityId, stats);
      }
      stats.occurrences += 1;
      if (typeof record.project === "string" && record.project !== "") {
        stats.projects.add(record.project);
        projects.add(record.project);
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  return { recordCount, entities, projects };
};

const repeatEdgeProbe = async (entityIds, repeatCount) => {
  const profileDir = path.join(process.cwd(), ".runtime", "edge-profile");
  mkdirSync(profileDir, { recursive: true });
  try {
    const snapshots = await withCdpPage(
      { browserPath: findBrowserPath(), profileDir },
      async ({ evaluate }) => {
        const values = [];
        for (let index = 0; index < repeatCount; index += 1) {
          values.push(
            await evaluate(buildDirectProbeExpression(entityIds)),
          );
        }
        return values;
      },
    );
    return { available: true, snapshots, error: null };
  } catch (error) {
    return {
      available: false,
      snapshots: [],
      error: String(error?.message ?? error),
    };
  }
};

const snapshotStability = (snapshots) => {
  const serialized = snapshots.map(stableStringify);
  return {
    available: true,
    repeatCount: snapshots.length,
    uniqueSnapshotCount: new Set(serialized).size,
    stable: new Set(serialized).size === 1,
  };
};

const compareSnapshots = (left, right) => {
  const commonEntityCount = Object.keys(left).filter((entityId) =>
    Object.hasOwn(right, entityId),
  ).length;
  let differentObservationCount = 0;
  const examples = [];

  for (const entityId of Object.keys(left)) {
    if (!Object.hasOwn(right, entityId)) {
      continue;
    }
    if (!sameObservation(left[entityId], right[entityId])) {
      differentObservationCount += 1;
      if (examples.length < 20) {
        examples.push({
          entityId,
          left: left[entityId],
          right: right[entityId],
        });
      }
    }
  }

  return {
    available: true,
    commonEntityCount,
    differentObservationCount,
    examples,
  };
};

const sameObservation = (left, right) =>
  JSON.stringify(normalizeObservation(left)) ===
  JSON.stringify(normalizeObservation(right));

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

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const buildDecision = ({ repeatability, frequentDifferential }) => ({
  safeStaticResolutionCache: true,
  safeRuntimeObservationCache:
    repeatability.wechat.differentObservationCount === 0,
  safeApiNameOnlyCache: false,
  frequencyCanGrantFold: false,
  frequencyCanAdmitCache: true,
  reason:
    (repeatability.wechat.differentObservationCount === null
      ? "微信重复性验证不可用（缺少第二份探针报告）；"
      : `同一微信 SDK 与同一运行时指纹下重复观测差异数为 ${repeatability.wechat.differentObservationCount}；`) +
    `但高频实体中仍有 ${frequentDifferential.length} 个存在 Node-微信差异，因此缓存键必须包含目标运行时，频率不能变成安全结论。`,
});

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
    "# R97 结果复用与名单缓存验证",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    "## 实验口径",
    "",
    `真实语料包含 ${summary.corpus.recordCount} 条记录、${summary.corpus.entityCount} 个实体和 ${summary.corpus.projectCount} 个项目。`,
    "",
    `微信结果使用两份独立真实开发者工具报告，SDK 均为同一环境；Node 重复探测 ${summary.config.nodeRepeatCount} 次，Edge 重复探测 ${summary.config.edgeRepeatCount} 次。`,
    "",
    "## 重复性结果",
    "",
    "| 运行时 | 重复次数 | 不同快照数 | 是否稳定 |",
    "|---|---:|---:|---|",
    `| Node | ${summary.repeatability.node.repeatCount} | ${summary.repeatability.node.uniqueSnapshotCount} | ${summary.repeatability.node.stable ? "是" : "否"} |`,
  ];

  if (summary.repeatability.edge.available) {
    lines.push(
      `| Edge | ${summary.repeatability.edge.repeatCount} | ${summary.repeatability.edge.uniqueSnapshotCount} | ${summary.repeatability.edge.stable ? "是" : "否"} |`,
    );
  } else {
    lines.push(
      `| Edge | n/a | n/a | 未取得：${summary.repeatability.edge.error} |`,
    );
  }
  lines.push(
    `| 微信开发者工具 | ${summary.wechatReportPaths.length} | ${summary.repeatability.wechat.differentObservationCount ?? "—"} 个差异观测 | ${summary.repeatability.wechat.differentObservationCount === 0 ? "是" : "否"} |`,
    "",
    summary.repeatability.wechat.available
      ? `微信两份报告共有 ${summary.repeatability.wechat.commonEntityCount} 个可比实体。`
      : `微信重复性验证不可用：${summary.repeatability.wechat.reason}`,
    "",
    "## 频率与跨运行时稳定性",
    "",
    `出现次数不少于 ${summary.config.frequentThreshold} 的高频实体有 ${summary.frequent.entityCount} 个，其中 Node 与微信观测仍不同的有 ${summary.frequent.differentialEntityCount} 个，占 ${percent(summary.frequent.differentialRate)}。`,
    "",
    "| 高频实体 | 调用点 | 项目数 | Node | 微信 | 是否差异 |",
    "|---|---:|---:|---|---|---|",
  );
  for (const item of summary.frequent.examples.slice(0, 15)) {
    lines.push(
      `| \`${item.entityId}\` | ${item.occurrences} | ${item.projectCount} | ${observationText(item.nodeObservation)} | ${observationText(item.wechatObservation)} | ${item.differential ? "是" : "否"} |`,
    );
  }

  lines.push(
    "",
    "## 结论",
    "",
    `静态实体解析结果可以缓存：相同源码和相同绑定身份下，“\`wx[key]\` 实际对应哪个 API”不会因为运行时变化。`,
    "",
    "运行时语义结果可以在严格条件下复用：必须使用环境指纹、SDK 或运行时版本、目标运行时、语义契约、访问上下文、证据版本和有效期共同组成缓存键。",
    "",
    "不能建立只按 API 名称或出现频率判断的全局名单。`wx.request` 即使在很多项目中频繁出现，也只能说明值得预探测；它是否在 Node、Edge、微信中具有相同语义，仍必须按环境分别验证。",
    "",
    "频率阈值适合用于缓存预热和优先探测，不应成为 `FOLD` 的准入条件。任何缓存命中最终仍要经过正常决策门。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

const observationText = (value) => {
  const observation = normalizeObservation(value);
  if (!observation) {
    return "未观测";
  }
  return `${observation.existence ? "存在" : "不存在"} / ${observation.type} / ${observation.callability ? "可调用" : "不可调用"}`;
};

/**
 * 发现可用的微信探针报告。
 *
 * 这个脚本原本硬编码两份报告（`wechat-live` + `wechat-repeat-validation`）来
 * 比较**重复观测是否稳定**。第二份在 2026-09-23 的文件清理中被删掉，于是整个
 * 脚本直接抛错——清理时没人发现它依赖那个目录。改成自动发现：有几份用几份，
 * 报告里如实写出份数，只有一份时「重复性结论」不成立。
 */
const discoverWechatReports = () =>
  [
    "datasets/wechat-live/wechat-probe-report.json",
    "datasets/wechat-repeat-validation/wechat-probe-report.json",
  ]
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => existsSync(candidate));

export const parseResultReuseValidationArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/result-reuse-validation"),
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    wechatReportPaths: discoverWechatReports(),
    nodeRepeatCount: 20,
    edgeRepeatCount: 5,
    frequentThreshold: 100,
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
        options.wechatReportPaths = [path.resolve(next)];
        index += 1;
        break;
      case "--wechat-repeat-report":
        options.wechatReportPaths.push(path.resolve(next));
        index += 1;
        break;
      case "--node-repeat":
        options.nodeRepeatCount = positiveInteger(argument, next);
        index += 1;
        break;
      case "--edge-repeat":
        options.edgeRepeatCount = positiveInteger(argument, next);
        index += 1;
        break;
      case "--frequent-threshold":
        options.frequentThreshold = positiveInteger(argument, next);
        index += 1;
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

const positiveInteger = (argument, value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${argument} requires a positive integer`);
  }
  return parsed;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseResultReuseValidationArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/result-reuse-validation.mjs [options]",
        "",
        "Options:",
        "  --out <path>                 Output directory",
        "  --corpus <path>              Real miniapp JSONL corpus",
        "  --wechat-report <path>       First real WeChat probe report",
        "  --wechat-repeat-report <p>   Repeated real WeChat probe report",
        "  --node-repeat <n>            Node probe repetitions",
        "  --edge-repeat <n>            Edge probe repetitions",
        "  --frequent-threshold <n>     High-frequency occurrence threshold",
      ].join("\n"),
    );
  } else {
    const summary = await runResultReuseValidation(options);
    console.log(
      JSON.stringify(
        {
          repeatability: summary.repeatability,
          crossRuntime: summary.crossRuntime,
          frequent: {
            entityCount: summary.frequent.entityCount,
            differentialEntityCount:
              summary.frequent.differentialEntityCount,
            differentialRate: summary.frequent.differentialRate,
          },
          decision: summary.decision,
        },
        null,
        2,
      ),
    );
  }
}
