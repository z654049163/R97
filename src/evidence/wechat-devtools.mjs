import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import automator from "miniprogram-automator";

import {
  buildWechatProbeRequest,
  importWechatProbeResult,
  r97WechatAppServiceReady,
  WECHAT_PROBE_EXCLUDED_ROOTS,
} from "./wechat-probe.mjs";
import { createWechatOracleProbe } from "./oracle-probe.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..", "..");

export const DEFAULT_WECHAT_PROJECT_PATH = path.join(
  PROJECT_ROOT,
  "fixtures",
  "wechat-miniapp",
);

const CLI_CANDIDATES = [
  "E:\\微信开发者工具\\cli.bat",
  "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat",
  "C:\\Program Files (x86)\\Tencent\\WeChat DevTools\\cli.bat",
  "C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat",
];

export const findWechatCliPath = () => {
  if (
    process.env.R97_WECHAT_CLI_PATH &&
    existsSync(process.env.R97_WECHAT_CLI_PATH)
  ) {
    return process.env.R97_WECHAT_CLI_PATH;
  }
  return CLI_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tryConnect = async (launcher, wsEndpoint) => {
  if (typeof launcher.connect !== "function") {
    return null;
  }
  try {
    return await launcher.connect({ wsEndpoint });
  } catch {
    return null;
  }
};

const startDevtoolsAutomation = ({ cliPath, projectPath, port }) => {
  const command = process.env.ComSpec ?? "cmd.exe";
  try {
    const child = spawn(
      command,
      [
        "/c",
        cliPath,
        "auto",
        "--project",
        projectPath,
        "--auto-port",
        String(port),
        "--trust-project",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    child.on("error", () => {});
  } catch {
    // Connection polling below reports the failure with a clearer message.
  }
};

const acquireMiniProgram = async ({
  mode,
  launcher,
  cliPath,
  projectPath,
  timeoutMs,
  port,
}) => {
  if (mode === "launch") {
    const miniProgram = await launcher.launch({
      cliPath,
      projectPath,
      timeout: timeoutMs,
      port,
      trustProject: true,
    });
    return {
      miniProgram,
      connectionMode: "launch",
      release: async () => {
        try {
          await miniProgram.close();
        } catch {}
      },
    };
  }

  const wsEndpoint = `ws://127.0.0.1:${port}`;
  let miniProgram = await tryConnect(launcher, wsEndpoint);
  if (!miniProgram && mode === "auto") {
    startDevtoolsAutomation({ cliPath, projectPath, port });
    const deadline = Date.now() + timeoutMs;
    while (!miniProgram && Date.now() < deadline) {
      await sleep(1000);
      miniProgram = await tryConnect(launcher, wsEndpoint);
    }
  }
  if (!miniProgram) {
    throw new Error(
      `WeChat automation endpoint ${wsEndpoint} is unavailable. Run "${cliPath}" auto --project "${projectPath}" --auto-port ${port} --trust-project first, or pass mode "auto".`,
    );
  }
  return {
    miniProgram,
    connectionMode: "connect",
    wsEndpoint,
    release: async () => {
      try {
        if (typeof miniProgram.disconnect === "function") {
          miniProgram.disconnect();
        } else {
          await miniProgram.close();
        }
      } catch {}
    },
  };
};

export const collectWechatObservations = async ({
  entityDimensions,
  runtimeProfile,
  projectPath = DEFAULT_WECHAT_PROJECT_PATH,
  cliPath = findWechatCliPath(),
  timeoutMs = 60000,
  readinessTimeoutMs = null,
  requireAppServiceReady = true,
  port = 9420,
  observedAt = new Date().toISOString(),
  mode = "launch",
  probeBatchSize = 150,
  onProgress = null,
  launcher = automator,
}) => {
  if (!cliPath) {
    throw new Error(
      "WeChat DevTools CLI was not found. Set R97_WECHAT_CLI_PATH to cli.bat.",
    );
  }
  if (!existsSync(projectPath)) {
    throw new Error(`WeChat probe project does not exist: ${projectPath}`);
  }

  const requested = buildWechatProbeRequest(entityDimensions);
  if (Object.keys(requested).length === 0) {
    const empty = importWechatProbeResult({
      report: {
        stage: "node-vs-wechat",
        wechatTypeofs: {},
      },
      entityDimensions,
      runtimeProfile,
      observedAt,
    });
    return {
      ...empty,
      report: {
        stage: "node-vs-wechat",
        runtimeId: empty.runtimeId,
        generatedAt: observedAt,
        projectPath,
        cliPath,
        wechatTypeofs: {},
        wechatValues: {},
      },
    };
  }

  const session = await acquireMiniProgram({
    mode,
    launcher,
    cliPath,
    projectPath,
    timeoutMs,
    port,
  });
  const { miniProgram } = session;

  let rawValues;
  let systemInfo = null;
  let readiness;
  try {
    systemInfo = await readSystemInfo(miniProgram);
    readiness = await waitForAppServiceReady({
      miniProgram,
      timeoutMs: readinessTimeoutMs ?? Math.min(timeoutMs, 20000),
      onProgress,
    });
    if (!readiness.ready && requireAppServiceReady) {
      throw new Error(
        "WeChat AppService did not finish startup before probing; $gwx/wh/getApp never became observable. " +
          "Evidence collected at this point would report not-yet-installed globals as absent. " +
          "Re-run once the mini program has loaded, or pass requireAppServiceReady:false to accept the risk.",
      );
    }
    rawValues = await probeInBatches({
      miniProgram,
      requested,
      batchSize: probeBatchSize,
      onProgress,
    });
  } finally {
    await session.release();
  }

  const wechatValues = normalizeProbeValues(rawValues, requested);
  const probeErrors = Object.fromEntries(
    Object.entries(rawValues ?? {})
      .filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          typeof value.probeError === "string",
      )
      .map(([entityId, value]) => [entityId, value.probeError]),
  );
  const report = {
    stage: "node-vs-wechat",
    runtimeId: runtimeProfile?.runtimeId ?? "e4-wechat-real",
    generatedAt: observedAt,
    // 判卷要用的是哪把尺子、哪一天量的，都必须写进快照：
    // 微信基础库会变，Node 版本可以固定，微信不行。
    probeImplementation: "r97-oracle-probe",
    // 探针跑在固定 fixture 上，而观测会被用于别的项目。这个标记必须随报告一起
    // 存下来：跨项目证据里「存在」可外推、「不存在」不可，见 wechat-probe.mjs。
    scopeKind: "cross_project",
    excludedRoots: WECHAT_PROBE_EXCLUDED_ROOTS,
    projectPath,
    cliPath,
    connectionMode: session.connectionMode,
    wsEndpoint: session.wsEndpoint ?? null,
    sdkVersion: systemInfo?.SDKVersion ?? null,
    platform: systemInfo?.platform ?? null,
    appServiceReady: readiness?.ready ?? false,
    readinessAttempts: readiness?.attempts ?? 0,
    probeErrorCount: Object.keys(probeErrors).length,
    probeErrors,
    wechatValues,
    wechatTypeofs: Object.fromEntries(
      Object.entries(wechatValues).map(([entityId, values]) => [
        entityId,
        values.type ?? "undefined",
      ]),
    ),
  };
  const collection = importWechatProbeResult({
    report,
    entityDimensions,
    runtimeProfile,
    observedAt,
  });

  return {
    ...collection,
    sdkVersion: report.sdkVersion,
    platform: report.platform,
    report,
  };
};

const readSystemInfo = async (miniProgram) => {
  if (typeof miniProgram.systemInfo !== "function") {
    return null;
  }
  try {
    return await miniProgram.systemInfo();
  } catch {
    return null;
  }
};

/**
 * 只要运行时画像、不探实体。
 *
 * 目标确认需要的是「这个项目实际跑在哪个基础库版本上」。逐实体观测走
 * `collectWechatObservations`；这条通道只读一次 `systemInfo`，把开发者工具
 * 当成被分析项目的**部署侧来源**。产出用于 `runtime-fingerprint.mjs`。
 */
export const readWechatRuntimeInfo = async ({
  projectPath = DEFAULT_WECHAT_PROJECT_PATH,
  cliPath = findWechatCliPath(),
  timeoutMs = 60000,
  port = 9420,
  mode = "auto",
  observedAt = new Date().toISOString(),
  launcher = automator,
}) => {
  if (!cliPath) {
    throw new Error(
      "WeChat DevTools CLI was not found. Set R97_WECHAT_CLI_PATH to cli.bat.",
    );
  }
  if (!existsSync(projectPath)) {
    throw new Error(`WeChat probe project does not exist: ${projectPath}`);
  }

  const session = await acquireMiniProgram({
    mode,
    launcher,
    cliPath,
    projectPath,
    timeoutMs,
    port,
  });
  try {
    const systemInfo = await readSystemInfo(session.miniProgram);
    if (!systemInfo) {
      throw new Error(
        "WeChat DevTools did not return systemInfo; without it there is no version profile to bind.",
      );
    }
    return Object.freeze({
      observedAt,
      projectPath,
      cliPath,
      connectionMode: session.connectionMode,
      sdkVersion: systemInfo.SDKVersion ?? null,
      wechatVersion: systemInfo.version ?? null,
      platform: systemInfo.platform ?? null,
      deviceModel: systemInfo.model ?? null,
      osSystem: systemInfo.system ?? null,
    });
  } finally {
    await session.release();
  }
};

const waitForAppServiceReady = async ({
  miniProgram,
  timeoutMs,
  pollIntervalMs = 500,
  onProgress,
}) => {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const ready = await miniProgram.evaluate(r97WechatAppServiceReady);
      if (ready === true) {
        return { ready: true, attempts };
      }
    } catch {
      // 刚建立连接时求值可能失败，继续轮询。
    }
    onProgress?.({ phase: "readiness", attempts });
    await sleep(pollIntervalMs);
  }
  return { ready: false, attempts };
};

const probeInBatches = async ({
  miniProgram,
  requested,
  batchSize,
  onProgress,
  attempts = 2,
  maxConsecutiveFailures = 3,
}) => {
  const entityIds = Object.keys(requested);
  const merged = {};
  const batches = [];
  for (let index = 0; index < entityIds.length; index += batchSize) {
    batches.push(entityIds.slice(index, index + batchSize));
  }
  // 与 Node / Edge 判卷用的是同一份探针实现，环境之间的差异才是环境差异。
  const probe = createWechatOracleProbe();

  let consecutiveFailures = 0;
  let aborted = false;
  for (const [batchIndex, batch] of batches.entries()) {
    if (aborted) {
      for (const entityId of batch) {
        merged[entityId] = { probeError: "skipped after repeated failures" };
      }
      continue;
    }

    let batchValues = null;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts && !batchValues; attempt += 1) {
      try {
        const result = await miniProgram.evaluate(probe, batch);
        if (result && typeof result === "object" && !Array.isArray(result)) {
          batchValues = result;
        } else {
          lastError = new Error("WeChat probe returned a non-object result");
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (batchValues) {
      consecutiveFailures = 0;
      Object.assign(merged, batchValues);
    } else {
      consecutiveFailures += 1;
      for (const entityId of batch) {
        merged[entityId] = {
          probeError: String((lastError && lastError.message) || lastError),
        };
      }
      if (consecutiveFailures >= maxConsecutiveFailures) {
        aborted = true;
      }
    }
    onProgress?.({
      batch: batchIndex + 1,
      batchCount: batches.length,
      completed: Math.min((batchIndex + 1) * batchSize, entityIds.length),
      total: entityIds.length,
    });
  }
  return merged;
};

const normalizeProbeValues = (rawValues, requested) => {
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) {
    throw new TypeError("WeChat probe did not return an object");
  }

  const normalized = {};
  for (const [entityId, dimensions] of Object.entries(requested)) {
    const values = rawValues[entityId];
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      continue;
    }
    normalized[entityId] = Object.fromEntries(
      dimensions
        .filter(
          (dimension) =>
            Object.hasOwn(values, dimension) &&
            values[dimension] !== undefined,
        )
        .map((dimension) => [dimension, values[dimension]]),
    );
  }
  return normalized;
};
