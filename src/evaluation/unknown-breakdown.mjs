import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_PROVENANCE,
  KNOWLEDGE_STATE,
  REASON_CODE,
  TARGET_RUNTIME_SOURCE,
} from "../constants.mjs";
import { analyzeAndDecide } from "../pipeline.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import {
  buildRuntimeEvidence,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "./run-benchmark.mjs";
import { buildRuntimeFingerprintEvidence } from "./runtime-fingerprint.mjs";

/**
 * 名称看起来像微信运行时的私有全局。
 *
 * 注意这里只做**名字形状**的粗筛：真正的归属由 `bindingRef.inFileDefinition`
 * 判定。实测（tools/audit-implicit-globals.mjs）表明 `wh`、`$gwx`、`gra`、`grb`
 * 这一族在语料里 100% 由被分析文件自己赋值（`wh=$gwh();`，wcc 编译产物的隐式
 * 全局写法），属于代码自身定义，不是宿主能力；只有 `__wxConfig`、
 * `__subContextEngine__` 这类在文件内找不到赋值的名字才是宿主注入。
 */
const WECHAT_BASE_LIBRARY_PATTERN =
  /^(\$gwx|\$gwn|\$gwl|\$gwh|wh|gra|grb|nt_\d|nv_|__wx|__subContextEngine__)/u;

/** 微信公开宿主 API。 */
const WECHAT_PUBLIC_ROOTS = new Set([
  "App",
  "Behavior",
  "Component",
  "Page",
  "getApp",
  "getCurrentPages",
  "wx",
]);

/**
 * 未决构成报告。
 *
 * 目标确认之后剩下的 UNKNOWN 就是这套方法的真实天花板。这份报告把它拆开，回答
 * 「哪些是 v1 范围外、哪些是安全上必须保持未知、哪些其实还能推进」——此前只能
 * 说一句「UNKNOWN 占 62.88%」，说不清里面是什么。
 */
export const runUnknownBreakdown = async ({
  corpusPath,
  perEntityCap = 5,
  wechatReportPath,
  outputDir = null,
  generatedAt = new Date().toISOString(),
}) => {
  if (!existsSync(corpusPath)) {
    throw new Error(`Corpus file does not exist: ${corpusPath}`);
  }
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

  const probeTargets = [
    RUNTIME_IDS.LANGUAGE,
    RUNTIME_IDS.NODE,
    RUNTIME_IDS.EDGE,
    RUNTIME_IDS.WECHAT,
  ];
  const plans = records.flatMap((record) =>
    analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      targetRuntimeIds: probeTargets,
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: "benchmark-policy-v1",
      contractVersion: "benchmark-v1",
    }).decisions,
  );
  const evidence = await buildRuntimeEvidence(
    plans,
    probeTargets,
    "benchmark-policy-v1",
    wechatReportPath,
  );

  const buckets = new Map();
  const unknownRoots = new Map();
  const codeDefinedRoots = new Map();
  const byState = { FOLD: 0, PROTECT: 0, UNKNOWN: 0 };

  for (const record of records) {
    const decision = analyzeAndDecide({
      source: record.generatedSource,
      filePath: record.file,
      targetRuntimeIds: [],
      targetRuntimeSource: TARGET_RUNTIME_SOURCE.UNKNOWN,
      targetRuntimeEvidence: buildConfirmedTarget(record, generatedAt),
      evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
      policyVersion: "benchmark-policy-v1",
      contractVersion: "benchmark-v1",
      evidenceRecords: evidence.records,
    }).decisions[0];
    const state = decision?.decision.knowledgeState ?? KNOWLEDGE_STATE.UNKNOWN;
    byState[state] += 1;
    if (state !== KNOWLEDGE_STATE.UNKNOWN) {
      continue;
    }
    const bucket = classifyUnknown({ record, decision });
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    if (bucket === "wechat-base-library-private-global") {
      const root = String(record.entityId).split(".")[0];
      unknownRoots.set(root, (unknownRoots.get(root) ?? 0) + 1);
    }
    if (bucket === "code-defined-global") {
      const root = String(record.entityId).split(".")[0];
      codeDefinedRoots.set(root, (codeDefinedRoots.get(root) ?? 0) + 1);
    }
  }
  const unknownTotal = buckets.size === 0
    ? 0
    : [...buckets.values()].reduce((sum, value) => sum + value, 0);

  const summary = {
    generatedAt,
    corpusPath,
    perEntityCap,
    sampleCount: records.length,
    byState,
    unknownTotal,
    buckets: Object.fromEntries(
      [...buckets.entries()].sort((left, right) => right[1] - left[1]),
    ),
    topWechatPrivateRoots: [...unknownRoots.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([root, count]) => ({ root, count })),
    topCodeDefinedRoots: [...codeDefinedRoots.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([root, count]) => ({ root, count })),
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "unknown-breakdown.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDir, "unknown-breakdown.md"),
      renderMarkdown(summary),
      "utf8",
    );
  }
  return summary;
};

/**
 * 把一条 UNKNOWN 归到「哪一层的改进能消除它」。
 *
 * 只分四类，因为只有这四类对应不同的工程动作：
 *
 * - `module-boundary`：模块导入。v1 的分析单位是单文件，跨模块依赖解析在
 *   技术路线 §9 的冻结清单里，属于范围外。
 * - `wechat-base-library-private-global`：基础库私有全局，可以用命名空间规则
 *   推进到有证据的 PROTECT（**不会**变成 FOLD，因为语言基线里没有它们）。
 * - `wechat-public-host-api`：公开宿主 API，同上但已有归属表。
 * - `unresolved-global`：其余无绑定的全局名。安全上必须保持 UNKNOWN——
 *   把它们当成本地变量会让 R97 不再检查，而不检查意味着可能放行。
 */
export const classifyUnknown = ({ record, decision }) => {
  const reasons = decision?.decision.reasonCodes ?? [];
  const root = String(record.entityId).split(".")[0];

  if (
    reasons.includes(REASON_CODE.BINDING_UNRESOLVED) &&
    record.bindingKind === "module_import"
  ) {
    return "module-boundary";
  }
  // 文件里自己赋值过的全局（`wh=$gwh();` 这类）。它的值由代码自身决定，
  // 外部探针观测到的「存在/不存在」只反映探针有没有执行这段代码，不是环境
  // 差异——实测 1496 个文件里 1496 个都自己定义了 wh。
  //
  // 要消掉这批未决需要先算出局部函数 `$gwh()` 的返回值（「局部函数求值与返回
  // 对象形状推断」，见技术路线 §9 的冻结清单），而不是运行时证据。
  const inFileDefinition =
    decision?.bindingRef?.inFileDefinition ?? record.inFileDefinition ?? null;
  if (inFileDefinition) {
    return "code-defined-global";
  }
  if (WECHAT_PUBLIC_ROOTS.has(root)) {
    return "wechat-public-host-api";
  }
  if (WECHAT_BASE_LIBRARY_PATTERN.test(root)) {
    return "wechat-base-library-private-global";
  }
  return "unresolved-global";
};

/**
 * 构造「目标已确认」的目标证据：两份独立部署指纹。
 *
 * 用样本自身的信息当作用域与产物绑定，避免为了测量而伪造一个与语料无关的指纹。
 */
const buildConfirmedTarget = (record, detectedAt) => {
  if (!record) {
    return [];
  }
  const base = {
    runtimeId: RUNTIME_IDS.WECHAT,
    platformFamily: "wechat",
    executionSurface: "appservice",
    versionProfile: ["sdk:3.17.3"],
    scopeId: record.project ?? "",
    artifactScope: record.file ?? "",
    revision: record.sourceHash ?? null,
    detectedAt,
  };
  return [
    buildRuntimeFingerprintEvidence({
      ...base,
      evidenceId: `fingerprint:${record.project}:${record.file}`,
      artifactHash: `sha256:${record.sourceHash ?? "unknown"}`,
      source: "runtime_fingerprint",
      provenance: EVIDENCE_PROVENANCE.HUMAN_REVIEW,
    }),
    buildRuntimeFingerprintEvidence({
      ...base,
      evidenceId: `trace:${record.project}:${record.file}`,
      artifactHash: null,
      source: "runtime_trace",
      provenance: EVIDENCE_PROVENANCE.HUMAN_REVIEW,
    }),
  ];
};

const renderMarkdown = (summary) => {
  const labels = {
    "module-boundary": "模块边界（跨模块依赖解析，§9 冻结）",
    "code-defined-global":
      "代码自身定义的全局（`wh=$gwh();` 这类隐式全局赋值，需更强的静态分析）",
    "wechat-base-library-private-global":
      "微信基础库私有全局（文件内无赋值，确属宿主注入）",
    "wechat-public-host-api": "微信公开宿主 API（已有归属表）",
    "unresolved-global":
      "其余无绑定全局（安全上必须保持 UNKNOWN：当成局部变量会让 R97 不再检查）",
  };
  const lines = [
    "# UNKNOWN 构成",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `样本：${summary.sampleCount}（每实体最多 ${summary.perEntityCap} 条）`,
    "",
    "目标按「已确认」配置（两份独立部署指纹），因此下表是**这套方法的真实天花板**，",
    "不是「还没配好目标」造成的临时未决。",
    "",
    "| 判定 | 数量 |",
    "|---|---:|",
    `| FOLD | ${summary.byState.FOLD} |`,
    `| PROTECT | ${summary.byState.PROTECT} |`,
    `| UNKNOWN | ${summary.byState.UNKNOWN} |`,
    "",
    "## UNKNOWN 拆解",
    "",
    "| 来源 | 数量 | 占总样本 |",
    "|---|---:|---:|",
  ];
  for (const [bucket, count] of Object.entries(summary.buckets)) {
    lines.push(
      `| ${labels[bucket] ?? bucket} | ${count} | ${((count / summary.sampleCount) * 100).toFixed(2)}% |`,
    );
  }
  lines.push(
    "",
    "## 代码自身定义的全局的主要根符号（`inFileDefinition`）",
    "",
    "| 根符号 | 数量 |",
    "|---|---:|",
  );
  for (const item of summary.topCodeDefinedRoots) {
    lines.push(`| ${item.root} | ${item.count} |`);
  }
  lines.push(
    "",
    "## 微信基础库私有全局的主要根符号（文件内无赋值）",
    "",
    "| 根符号 | 数量 |",
    "|---|---:|",
  );
  for (const item of summary.topWechatPrivateRoots) {
    lines.push(`| ${item.root} | ${item.count} |`);
  }
  lines.push(
    "",
    "这份拆解把「换运行时证据能解决什么」和「换静态分析才能解决什么」分开了：",
    "",
    "- 「代码自身定义的全局」（`wh=$gwh();` 这类）**加运行时探针没有用**——实测",
    "  1496 个文件全部自己定义了 `wh`，探针观测到的存在性只反映它有没有执行这段",
    "  代码。要折叠这类点需要先算出局部函数的返回值（技术路线 §9 冻结清单里的",
    "  「局部函数求值与返回对象形状推断」），v1 不做。",
    "- 「微信基础库私有全局」只剩文件内找不到赋值的那几个（`__wxConfig` 等），才是",
    "  真正的基础库注入对象。对它们，命名空间规则也已被实测否决：收窄到实测存在的",
    "  名字后仍有 295 条错误放行，因为 `$gwx_wx<hash>` 这类逐项目实例化路径无法跨",
    "  项目归属。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parseUnknownBreakdownArgs = (argv) => {
  const options = {
    corpusPath: path.resolve(
      "datasets/real-miniapp-full/real-miniapp-candidates.jsonl",
    ),
    wechatReportPath: path.resolve(
      "datasets/wechat-live/wechat-probe-report.json",
    ),
    outputDir: path.resolve("datasets/unknown-breakdown"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--corpus") {
      options.corpusPath = path.resolve(next);
      index += 1;
    } else if (argument === "--wechat-report") {
      options.wechatReportPath = path.resolve(next);
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
  const options = parseUnknownBreakdownArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/unknown-breakdown.mjs [--corpus <path>] [--wechat-report <path>] [--out <dir>]",
    );
  } else {
    const summary = await runUnknownBreakdown(options);
    console.log(
      JSON.stringify(
        {
          sampleCount: summary.sampleCount,
          byState: summary.byState,
          unknownTotal: summary.unknownTotal,
          buckets: summary.buckets,
          topCodeDefinedRoots: summary.topCodeDefinedRoots.slice(0, 8),
          topWechatPrivateRoots: summary.topWechatPrivateRoots.slice(0, 8),
        },
        null,
        2,
      ),
    );
  }
}
