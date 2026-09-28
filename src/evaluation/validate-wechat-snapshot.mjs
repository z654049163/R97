import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectWechatObservations } from "../evidence/wechat-devtools.mjs";

const PROBE_DIMENSIONS = Object.freeze([
  "existence",
  "type",
  "callability",
]);

/**
 * 微信快照漂移校验。
 *
 * 判卷尺子有一条硬要求是「得能随时重跑」。Node 与 Edge 都是本机进程，脚本一敲
 * 就是新数据；微信依赖桌面版开发者工具，所以判卷时读的是一份**离线快照**。
 * 快照本身可接受，但必须能回答「这份快照现在还准吗」——否则基础库一升级，
 * 所有基于它的结论都会悄悄过期。
 *
 * 这个命令用同一个实体集合重采一次，与快照逐条比对，产出漂移报告：多少条不变、
 * 多少条变了、变在哪，以及基础库版本是否变了。
 */
export const validateWechatSnapshot = async ({
  snapshotPath,
  outputDir = null,
  port = 9420,
  mode = "auto",
  timeoutMs = 120000,
  projectPath,
  cliPath,
  observedAt = new Date().toISOString(),
}) => {
  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot does not exist: ${snapshotPath}`);
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const storedValues = snapshot.wechatValues ?? {};
  const entityIds = Object.keys(storedValues);
  if (entityIds.length === 0) {
    throw new Error("Snapshot contains no wechatValues to validate");
  }

  const entityDimensions = Object.fromEntries(
    entityIds.map((entityId) => [entityId, [...PROBE_DIMENSIONS]]),
  );
  const collection = await collectWechatObservations({
    entityDimensions,
    projectPath,
    cliPath,
    port,
    mode,
    timeoutMs,
    observedAt,
  });
  const currentValues = collection.report.wechatValues ?? {};

  const changed = [];
  const notRecollected = [];
  let unchanged = 0;
  for (const entityId of entityIds) {
    const before = storedValues[entityId];
    const after = currentValues[entityId];
    if (!after || typeof after !== "object") {
      notRecollected.push({ entityId, reason: "本次未取到观测" });
      continue;
    }
    if (JSON.stringify(before) === JSON.stringify(after)) {
      unchanged += 1;
      continue;
    }
    changed.push({
      entityId,
      before,
      after,
      direction: classifyDrift(before, after),
    });
  }

  const summary = {
    validatedAt: observedAt,
    snapshotPath,
    snapshot: {
      generatedAt: snapshot.generatedAt ?? null,
      sdkVersion: snapshot.sdkVersion ?? null,
      probeImplementation: snapshot.probeImplementation ?? "unknown",
      entityCount: entityIds.length,
    },
    current: {
      generatedAt: collection.report.generatedAt ?? observedAt,
      sdkVersion: collection.sdkVersion ?? null,
      probeImplementation: collection.report.probeImplementation ?? "unknown",
      probeErrorCount: collection.report.probeErrorCount ?? null,
      appServiceReady: collection.report.appServiceReady ?? null,
    },
    sdkVersionChanged:
      (snapshot.sdkVersion ?? null) !== (collection.sdkVersion ?? null),
    comparedCount: unchanged + changed.length,
    unchangedCount: unchanged,
    changedCount: changed.length,
    driftRate:
      unchanged + changed.length === 0
        ? null
        : changed.length / (unchanged + changed.length),
    declinedCount: changed.filter((entry) => entry.direction === "declined")
      .length,
    improvedCount: changed.filter((entry) => entry.direction === "improved")
      .length,
    changedExamples: changed.slice(0, 25),
    notRecollectedCount: notRecollected.length,
    notRecollectedExamples: notRecollected.slice(0, 25),
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "wechat-snapshot-validation.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDir, "wechat-snapshot-validation.md"),
      renderMarkdown(summary),
      "utf8",
    );
  }
  return summary;
};

/**
 * 漂移方向按「对安全性的影响」分，而不是按字段差异分。
 *
 * - `declined`：某个宿主能力从「有」变成「无」或不再可调用。这是危险方向：
 *   拿旧快照做的 FOLD 可能已经不成立。
 * - `improved`：从「无」变成「有」。旧快照更保守，不会造成误放行。
 * - `neutral`：类型或可调用性变了但没有跨过存在性边界，需要人工看一眼。
 */
export const classifyDrift = (before, after) => {
  const beforeExisted = before?.existence === true;
  const afterExisted = after?.existence === true;
  if (beforeExisted && !afterExisted) {
    return "declined";
  }
  if (!beforeExisted && afterExisted) {
    return "improved";
  }
  const beforeCallable = before?.callability === true;
  const afterCallable = after?.callability === true;
  if (beforeCallable && !afterCallable) {
    return "declined";
  }
  if (!beforeCallable && afterCallable) {
    return "improved";
  }
  return "neutral";
};

const renderMarkdown = (summary) => {
  const lines = [
    "# 微信判卷快照漂移校验",
    "",
    `校验时间：${summary.validatedAt}`,
    "",
    "| 项 | 快照 | 本次重采 |",
    "|---|---|---|",
    `| 采集时间 | ${summary.snapshot.generatedAt} | ${summary.current.generatedAt} |`,
    `| 基础库版本 | ${summary.snapshot.sdkVersion ?? "-"} | ${summary.current.sdkVersion ?? "-"} |`,
    `| 探针实现 | ${summary.snapshot.probeImplementation} | ${summary.current.probeImplementation} |`,
    `| 实体数 | ${summary.snapshot.entityCount} | 参与比对 ${summary.comparedCount} |`,
    "",
    summary.sdkVersionChanged
      ? "**基础库版本已变化**：快照里的观测不能直接与新版本混用，需要重采后再出结论。"
      : "基础库版本与快照一致。",
    "",
    "## 漂移",
    "",
    "| 指标 | 数值 |",
    "|---|---:|",
    `| 完全一致 | ${summary.unchangedCount} |`,
    `| 发生变化 | ${summary.changedCount} |`,
    `| 漂移率 | ${summary.driftRate === null ? "-" : `${(summary.driftRate * 100).toFixed(2)}%`} |`,
    `| 危险方向（declined，能力消失或不再可调用） | **${summary.declinedCount}** |`,
    `| 保守方向（improved，能力新出现） | ${summary.improvedCount} |`,
    `| 本次未取到观测 | ${summary.notRecollectedCount} |`,
    "",
    "注意：`Function` 根节点在采集时就被排除，因此不在快照的实体集里，本表也不统计它——",
    "参与判卷的实体范围见采集报告的 `excludedRoots`。",
    "",
    "`declined` 是唯一危险方向：拿旧快照做的 FOLD 可能已经不再成立，必须重采。",
    "`improved` 方向旧快照更保守，不会造成误放行，但会让放行率被低估。",
    "",
  ];
  if (summary.changedExamples.length > 0) {
    lines.push(
      "## 变化样例",
      "",
      "| 实体 | 方向 | 快照 | 本次 |",
      "|---|---|---|---|",
    );
    for (const entry of summary.changedExamples) {
      lines.push(
        `| ${entry.entityId} | ${entry.direction} | ${JSON.stringify(entry.before)} | ${JSON.stringify(entry.after)} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
};

export const parseValidateArgs = (argv) => {
  const options = {
    snapshotPath: path.resolve(
      "datasets/wechat-live/wechat-probe-report.json",
    ),
    outputDir: path.resolve("datasets/wechat-snapshot-validation"),
    port: 9420,
    mode: "auto",
    timeoutMs: 120000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--snapshot") {
      options.snapshotPath = path.resolve(next);
      index += 1;
    } else if (argument === "--out") {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (argument === "--port") {
      options.port = Number.parseInt(next, 10);
      index += 1;
    } else if (argument === "--mode") {
      options.mode = next;
      index += 1;
    } else if (argument === "--project") {
      options.projectPath = path.resolve(next);
      index += 1;
    } else if (argument === "--cli") {
      options.cliPath = path.resolve(next);
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
  const options = parseValidateArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/validate-wechat-snapshot.mjs [--snapshot <path>] [--out <dir>] [--port <n>] [--mode auto|connect|launch]",
    );
  } else {
    const summary = await validateWechatSnapshot(options);
    console.log(
      JSON.stringify(
        {
          sdkVersionChanged: summary.sdkVersionChanged,
          snapshotSdk: summary.snapshot.sdkVersion,
          currentSdk: summary.current.sdkVersion,
          comparedCount: summary.comparedCount,
          unchangedCount: summary.unchangedCount,
          changedCount: summary.changedCount,
          driftRate: summary.driftRate,
          declinedCount: summary.declinedCount,
          improvedCount: summary.improvedCount,
          notRecollectedCount: summary.notRecollectedCount,
        },
        null,
        2,
      ),
    );
    process.exitCode = summary.declinedCount === 0 ? 0 : 1;
  }
}
