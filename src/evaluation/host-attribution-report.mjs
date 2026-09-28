import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectBrowserObservations } from "../evidence/browser-probe.mjs";
import { collectLanguageObservations } from "../evidence/language-probe.mjs";
import { collectNodeObservations } from "../evidence/node-probe.mjs";
import { importWechatProbeResult } from "../evidence/wechat-probe.mjs";
import {
  HOST_GLOBAL_ROOTS,
  LANGUAGE_BUILTIN_ROOTS,
} from "../global-roots.mjs";
import { HOST_RUNTIME_ROOTS } from "../contract-builder.mjs";
import { NODE_BUILTIN_ROOTS } from "../module-runtime.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { readDeduplicatedCorpusRecords } from "./run-benchmark.mjs";

const languageRoots = new Set(LANGUAGE_BUILTIN_ROOTS);
const knownHostRoots = new Set(HOST_GLOBAL_ROOTS);
const mappedByRoot = new Map();
// 直接读决策链用的那份表，避免测量脚本和真实映射各维护一份而漂移。
for (const entry of HOST_RUNTIME_ROOTS) {
  for (const root of entry.roots) {
    mappedByRoot.set(root, entry.runtimeId);
  }
}

/**
 * 宿主归属测量。
 *
 * `inferRequiredRuntimeIds` 决定「代码用了这个全局，必须把哪个宿主拉进比较」。
 * 这份名单的宽窄直接决定两类错误：
 *
 * - 漏映射：某个宿主专属全局不在名单里，目标集又没声明该宿主，R97 就可能
 *   把它当成跨宿主一致而放行；
 * - 误映射：把跨宿主全局绑到单一宿主，会把无关宿主强行拉进目标集，制造过度保护。
 *
 * 这里不靠「语料里见过」补名单，而是对每个根节点**实测**它在各宿主上的存在性，
 * 再把「只有一个宿主存在」的项列成候选，交由人按平台规范确认。
 */
export const runHostAttributionReport = async ({
  outputDir = null,
  corpusPath,
  perEntityCap = 5,
  wechatReportPath = null,
  extraRoots = [],
  generatedAt = new Date().toISOString(),
}) => {
  const roots = await collectRoots({ corpusPath, perEntityCap, extraRoots });
  const entityDimensions = Object.fromEntries(
    roots.map((root) => [root, ["existence", "type"]]),
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
  const wechat = loadWechat({ entityDimensions, wechatReportPath, observedAt });

  const rows = roots.map((root) => {
    const exists = {
      language: language.observations[root]?.values?.existence ?? null,
      node: node.observations[root]?.values?.existence ?? null,
      edge: edge.observations[root]?.values?.existence ?? null,
      wechat: wechat?.observations[root]?.values?.existence ?? null,
    };
    const hosts = Object.entries(exists)
      .filter(([, value]) => value === true)
      .map(([host]) => host);
    return {
      root,
      knownHostRoot: knownHostRoots.has(root),
      mappedRuntimeId: mappedByRoot.get(root) ?? null,
      exists,
      existingHosts: hosts,
      verdict: classify({
        hosts,
        exists,
        mappedRuntimeId: mappedByRoot.get(root) ?? null,
      }),
    };
  });

  const candidates = rows.filter(
    (row) => row.verdict === "host_exclusive_unmapped",
  );
  const summary = {
    generatedAt,
    corpusPath,
    sampling: { perEntityCap },
    rootCount: rows.length,
    hostExclusiveUnmappedCount: candidates.length,
    hostExclusiveUnmapped: candidates.map((row) => ({
      root: row.root,
      host: row.existingHosts[0],
      knownHostRoot: row.knownHostRoot,
    })),
    rows,
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "host-attribution.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDir, "host-attribution.md"),
      renderMarkdown(summary),
      "utf8",
    );
  }
  return summary;
};

const collectRoots = async ({ corpusPath, perEntityCap, extraRoots }) => {
  const roots = new Set(extraRoots);
  // 先把项目自己已经当成「宿主全局」的名字全部纳入审计，再看语料里还冒出哪些。
  for (const root of HOST_GLOBAL_ROOTS) {
    if (!languageRoots.has(root)) {
      roots.add(root);
    }
  }
  if (corpusPath && existsSync(corpusPath)) {
    const records = await readDeduplicatedCorpusRecords(
      corpusPath,
      Number.POSITIVE_INFINITY,
      { perEntityCap },
    );
    for (const record of records) {
      const root = String(record.entityId).split(".")[0];
      if (!languageRoots.has(root)) {
        roots.add(root);
      }
    }
  }
  return [...roots].sort();
};

const loadWechat = ({ entityDimensions, wechatReportPath, observedAt }) => {
  if (!wechatReportPath || !existsSync(wechatReportPath)) {
    return null;
  }
  try {
    return importWechatProbeResult({
      report: JSON.parse(readFileSync(wechatReportPath, "utf8")),
      entityDimensions,
      observedAt,
    });
  } catch {
    return null;
  }
};

/**
 * 判定只在「证据明确」时才给结论：
 *
 * - 多宿主存在 → 跨宿主全局，不应绑定到单一宿主；
 * - 恰好一个宿主存在，且该宿主已映射 → 已覆盖；
 * - 恰好一个宿主存在，但没有映射 → 候选，需要按平台规范确认；
 * - 全都不存在 → 应用自带全局或测试框架全局，不是宿主能力。
 */
export const classify = ({ hosts, exists, mappedRuntimeId = null }) => {
  const observed = Object.values(exists).filter(
    (value) => value !== null,
  ).length;
  if (observed === 0) {
    return "unobserved";
  }
  if (hosts.length === 0) {
    return "absent_everywhere";
  }
  if (hosts.length > 1) {
    return "cross_host";
  }
  return mappedRuntimeId === null
    ? "host_exclusive_unmapped"
    : "host_exclusive_mapped";
};

const renderMarkdown = (summary) => {
  const lines = [
    "# R97 宿主归属测量",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `参与测量的根节点：${summary.rootCount}`,
    "",
    "`inferRequiredRuntimeIds` 决定「代码用了这个全局，必须把哪个宿主拉进比较」。",
    "名单太窄会漏掉宿主专属 API（目标集没声明该宿主时可能放行），太宽会把无关宿主",
    "拉进目标集制造过度保护。这份测量不靠「语料里见过」补名单，而是实测每个根节点在",
    "各宿主上的存在性，把「只有一个宿主存在且尚未映射」的项列成候选。",
    "",
    "## 候选：宿主专属但未映射",
    "",
  ];
  if (summary.hostExclusiveUnmapped.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 根节点 | 唯一存在的宿主 | 是否已在 HOST_GLOBAL_ROOTS |",
      "|---|---|---|",
    );
    for (const item of summary.hostExclusiveUnmapped) {
      lines.push(
        `| ${item.root} | ${item.host} | ${item.knownHostRoot ? "是" : "否"} |`,
      );
    }
    lines.push(
      "",
      "这些是候选，不是自动生效的名单。加进 `HOST_RUNTIME_ROOTS` 前需要按平台规范确认：",
      "测量只说明「当前这台机器上的这个版本如此」，不说明规范如此。",
      "",
    );
  }
  lines.push(
    "## 完整测量表",
    "",
    "| 根节点 | 判定 | 语言基线 | Node | Edge | 微信 | 已映射到 |",
    "|---|---|---|---|---|---|---|",
  );
  for (const row of summary.rows) {
    lines.push(
      `| ${row.root} | ${row.verdict ?? "-"} | ${cell(row.exists.language)} | ${cell(row.exists.node)} | ${cell(row.exists.edge)} | ${cell(row.exists.wechat)} | ${row.mappedRuntimeId ?? "-"} |`,
    );
  }
  lines.push(
    "",
    "判定含义：`cross_host` 多个宿主都有，不应绑定到单一宿主；`absent_everywhere` 全都不存在，",
    "属于应用自定义或测试框架全局；`host_exclusive_unmapped` 只有一个宿主存在且未映射，是候选；",
    "其余为已覆盖或未观测。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

const cell = (value) => (value === null ? "未观测" : value ? "有" : "无");

export const parseHostAttributionArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets/host-attribution"),
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
  const options = parseHostAttributionArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/host-attribution-report.mjs [--out <path>] [--corpus <path>] [--per-entity-cap <n>]",
    );
  } else {
    const summary = await runHostAttributionReport(options);
    console.log(
      JSON.stringify(
        {
          rootCount: summary.rootCount,
          hostExclusiveUnmappedCount: summary.hostExclusiveUnmappedCount,
          hostExclusiveUnmapped: summary.hostExclusiveUnmapped,
        },
        null,
        2,
      ),
    );
  }
}
