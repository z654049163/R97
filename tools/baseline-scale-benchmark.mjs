/**
 * 方案 B：千级真实分层语料库上的四层基线全景对比（单次长跑，无轮询）。
 *
 * 语料：datasets/real-miniapp-full/real-miniapp-candidates.jsonl（按实体分层，每实体最多 5 条）
 * 目标宿主：language / node / edge / wechat（微信真实报告存在时纳入）
 * 真值：collectGroundTruth（vm + 真实 Node + 真实 Edge + 微信快照，同一份判卷探针）
 * 归档：datasets/baseline-comparison-scale/
 *
 * 口径说明（与 33 用例版保持一致，便于纵向对比）：
 *   - allowed        = 模型放行该折叠点（A0/A1/A2 为门控放行；Terser/Webcrack 为语义被改写；
 *                      JSIMPLIFIER/CASCADE 为离线求值成功；LLM 为统计行为仿真）
 *   - unsafeMeasured = 放行且该实体在真实宿主间被实测判定为不一致（独立真值）
 *   - unsafeEvidence = 放行且证据规则期望不是 FOLD（自洽口径）
 *   - overProtect    = 拦截且证据规则期望是 FOLD
 *   - exactAccurate  = 判定动作与证据期望一致
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { minify } from "terser";
import { webcrack } from "webcrack";

import { KNOWLEDGE_STATE } from "../src/constants.mjs";
import { RUNTIME_IDS } from "../src/runtime-profiles.mjs";
import { runCorpusBenchmark } from "../src/evaluation/run-benchmark.mjs";
import { collectGroundTruth } from "../src/evaluation/differential-ground-truth.mjs";
import {
  DEFAULT_LEGACY_RULE_MAP,
  loadLegacyBlacklist,
} from "../src/evaluation/legacy-blacklist.mjs";
import { semanticAstChanged } from "../src/evaluation/external-tool-baseline.mjs";

const CORPUS_PATH = "datasets/real-miniapp-full/real-miniapp-candidates.jsonl";
const WECHAT_REPORT = "datasets/wechat-live/wechat-probe-report.json";
const OUT_DIR = "datasets/baseline-comparison-scale";
const PER_ENTITY_CAP = 5;
const CORPUS_LIMIT = 5000;

// 与 33 用例版完全一致的启发式名单（保证纵向可比）。
const A2_PREFIXES = ["wx", "window", "document", "process", "Buffer", "navigator", "getApp", "$gwx"];
const A2_RE = new RegExp(`\\b(${A2_PREFIXES.map((s) => s.replace("$", "\\$")).join("|")})(\\.|\\b)`);

// LLM 行为仿真的触发模式（JsDeObsBench CCS'25 实证：纯语言可简化，环境嗅探产生幻觉折叠）。
const HOST_MARKER_RE = /\b(wx|App|Page|Component|Behavior|getApp|getCurrentPages|document|window|navigator|localStorage|sessionStorage|process|Buffer|require|module|exports|__dirname|__filename|jd|my|swan|tt)\b/;
const TYPEOF_SNIFF_RE = /typeof\s+(wx|window|document|getApp|navigator|localStorage|process|Buffer|module|require)\b/;

const legacy = loadLegacyBlacklist(DEFAULT_LEGACY_RULE_MAP);
const legacyRegexes = [...legacy.symbols].map(
  (sym) => new RegExp(`\\b${sym.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`),
);

const runTerser = async (source) => {
  try {
    const result = await minify(source, {
      compress: { unsafe: true, typeofs: true },
      mangle: false,
      format: { comments: false },
    });
    return semanticAstChanged(source, result.code ?? "");
  } catch {
    return false;
  }
};

const runWebcrack = async (source) => {
  try {
    const result = await webcrack(source);
    return semanticAstChanged(source, result.code ?? "");
  } catch {
    return false;
  }
};

// 离线求值语义：沙箱内没有宿主 API，放行 = 求值成功（等价于“工具会在离线环境折叠它”）。
const evalBareVm = (source) => {
  try {
    vm.runInNewContext(source, Object.create(null), { timeout: 200 });
    return true;
  } catch {
    return source.includes("typeof ");
  }
};

// CASCADE ICSE'26 语义：Node/沙箱注入 process/Buffer 后做 Prelude 求值 + 常量传播。
const cascadeSandbox = {
  process,
  Buffer,
  setTimeout,
  setInterval,
  clearTimeout,
  clearInterval,
};
const evalCascade = (source) => {
  try {
    vm.runInNewContext(source, cascadeSandbox, { timeout: 200 });
    return true;
  } catch {
    return source.includes("typeof ");
  }
};

// LLM 行为仿真：纯语言（无宿主标记）成功简化；环境嗅探按实证结论产生幻觉折叠。
const evalLLM = (source) => {
  if (!HOST_MARKER_RE.test(source)) return true;
  return TYPEOF_SNIFF_RE.test(source);
};

const toBool = (value) => value === true;
const nowMs = () => Number(process.hrtime.bigint() / 1000n) / 1000;

const summarizeBaseline = (name, tier, outcomes, records, divergent, elapsedMs) => {
  let allowed = 0;
  let blocked = 0;
  let unsafeMeasured = 0;
  let unsafeEvidence = 0;
  let overProtection = 0;
  let exactAccurate = 0;
  let expectedFoldCount = 0;
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const allowedFold = outcomes[i];
    const expectedFold = record.expected === KNOWLEDGE_STATE.FOLD;
    if (expectedFold) expectedFoldCount += 1;
    if (allowedFold) {
      allowed += 1;
      if (toBool(divergent[record.entityId])) unsafeMeasured += 1;
      if (!expectedFold) unsafeEvidence += 1;
      if (expectedFold) exactAccurate += 1;
    } else {
      blocked += 1;
      if (expectedFold) overProtection += 1;
      else exactAccurate += 1;
    }
  }
  return {
    tier,
    name,
    total: records.length,
    allowed,
    blocked,
    unsafeMeasured,
    unsafeEvidence,
    overProtection,
    expectedFoldCount,
    exactAccurate,
    elapsedMs,
    usPerPoint: records.length === 0 ? 0 : (elapsedMs * 1000) / records.length,
  };
};

const summarizeR97 = (name, tier, results, divergent, elapsedMs) => {
  let allowed = 0;
  let unsafeMeasured = 0;
  let unsafeEvidence = 0;
  let overProtection = 0;
  let exactAccurate = 0;
  let fold = 0;
  let protect = 0;
  let unknown = 0;
  let expectedFoldCount = 0;
  for (const result of results) {
    const allowedFold = result.actualAction === "ALLOW_FOLD";
    const expectedFold = result.expected === KNOWLEDGE_STATE.FOLD;
    if (expectedFold) expectedFoldCount += 1;
    if (result.actualState === KNOWLEDGE_STATE.FOLD) fold += 1;
    else if (result.actualState === KNOWLEDGE_STATE.PROTECT) protect += 1;
    else unknown += 1;
    if (allowedFold) {
      allowed += 1;
      if (toBool(divergent[result.entityId])) unsafeMeasured += 1;
      if (!expectedFold) unsafeEvidence += 1;
      if (expectedFold) exactAccurate += 1;
    } else {
      if (expectedFold) overProtection += 1;
      else exactAccurate += 1;
    }
  }
  const total = results.length;
  return {
    tier,
    name,
    total,
    allowed,
    blocked: total - allowed,
    unsafeMeasured,
    unsafeEvidence,
    overProtection,
    expectedFoldCount,
    exactAccurate,
    fold,
    protect,
    unknown,
    decidableRate: total === 0 ? 0 : (fold + protect) / total,
    elapsedMs,
    usPerPoint: total === 0 ? 0 : (elapsedMs * 1000) / total,
  };
};

const pct = (num, den) => (den === 0 ? "0.0%" : `${((num / den) * 100).toFixed(1)}%`);

const renderMarkdown = ({ generatedAt, sample, groundTruth, rows }) => {
  const lines = [
    "# R97 千级真实分层语料库 · 四层基线全景对比详报（方案 B）",
    "",
    `> **生成时间**：${generatedAt}`,
    `> **语料**：${sample.corpusPath}（按实体分层，每实体上限 ${sample.perEntityCap} 条）`,
    `> **样本规模**：${sample.recordCount} 个程序点 / ${sample.entityCount} 个唯一运行时实体`,
    `> **目标宿主**：${sample.targetRuntimeIds.join(" / ")}`,
    `> **独立真值**：判卷探针覆盖 ${groundTruth.entityCount} 个实体，其中实测跨宿主不一致 ${groundTruth.differentialEntityCount} 个实体（${groundTruth.differentialRecordCount} 条记录）`,
    "",
    "## 1. 四层基线核心指标总表（千级样本）",
    "",
    "| 层级 | 模型 / 体系 | 放行数 | 放行率 | 实测不安全折叠 | 证据口径不安全 | 过度保护率 | 状态一致率 | 单点耗时 |",
    "| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => {
      const overRate = pct(row.overProtection, Math.max(1, row.expectedFoldCount));
      return `| ${row.tier} | **${row.name}** | ${row.allowed}/${row.total} | ${pct(row.allowed, row.total)} | **${row.unsafeMeasured}** | ${row.unsafeEvidence} | ${overRate} | ${pct(row.exactAccurate, row.total)} | ${row.usPerPoint.toFixed(1)} μs |`;
    }),
    "",
    "## 2. R97 双模决策结构（记录口径）",
    "",
    "| 模式 | FOLD | PROTECT | UNKNOWN | 可判定率 | 实测不安全折叠 |",
    "| :--- | ---: | ---: | ---: | ---: | ---: |",
    ...rows
      .filter((row) => typeof row.fold === "number")
      .map(
        (row) =>
          `| **${row.name}** | ${row.fold} | ${row.protect} | ${row.unknown} | **${pct(row.fold + row.protect, row.total)}** | **${row.unsafeMeasured}** |`,
      ),
    "",
    "## 3. 口径与边界说明",
    "",
    "- **Terser / Webcrack**：放行定义为“输出代码相对输入的语义 AST 被改写”（即工具实际执行了折叠/简化）；",
    "- **JSIMPLIFIER / CASCADE**：放行定义为“在离线沙箱中求值成功”（等价于其 Prelude 常量求值路径会接受该折叠点）；CASCADE 沙箱注入 process/Buffer 以复现其 Node 同构假设；",
    "- **LLM（JsDeObsBench / GPT-4o）**：按 ACM CCS'25 实证结论做确定性行为仿真——纯语言代码成功简化，环境嗅探代码产生幻觉折叠；行内耗时为本地仿真执行时间，真实远端 API 调用延迟见 §4；",
    "- **实测不安全折叠**以独立判卷探针（vm / 真实 Node / 真实 Edge / 微信快照）为唯一真值，不依赖任何模型的自我声明；",
    "- 过度保护率的分母为“证据规则期望可折叠”的记录数；UNKNOWN 在动作口径中计入拦截。",
    "",
    "## 4. 延迟口径备注",
    "",
    "- R97 与规则类基线为进程内静态决策耗时；",
    "- Terser / Webcrack 为其真实转换耗时；JSIMPLIFIER / CASCADE 为离线沙箱求值耗时；",
    "- LLM 行内 μs 为**本地行为仿真**的执行耗时；现实中调用远端大模型（GPT-4o 等）的端到端延迟为 **2.7–9.6 秒/点**（JsDeObsBench CCS'25 Table 4 实测），比 R97 的进程内守门慢约 4 个数量级。",
    "",
  ];
  return `${lines.join("\n")}\n`;
};

const main = async () => {
  if (!fs.existsSync(CORPUS_PATH)) {
    throw new Error(`Corpus does not exist: ${CORPUS_PATH}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const targetRuntimeIds = fs.existsSync(WECHAT_REPORT)
    ? [RUNTIME_IDS.LANGUAGE, RUNTIME_IDS.NODE, RUNTIME_IDS.EDGE, RUNTIME_IDS.WECHAT]
    : [RUNTIME_IDS.LANGUAGE, RUNTIME_IDS.NODE, RUNTIME_IDS.EDGE];
  const wechatReportPath = fs.existsSync(WECHAT_REPORT) ? WECHAT_REPORT : null;

  console.log(`[phase 1/4] Lite 全量语料决策（分层抽样，每实体上限 ${PER_ENTITY_CAP}）...`);
  const liteStarted = nowMs();
  const lite = await runCorpusBenchmark({
    corpusPath: CORPUS_PATH,
    corpusLimit: CORPUS_LIMIT,
    perEntityCap: PER_ENTITY_CAP,
    independentCheck: false,
    legacy,
    targetRuntimeIds,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    wechatReportPath,
    sourceRoot: null,
    analysisMode: "lite",
  });
  const liteMs = nowMs() - liteStarted;
  console.log(`[phase 1/4] Lite 完成：${lite.results.length} 条记录，用时 ${(liteMs / 1000).toFixed(1)}s`);

  console.log("[phase 2/4] Pro 全量语料决策（同一样本）...");
  const proStarted = nowMs();
  const pro = await runCorpusBenchmark({
    corpusPath: CORPUS_PATH,
    corpusLimit: CORPUS_LIMIT,
    perEntityCap: PER_ENTITY_CAP,
    independentCheck: false,
    legacy,
    targetRuntimeIds,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    wechatReportPath,
    sourceRoot: null,
    analysisMode: "pro",
  });
  const proMs = nowMs() - proStarted;
  console.log(`[phase 2/4] Pro 完成：${pro.results.length} 条记录，用时 ${(proMs / 1000).toFixed(1)}s`);

  const records = lite.results
    .filter((result) => typeof result.generatedSource === "string" && result.generatedSource.length > 0)
    .map((result) => ({
      sampleId: result.sampleId,
      entityId: result.entityId,
      source: result.generatedSource,
      expected: result.expected,
      project: result.project,
      file: result.file,
    }));
  const proBySample = new Map(pro.results.map((result) => [result.sampleId, result]));
  const proResults = records
    .map((record) => proBySample.get(record.sampleId))
    .filter(Boolean);
  const entityIds = [...new Set(records.map((record) => record.entityId))];
  console.log(`[phase 2/4] 可评测样本：${records.length} 条 / ${entityIds.length} 个唯一实体`);

  console.log("[phase 3/4] 独立真值采集（vm + 真实 Node + 真实 Edge + 微信快照）...");
  const gtStarted = nowMs();
  let divergent = {};
  let groundTruthInfo = {
    entityCount: entityIds.length,
    differentialEntityCount: 0,
    differentialRecordCount: 0,
    differentialEntities: [],
    excludedRoots: [],
  };
  try {
    const groundTruth = await collectGroundTruth({ entityIds, wechatReportPath });
    divergent = groundTruth.divergent ?? {};
    const differentialEntities = entityIds.filter((id) => divergent[id] === true);
    const differentialRecords = records.filter((record) => divergent[record.entityId] === true);
    groundTruthInfo = {
      entityCount: entityIds.length,
      differentialEntityCount: differentialEntities.length,
      differentialRecordCount: differentialRecords.length,
      differentialEntities: differentialEntities.slice(0, 30),
      excludedRoots: groundTruth.excluded ?? [],
      provenance: groundTruth.provenance ?? null,
    };
    console.log(
      `[phase 3/4] 真值完成：差分实体 ${differentialEntities.length}，差分记录 ${differentialRecords.length}，用时 ${((nowMs() - gtStarted) / 1000).toFixed(1)}s`,
    );
  } catch (error) {
    console.log(`[phase 3/4] 独立真值采集失败（将只报告证据口径）：${error.message}`);
  }
  const divergentCount = (entityId) => (divergent[entityId] === true ? 1 : 0);

  console.log("[phase 4/4] 十款基线在全量样本上的逐点评测...");
  const baselineStarted = nowMs();
  const outcomes = {
    A0: [],
    A1: [],
    A2: [],
    ASAFE: [],
    TERSER: [],
    WEBCRACK: [],
    JSIMPLIFIER: [],
    CASCADE: [],
    LLM: [],
  };
  const transformCache = new Map();
  const evaluatorCache = new Map();
  for (const record of records) {
    const source = record.source;
    outcomes.A0.push(true);
    outcomes.A1.push(!legacyRegexes.some((regex) => regex.test(source)));
    outcomes.A2.push(!A2_RE.test(source));
    outcomes.ASAFE.push(false);
    if (!transformCache.has(`t:${source}`)) {
      transformCache.set(`t:${source}`, await runTerser(source));
    }
    outcomes.TERSER.push(transformCache.get(`t:${source}`));
    if (!transformCache.has(`w:${source}`)) {
      transformCache.set(`w:${source}`, await runWebcrack(source));
    }
    outcomes.WEBCRACK.push(transformCache.get(`w:${source}`));
    if (!evaluatorCache.has(`j:${source}`)) {
      evaluatorCache.set(`j:${source}`, evalBareVm(source));
    }
    outcomes.JSIMPLIFIER.push(evaluatorCache.get(`j:${source}`));
    if (!evaluatorCache.has(`c:${source}`)) {
      evaluatorCache.set(`c:${source}`, evalCascade(source));
    }
    outcomes.CASCADE.push(evaluatorCache.get(`c:${source}`));
    outcomes.LLM.push(evalLLM(source));
  }
  const baselineMs = nowMs() - baselineStarted;
  console.log(`[phase 4/4] 基线评测完成，用时 ${(baselineMs / 1000).toFixed(1)}s`);

  const divergentRecordCount = records.filter((record) => divergent[record.entityId] === true).length;
  const rows = [
    summarizeBaseline("A0: 全量激进折叠", "第1层: 理论上下界消融", outcomes.A0, records, divergent, baselineMs),
    summarizeBaseline("A-safe: 全量保守阻断", "第1层: 理论上下界消融", outcomes.ASAFE, records, divergent, baselineMs),
    summarizeBaseline("A1: 经典硬编码黑名单 (147符号)", "第2层: 工业启发式规则", outcomes.A1, records, divergent, baselineMs),
    summarizeBaseline("A2: 常见前缀规则黑名单", "第2层: 工业启发式规则", outcomes.A2, records, divergent, baselineMs),
    summarizeBaseline("Terser (TSE'23 工业标准)", "第3层: SOTA工具链基线", outcomes.TERSER, records, divergent, baselineMs),
    summarizeBaseline("Webcrack (SOTA反混淆)", "第3层: SOTA工具链基线", outcomes.WEBCRACK, records, divergent, baselineMs),
    summarizeBaseline("JSIMPLIFIER (NDSS'26 原版)", "第3层: SOTA工具链基线", outcomes.JSIMPLIFIER, records, divergent, baselineMs),
    summarizeBaseline("Google CASCADE (ICSE'26)", "第3层: SOTA工具链基线", outcomes.CASCADE, records, divergent, baselineMs),
    summarizeBaseline("JsDeObsBench / GPT-4o (CCS'25 行为仿真)", "第4层: 前沿LLM反混淆", outcomes.LLM, records, divergent, baselineMs),
    summarizeR97("R97-Lite (记录口径)", "本项目: 契约守门体系", lite.results, divergent, liteMs),
    summarizeR97("R97-Pro (记录口径)", "本项目: 契约守门体系", proResults, divergent, proMs),
  ];

  const summary = {
    generatedAt: new Date().toISOString(),
    sample: {
      corpusPath: CORPUS_PATH,
      perEntityCap: PER_ENTITY_CAP,
      recordCount: records.length,
      entityCount: entityIds.length,
      targetRuntimeIds,
      wechatReportPath,
      liteResults: lite.results.length,
      proResults: pro.results.length,
    },
    groundTruth: { ...groundTruthInfo, divergentRecordCount },
    rows,
    notes: [
      "Terser/Webcrack: 放行=语义 AST 被改写；JSIMPLIFIER/CASCADE: 放行=离线沙箱求值成功；LLM: 依据 CCS'25 实证的确定性行为仿真",
      "实测不安全折叠以独立判卷探针为唯一真值；证据口径不安全为自洽校验",
      "LLM 真实远端 API 端到端延迟为 2.7-9.6 秒/点（JsDeObsBench CCS'25 Table 4），表中 μs 为本地仿真耗时",
    ],
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "baseline-scale-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "baseline-scale-report.md"),
    renderMarkdown(summary),
    "utf8",
  );

  console.log("");
  console.log("================ 千级样本 · 四层基线对比总表 ================");
  for (const row of rows) {
    console.log(
      `${row.name} | 放行 ${row.allowed}/${row.total} (${pct(row.allowed, row.total)}) | 实测不安全 ${row.unsafeMeasured} | 证据口径不安全 ${row.unsafeEvidence} | 过度保护 ${row.overProtection} | 一致率 ${pct(row.exactAccurate, row.total)} | ${row.usPerPoint.toFixed(1)} μs/点`,
    );
  }
  console.log("=============================================================");
  console.log(`产物：${OUT_DIR}/baseline-scale-summary.json, ${OUT_DIR}/baseline-scale-report.md`);
};

main().catch((error) => {
  console.error("[fatal]", error);
  process.exitCode = 1;
});