/**
 * 采微信 **Worker 子环境**的观测，并与 AppService 侧逐条对照。
 *
 * 这是「多子环境差异」的第一份实测通道。此前 1572 个真实项目里没有一个含
 * `workers/`，只能靠 fixture 自带 Worker。两条必须知道的硬约束：
 *
 * 1. `app.json` 里必须有 `"workers": "workers"` —— 只放文件不声明，Worker
 *    能创建但收不到回包（`createWorker` 返回 undefined）。
 * 2. Worker 脚本里不要写顶层 `const` / 箭头函数声明，整个逻辑放进
 *    `worker.onMessage` 回调 —— 实测顶层声明会让脚本加载失败。
 *
 * 用法：先用 `tools/start-devtools-automation.mjs` 把带自动化端口的工具拉起来，
 * 再跑本脚本（它用 connect，不自己 launch）。默认跑 fixture；批量跑真实项目
 * 时用 `tools/run-worker-sweep.mjs`，或手动设置：
 *
 *   R97_WORKER_PROJECT=<项目目录>
 *   R97_WORKER_SCRIPT=<app.json 的 workers 根>/r97probe/index.js
 *   R97_WORKER_OUT=<报告目录>
 *   R97_WECHAT_PORT=<自动化端口>
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import automator from "miniprogram-automator";

const projectPath = path.resolve(
  process.env.R97_WORKER_PROJECT ?? path.join("fixtures", "wechat-miniapp"),
);
const workerScript =
  process.env.R97_WORKER_SCRIPT ?? "workers/r97probe/index.js";
const cliPath = process.env.R97_WECHAT_CLI_PATH ?? "E:\\微信开发者工具\\cli.bat";

/**
 * 在 **AppService** 里建 Worker、发实体列表，把回包挂到全局。
 *
 * 刻意**不**在一次 `evaluate` 里等 Promise：automator 的 evaluate 有自己的
 * 超时，跨进程等 Worker 回包会直接撞上它（实测报 "timeout waiting for
 * automator response"）。改成「触发 → 轮询全局变量」两段式，每次 evaluate
 * 都立即返回。
 */
const startWorkerProbe = (payload) => {
  const entityIds = payload.entityIds;
  const script = payload.workerScript;
  globalThis.__r97WorkerResult = null;
  globalThis.__r97WorkerError = null;
  try {
    const worker = wx.createWorker(script);
    globalThis.__r97Worker = worker;
    worker.onMessage((response) => {
      globalThis.__r97WorkerResult = response;
      try {
        worker.terminate();
      } catch {}
    });
    worker.postMessage({ entityIds });
    return "started";
  } catch (error) {
    globalThis.__r97WorkerError =
      (error && error.message) || String(error);
    return "error";
  }
};

const readWorkerResult = () => ({
  result: globalThis.__r97WorkerResult ?? null,
  error: globalThis.__r97WorkerError ?? null,
});

const entityIds = [
  "wx",
  "wx.request",
  "Page",
  "getApp",
  "Math",
  "Math.max",
  "JSON",
  "console",
  "setTimeout",
  "globalThis",
  "self",
  "document",
];

// 用 `connect` 连一个**已经在跑**的自动化会话，工具由
// `tools/start-devtools-automation.mjs` 以独立进程拉起来。
//
// 不用 `automator.launch`：它内部是 `spawn(cliPath, ["auto", ...])`，直接把
// `cli.bat` 当可执行文件 spawn，而 Windows 上批处理必须经 shell 才能执行，
// 于是报 "Failed to launch wechat web devTools"。
const port = Number.parseInt(process.env.R97_WECHAT_PORT ?? "9421", 10);
const miniProgram = await automator.connect({
  wsEndpoint: `ws://127.0.0.1:${port}`,
});

try {
  console.log("=== 步骤 1：基本连通性 ===");
  const basics = await miniProgram.evaluate(() => ({
    typeofWx: typeof wx,
    typeofGlobalThis: typeof globalThis,
    hasCreateWorker: typeof (wx && wx.createWorker),
  }));
  console.log(" ", JSON.stringify(basics));

  console.log("=== 步骤 2：能否创建 Worker ===");
  // 自动化端口打开不等于项目编译完成。实测直接探测时 createWorker 会返回
  // undefined，等几秒后同一个项目就能创建；这里轮询到 Worker 就绪为止。
  let created = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    created = await miniProgram.evaluate((script) => {
      try {
        const worker = wx.createWorker(script);
        const kind = typeof worker;
        let hasPost = "n/a";
        let hasOnMessage = "n/a";
        try {
          hasPost = typeof worker.postMessage;
          hasOnMessage = typeof worker.onMessage;
        } catch {}
        try {
          worker.terminate();
        } catch {}
        return { ok: true, kind, hasPost, hasOnMessage };
      } catch (error) {
        return { ok: false, error: (error && error.message) || String(error) };
      }
    }, workerScript);
    if (created?.ok && created.kind !== "undefined") break;
    if (attempt === 0) {
      console.log("  Worker 尚未就绪，等待项目编译...");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(" ", JSON.stringify(created));

  console.log("=== 步骤 3：Worker 往返 ===");
  const started = await miniProgram.evaluate(startWorkerProbe, {
    entityIds,
    workerScript,
  });
  console.log("  触发:", started);
  let response = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const polled = await miniProgram.evaluate(readWorkerResult);
    if (polled?.error) {
      throw new Error("Worker 侧报错: " + polled.error);
    }
    if (polled?.result) {
      response = polled.result;
      break;
    }
  }
  if (!response) {
    throw new Error("Worker 在 20 秒内没有回包");
  }
  console.log("  marker:", response?.marker);
  console.log("  environment:", JSON.stringify(response?.environment));

  console.log("=== AppService 侧读全局（对照）===");
  const appServiceView = await miniProgram.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      let current = globalThis;
      for (const part of id.split(".")) {
        if (current === null || current === undefined) break;
        try {
          current = current[part];
        } catch {
          current = undefined;
          break;
        }
      }
      out[id] = { existence: current !== undefined, type: typeof current };
    }
    return out;
  }, entityIds);
  for (const id of entityIds) {
    console.log(
      `  ${id.padEnd(14)} AppService=${JSON.stringify(appServiceView[id])}`,
    );
  }

  console.log("=== Worker 侧观测 ===");
  const report = {
    generatedAt: new Date().toISOString(),
    projectPath,
    workerScript,
    workerEnvironment: response?.environment ?? null,
    entityCount: entityIds.length,
    observations: {},
    divergentEntities: [],
  };
  for (const id of entityIds) {
    console.log(
      `  ${id.padEnd(14)} Worker=${JSON.stringify(response?.observations?.[id])}`,
    );
    const appService = appServiceView[id];
    const worker = response?.observations?.[id] ?? null;
    report.observations[id] = { appService, worker };
    if (
      !appService ||
      !worker ||
      appService.existence !== worker.existence ||
      appService.type !== worker.type
    ) {
      report.divergentEntities.push(id);
    }
  }
  report.divergentCount = report.divergentEntities.length;
  console.log("");
  console.log(
    `两侧不一致的实体：${report.divergentCount} / ${entityIds.length} —— ${report.divergentEntities.join(", ")}`,
  );

  const outputDir = process.env.R97_WORKER_OUT ?? "datasets/wechat-worker-subenvironment";
  const outputFileName =
    process.env.R97_WORKER_OUT_FILE ?? "worker-vs-appservice.json";
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, outputFileName),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  console.log(`报告写入 ${outputDir}/${outputFileName}`);
} finally {
  // 用 disconnect 而不是 close：close 会把开发者工具的自动化会话一起关掉，
  // 下一次 connect 就得重新拉工具（实测每次都要等 45 秒）。
  if (typeof miniProgram.disconnect === "function") {
    miniProgram.disconnect();
  }
}
