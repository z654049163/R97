import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readWechatRuntimeInfo } from "../evidence/wechat-devtools.mjs";
import { detectMiniProgramPackage } from "./project-platform-resolver.mjs";
import {
  buildWechatDeploymentFingerprint,
  resolveFingerprintArtifactPath,
} from "./runtime-fingerprint.mjs";

/**
 * 在**被分析项目**上采集一次真实运行时读数，产出部署指纹证据。
 *
 * 这条通道回答的是「目标到底是谁」，不是「每个实体长什么样」。它把目标从
 * `context_unknown` 往 `confirmed` 推——但单次采集只拿得到一条证据，停在
 * `corroborated`。要到 `confirmed` 需要第二个独立来源（例如官方项目配置里的
 * `libVersion`，或另一条部署侧轨迹）。
 */
export const collectDeploymentFingerprint = async ({
  projectDir,
  outputDir = null,
  cliPath = undefined,
  timeoutMs = 60000,
  port = 9420,
  mode = "auto",
  executionSurface = null,
  detectedAt = new Date().toISOString(),
  readRuntimeInfo = readWechatRuntimeInfo,
}) => {
  if (typeof projectDir !== "string" || projectDir.trim() === "") {
    throw new TypeError("projectDir must be a non-empty string");
  }

  const packageInfo = detectMiniProgramPackage({
    projectDir,
    artifactScope: projectDir,
    detectedAt,
  });
  const surface =
    executionSurface ?? packageInfo.executionSurface ?? "appservice";

  const runtimeInfo = await readRuntimeInfo({
    projectPath: projectDir,
    cliPath,
    timeoutMs,
    port,
    mode,
    observedAt: detectedAt,
  });
  if (!runtimeInfo?.sdkVersion) {
    throw new Error(
      "运行时没有返回 SDKVersion：没有版本画像就没有指纹，不构造证据。",
    );
  }

  const artifactPath = resolveFingerprintArtifactPath(projectDir);
  const evidence = buildWechatDeploymentFingerprint({
    evidenceId: `runtime-trace:${path.basename(projectDir)}:${detectedAt}`,
    projectDir,
    artifactPath,
    executionSurface: surface,
    scopeId: path.basename(projectDir),
    detectedAt,
    sdkVersion: runtimeInfo.sdkVersion,
    source: "runtime_trace",
  });

  const summary = {
    generatedAt: detectedAt,
    projectDir,
    platformFamily: packageInfo.platformFamily,
    packageSignals: packageInfo.signals.map((signal) => signal.signalId),
    executionSurface: surface,
    artifactPath,
    artifactHash: evidence.artifactHash,
    sdkVersion: runtimeInfo.sdkVersion,
    wechatVersion: runtimeInfo.wechatVersion,
    runtimePlatform: runtimeInfo.platform,
    connectionMode: runtimeInfo.connectionMode,
    evidence,
  };

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "deployment-fingerprint.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
  }
  return summary;
};

export const parseCollectFingerprintArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets", "deployment-fingerprint"),
    timeoutMs: 60000,
    port: 9420,
    mode: "auto",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    switch (argument) {
      case "--project":
        options.projectDir = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--out":
        options.outputDir = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--cli":
        options.cliPath = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--timeout":
        options.timeoutMs = positiveInteger(argument, next);
        index += 1;
        break;
      case "--port":
        options.port = positiveInteger(argument, next);
        index += 1;
        break;
      case "--mode":
        options.mode = connectionMode(argument, next);
        index += 1;
        break;
      case "--surface":
        options.executionSurface = value(argument, next);
        index += 1;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.help && !options.projectDir) {
    throw new Error("--project <path> is required");
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

const connectionMode = (argument, input) => {
  const parsed = value(argument, input);
  if (!["auto", "connect", "launch"].includes(parsed)) {
    throw new Error(`${argument} must be one of auto, connect, launch`);
  }
  return parsed;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseCollectFingerprintArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/collect-deployment-fingerprint.mjs --project <path> [options]",
        "",
        "Options:",
        "  --project <path>  被分析的小程序项目目录（必填）",
        "  --out <path>      输出目录",
        "  --cli <path>      微信开发者工具 cli.bat",
        "  --timeout <ms>    启动超时",
        "  --port <n>        自动化端口",
        "  --mode <mode>     auto | connect | launch",
        "  --surface <name>  覆盖执行表面（默认从包结构判定）",
      ].join("\n"),
    );
  } else {
    const summary = await collectDeploymentFingerprint(options);
    console.log(
      JSON.stringify(
        {
          projectDir: summary.projectDir,
          executionSurface: summary.executionSurface,
          artifactPath: summary.artifactPath,
          sdkVersion: summary.sdkVersion,
          evidenceId: summary.evidence.evidenceId,
          versionProfile: summary.evidence.versionProfile,
        },
        null,
        2,
      ),
    );
  }
}
