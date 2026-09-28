import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import { createServer } from "node:net";
import path from "node:path";

const DEFAULT_STARTUP_TIMEOUT_MS = 30000;

let profileCounter = 0;

/**
 * 回收浏览器进程。
 *
 * 两个坑叠在一起：
 *
 * 1. `child.kill()` 在 Windows 上只结束父进程，Chromium 的 `--type=gpu-process`、
 *    `--type=utility`、`--type=crashpad-handler` 会变成孤儿继续占着 `--user-data-dir`。
 *    改用 `taskkill /F /T` 杀整棵树。
 * 2. **父进程会先退出**：Edge 150 启动后 launcher 进程立刻以 code 0 结束、把浏览器
 *    交给子进程接管（这也是 stderr 拿不到日志的原因）。父 pid 没了之后
 *    `taskkill /PID` 无从下手，必须按 `--user-data-dir` 反查残留进程。
 *
 * 本机曾因此累积到 94 个残留进程，现场表现为「浏览器可执行文件存在、版本号可读，
 * 但命令行启动 1 秒内 code 0 退出且 stderr 全空」。
 */
const killBrowserProcesses = ({ child, profileDir }) => {
  if (child && typeof child.kill === "function") {
    if (process.platform === "win32" && child.pid) {
      try {
        spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        // 落到下面的兜底。
      }
    } else {
      try {
        child.kill();
      } catch {
        // 进程可能已经退出。
      }
    }
  }

  // 按 profile 目录兜底：父进程已经退出时，只有这条路能清掉接管进程。
  if (process.platform === "win32" && typeof profileDir === "string") {
    const escaped = profileDir.replaceAll("'", "''");
    try {
      spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${escaped}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: "ignore", windowsHide: true },
      );
    } catch {
      // 兜底清理失败不改变调用方的结论。
    }
  }
};

/** 取一个空闲端口：让浏览器用固定端口启动，才能主动去查它的 HTTP 端点。 */
const findFreePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port === null) {
          reject(new Error("Could not allocate a free port for DevTools"));
        } else {
          resolve(port);
        }
      });
    });
  });

/**
 * 主动轮询 `http://127.0.0.1:<port>/json/version` 拿 WebSocket 地址。
 *
 * 不再解析 stderr 里的 `DevTools listening on ...`：Edge 150 把这个日志的管道断开
 * 了（父进程退出、子进程接管），stderr 永远是空的，而 HTTP 端点一直是好的。实测
 * stderr 长度 0 的同时 `/json/version` 正常返回 `Edg/150.0.4078.83`。
 */
const waitForDevToolsViaHttp = async ({ port, child, timeoutMs, readStderr }) => {
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  let exitCode = null;
  const onExit = (code) => {
    exited = true;
    exitCode = code;
  };
  child.once("exit", onExit);

  try {
    while (Date.now() < deadline) {
      const endpoint = await readDevToolsWebSocketUrl(port);
      if (endpoint) {
        return endpoint;
      }
      // 父进程退出不代表失败（Edge 会把浏览器交给子进程），只在端口也不通时才
      // 当作失败，因此这里不因 exited 提前返回。
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  } finally {
    child.off("exit", onExit);
  }

  const detail = readStderr().trim().split("\n").slice(-3).join(" | ");
  throw new Error(
    `Browser did not expose a DevTools endpoint within ${timeoutMs}ms` +
      (exited ? ` (launcher exited with code ${exitCode})` : "") +
      (detail ? `; stderr: ${detail}` : ""),
  );
};

const readDevToolsWebSocketUrl = (port) =>
  new Promise((resolve) => {
    const request = http.get(
      { host: "127.0.0.1", port, path: "/json/version", timeout: 1500 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body).webSocketDebuggerUrl ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
  });

/**
 * 每次启动用独立的 user-data-dir。
 *
 * 固定 profile 目录会在并发或连续运行之间互相锁住，表现为 Edge 直接以
 * 退出码 21 结束、连 DevTools 端点都起不来。调用方给的是基目录，这里派生子目录。
 */
const deriveProfileDir = (baseDir) => {
  profileCounter += 1;
  const derived = path.join(
    baseDir,
    `run-${process.pid}-${profileCounter}`,
  );
  mkdirSync(derived, { recursive: true });
  return derived;
};

export const launchCdpBrowser = async ({
  browserPath,
  profileDir,
  extraArgs = [],
  startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
}) => {
  if (typeof browserPath !== "string" || browserPath.trim() === "") {
    throw new TypeError("browserPath must be a non-empty string");
  }
  const effectiveProfileDir = deriveProfileDir(profileDir);
  // 用固定端口而不是 `--remote-debugging-port=0`：端口为 0 时只能靠浏览器把
  // 实际端口打印出来，而 Edge 150 已经不再往 stderr 打印了（见
  // waitForDevToolsViaHttp 的说明）。
  const port = await findFreePort();
  let stderrText = "";

  const child = spawn(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${effectiveProfileDir}`,
      ...extraArgs,
      "about:blank",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.on("data", (chunk) => {
    stderrText += chunk.toString();
  });

  // 启动失败必须回收进程，否则失败探测会留下占着 profile 的残留。
  let wsUrl;
  try {
    wsUrl = await waitForDevToolsViaHttp({
      port,
      child,
      timeoutMs: startupTimeoutMs,
      readStderr: () => stderrText,
    });
  } catch (error) {
    killBrowserProcesses({ child, profileDir: effectiveProfileDir });
    throw error;
  }
  return { child, wsUrl, profileDir: effectiveProfileDir, port };
};

let browserUsabilityCache = null;

/**
 * 浏览器**能不能真的启动**。
 *
 * `findBrowserPath()` 只回答「文件在不在」——本机上 Edge 可执行文件存在、版本号也
 * 读得出来，但命令行启动会在 1 秒内以 code 0 静默退出，既没有 DevTools endpoint
 * 也没有任何 stderr。所有依赖浏览器执行的调用点都应该先问这个函数，否则会把
 * 「环境不可用」误报成「代码出错」。结果缓存，一次进程内只探测一次。
 */
export const isBrowserUsable = async ({
  browserPath,
  startupTimeoutMs = 8000,
} = {}) => {
  if (browserUsabilityCache !== null) {
    return browserUsabilityCache;
  }
  if (typeof browserPath !== "string" || !existsSync(browserPath)) {
    browserUsabilityCache = false;
    return false;
  }
  try {
    const probeProfileDir = path.join(
      process.cwd(),
      ".runtime",
      "usability-probe",
    );
    const { child } = await launchCdpBrowser({
      browserPath,
      profileDir: probeProfileDir,
      startupTimeoutMs,
    });
    killBrowserProcesses({ child, profileDir: probeProfileDir });
    browserUsabilityCache = true;
  } catch {
    browserUsabilityCache = false;
  }
  return browserUsabilityCache;
};

export const openCdpSession = async ({ wsUrl, timeoutMs = 20000 }) => {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out opening DevTools WebSocket")),
      timeoutMs,
    );
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("DevTools WebSocket failed to open"));
    });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(`${message.error.message} (${entry.method})`));
      return;
    }
    entry.resolve(message.result);
  });

  const send = (method, params = {}, sessionId = undefined) =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });

  return {
    send,
    close: () => socket.close(),
  };
};

export const withCdpPage = async (
  { browserPath, profileDir, extraArgs = [], startupTimeoutMs },
  run,
) => {
  const { child, wsUrl, profileDir: runProfileDir } = await launchCdpBrowser({
    browserPath,
    profileDir,
    extraArgs,
    startupTimeoutMs,
  });
  let session = null;
  try {
    session = await openCdpSession({ wsUrl });
    const version = await session.send("Browser.getVersion");
    const { targetId } = await session.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await session.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await session.send("Runtime.enable", {}, sessionId);
    return await run({
      browserVersion: {
        product: version.product,
        revision: version.revision,
        userAgent: version.userAgent,
        protocolVersion: version.protocolVersion,
      },
      evaluate: async (expression) => {
        const response = await session.send(
          "Runtime.evaluate",
          {
            expression,
            returnByValue: true,
            awaitPromise: true,
            timeout: 10000,
          },
          sessionId,
        );
        if (response.exceptionDetails) {
          const detail =
            response.exceptionDetails.exception?.description ??
            response.exceptionDetails.text;
          throw new Error(`Browser evaluation failed: ${detail}`);
        }
        return response.result?.value;
      },
    });
  } finally {
    session?.close();
    killBrowserProcesses({ child, profileDir: runProfileDir });
    await releaseProfileDir(runProfileDir);
  }
};

/**
 * 删除本次运行专用的 profile 目录。
 *
 * `child.kill()` 只是发信号，浏览器还会持有句柄一小会儿，第一次 `rmSync`
 * 往往失败。重试几次；仍然失败就留下（不影响正确性，只是占空间）。
 */
const releaseProfileDir = async (directory) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
};
