/**
 * 一次性诊断：最小 Worker 能不能收到消息并回包。
 *
 * 分成两步执行，避免 automator 的 evaluate 超时：
 * 第一步建 Worker 并把回包挂到全局，第二步轮询全局。
 */
import automator from "miniprogram-automator";

const port = Number.parseInt(process.env.R97_WECHAT_PORT ?? "9421", 10);
const workerScript =
  process.env.R97_WORKER_SCRIPT ?? "workers/r97minimal/index.js";

const miniProgram = await automator.connect({
  wsEndpoint: `ws://127.0.0.1:${port}`,
});

try {
  const started = await miniProgram.evaluate((script) => {
    globalThis.__result = null;
    globalThis.__error = null;
    try {
      const worker = wx.createWorker(script);
      globalThis.__worker = worker;
      worker.onMessage((response) => {
        globalThis.__result = response;
      });
      worker.postMessage({ ping: "hello", at: Date.now() });
      return "started";
    } catch (error) {
      globalThis.__error = (error && error.message) || String(error);
      return "error";
    }
  }, workerScript);
  console.log("触发:", started);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const polled = await miniProgram.evaluate(() => ({
      result: globalThis.__result ?? null,
      error: globalThis.__error ?? null,
    }));
    if (polled?.error) {
      console.log("主线程报错:", polled.error);
      break;
    }
    if (polled?.result) {
      console.log("Worker 回包:", JSON.stringify(polled.result, null, 2));
      break;
    }
    if (attempt === 29) {
      console.log("15 秒内没有回包");
    }
  }
} finally {
  await miniProgram.disconnect?.();
}
