import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TARGET_RUNTIME_STATUS } from "../constants.mjs";
import { resolveTargetRuntime } from "../target-runtime-resolver.mjs";
import { detectMiniProgramPackage } from "./project-platform-resolver.mjs";

/**
 * 平台判定覆盖率测量。
 *
 * 回答一个此前答不出来的问题：**从真实项目结构出发，平台状态能推进到哪一步？**
 * 有了 `context_unknown` 之后，缺口不再和「什么都不知道」混在一起，可以分桶计数。
 */
export const runPlatformResolutionReport = ({
  projectsRoot,
  limit = Number.POSITIVE_INFINITY,
  outputDir = null,
  generatedAt = new Date().toISOString(),
}) => {
  const projectDirs = readdirSync(projectsRoot)
    .map((name) => path.join(projectsRoot, name))
    .filter((entry) => statSync(entry).isDirectory())
    .slice(0, Number.isFinite(limit) ? limit : undefined);

  const byStatus = {};
  const byMissing = {};
  const bySignalCount = {};
  const examples = { context_unknown: [], unknown: [] };
  let detected = 0;

  for (const projectDir of projectDirs) {
    const detection = detectMiniProgramPackage({
      projectDir,
      artifactScope: projectDir,
      detectedAt: generatedAt,
    });
    if (detection.signals.length > 0) {
      detected += 1;
    }
    bySignalCount[detection.signals.length] =
      (bySignalCount[detection.signals.length] ?? 0) + 1;

    const resolved = resolveTargetRuntime({
      artifactId: path.join(projectDir, "app-service.js"),
      scopeIds: [path.basename(projectDir)],
      requiredRuntimeIds: [],
      targetRuntimeEvidence: detection.evidenceRecords,
      targetRuntimeSource: "unknown",
      targetRuntimeExplicit: false,
    });
    byStatus[resolved.status] = (byStatus[resolved.status] ?? 0) + 1;
    for (const item of resolved.missing) {
      byMissing[item] = (byMissing[item] ?? 0) + 1;
    }
    const bucket = examples[resolved.status];
    if (bucket && bucket.length < 10) {
      bucket.push(path.basename(projectDir));
    }
  }

  const summary = {
    generatedAt,
    projectsRoot,
    projectCount: projectDirs.length,
    detectedCount: detected,
    // 三个指标必须分开报，不能合成一个「识别率」。
    //
    // 1570/1572 是**平台族识别率**（认出这是微信小程序包），不是目标运行时
    // 解析率。这批项目全部停在 `context_unknown`：族与执行表面都定了，唯独
    // 版本画像拿不到——包内没有任何字段能给出基础库版本。把它写成「99.87%
    // 的目标解析率」，读者会以为已经能据此做最终语义判断。
    platformFamilyResolutionRate:
      projectDirs.length === 0 ? null : detected / projectDirs.length,
    runtimeProfileResolutionRate:
      projectDirs.length === 0
        ? null
        : Math.max(0, detected - (byMissing.version_profile ?? 0)) /
          projectDirs.length,
    confirmedTargetRate:
      projectDirs.length === 0
        ? null
        : (byStatus[TARGET_RUNTIME_STATUS.CONFIRMED] ?? 0) / projectDirs.length,
    byStatus,
    byMissing,
    bySignalCount,
    examples,
    contextUnknownShare:
      projectDirs.length === 0
        ? null
        : (byStatus[TARGET_RUNTIME_STATUS.CONTEXT_UNKNOWN] ?? 0) /
          projectDirs.length,
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "platform-resolution.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDir, "platform-resolution.md"),
      renderMarkdown(summary),
      "utf8",
    );
  }
  return summary;
};

const renderMarkdown = (summary) => {
  const lines = [
    "# 平台判定覆盖率",
    "",
    `生成时间：${summary.generatedAt}`,
    "",
    `项目数：${summary.projectCount}，识别出平台族：${summary.detectedCount}（${((summary.platformFamilyResolutionRate ?? 0) * 100).toFixed(2)}%）`,
    `完整版本画像：${((summary.runtimeProfileResolutionRate ?? 0) * 100).toFixed(2)}%，已确认目标：${((summary.confirmedTargetRate ?? 0) * 100).toFixed(2)}%`,
    "",
    "## 解析出的目标运行时状态",
    "",
    "| 状态 | 项目数 | 占比 |",
    "|---|---:|---:|",
  ];
  for (const [status, count] of Object.entries(summary.byStatus).sort(
    (left, right) => right[1] - left[1],
  )) {
    lines.push(
      `| ${status} | ${count} | ${((count / summary.projectCount) * 100).toFixed(2)}% |`,
    );
  }
  lines.push(
    "",
    "## 缺什么",
    "",
    "| 缺失项 | 项目数 |",
    "|---|---:|",
  );
  for (const [item, count] of Object.entries(summary.byMissing).sort(
    (left, right) => right[1] - left[1],
  )) {
    lines.push(`| ${item} | ${count} |`);
  }
  lines.push(
    "",
    "## 结构指纹命中数",
    "",
    "| 命中信号数 | 项目数 |",
    "|---|---:|",
  );
  for (const [count, projects] of Object.entries(summary.bySignalCount).sort()) {
    lines.push(`| ${count} | ${projects} |`);
  }
  lines.push(
    "",
    "`context_unknown` = 平台族已由外部权威证据确认，但版本画像（或执行表面）不完整。",
    "它既不能授权 FOLD，也不能触发硬 PROTECT——存在的意义是让这截缺口可测量、可审计。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const parsePlatformReportArgs = (argv) => {
  const options = {
    projectsRoot: "E:/复现/sample_collector/可用于实验的干净源码包",
    outputDir: path.resolve("datasets/platform-resolution"),
    limit: Number.POSITIVE_INFINITY,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--projects") {
      options.projectsRoot = next;
      index += 1;
    } else if (argument === "--out") {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (argument === "--limit") {
      options.limit = Number.parseInt(next, 10);
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
  const options = parsePlatformReportArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node src/evaluation/platform-resolution-report.mjs [--projects <dir>] [--out <dir>] [--limit <n>]",
    );
  } else {
    const summary = runPlatformResolutionReport(options);
    console.log(
      JSON.stringify(
        {
          projectCount: summary.projectCount,
          detectedCount: summary.detectedCount,
          platformFamilyResolutionRate: summary.platformFamilyResolutionRate,
          runtimeProfileResolutionRate: summary.runtimeProfileResolutionRate,
          confirmedTargetRate: summary.confirmedTargetRate,
          byStatus: summary.byStatus,
          byMissing: summary.byMissing,
          bySignalCount: summary.bySignalCount,
          contextUnknownShare: summary.contextUnknownShare,
        },
        null,
        2,
      ),
    );
  }
}
