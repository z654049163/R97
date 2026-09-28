/**
 * 串行打开真实小程序项目，跑 Worker 子环境探针。
 *
 * 微信开发者工具的自动化会话同一时间只能服务一个项目，所以这里一个项目
 * 一个项目地：注入探针 -> 启动 `cli auto` -> 等端口 -> 跑
 * `verify-worker-probe.mjs` -> 杀掉本轮 cli 进程树 -> 下一个。
 *
 * 用法：
 *   node tools/run-worker-sweep.mjs
 *   node tools/run-worker-sweep.mjs --projects answer,qtimer,wechat_vue
 *   node tools/run-worker-sweep.mjs --port 9421 --timeout 150
 *
 * 只处理满足三个条件的项目：有浅层 app.json、app.json 里声明了 workers
 * 字符串、同目录有 project.config.json。其余项目直接在汇总里标 skipped。
 */
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";

const repoRoot = path.resolve(".");
const projectsRoot = path.resolve("datasets/worker-miniapp-projects");
const outputRoot = path.resolve("datasets/wechat-worker-subenvironment");
const probeSource = path.resolve("fixtures/wechat-miniapp/workers/r97probe/index.js");
const cliPath = process.env.R97_WECHAT_CLI_PATH ?? "E:\\微信开发者工具\\cli.bat";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const explicitProjects = (argValue("--projects") ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const port = Number.parseInt(argValue("--port") ?? "9421", 10);
const perProjectTimeoutMs =
  Number.parseInt(argValue("--timeout") ?? "150", 10) * 1000;
const isolateWorker = args.includes("--isolate");
const minimalHost = args.includes("--minimal-host");
const restartIde = args.includes("--restart-ide");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isPortOpen = (targetPort) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: targetPort });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });

const waitForPort = async (targetPort, deadline) => {
  while (Date.now() < deadline) {
    if (await isPortOpen(targetPort)) return true;
    await wait(1000);
  }
  return false;
};

const waitForPortClosed = async (targetPort, deadline) => {
  while (Date.now() < deadline) {
    if (!(await isPortOpen(targetPort))) return true;
    await wait(1000);
  }
  return false;
};

const killTree = (pid) => {
  spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
    windowsHide: true,
    stdio: "ignore",
  });
};

const restartWechatIde = async () => {
  // 实测：同一个 IDE 会话里切换项目时，Worker 包不会重新编译，createWorker
  // 一直返回 undefined；把 qtimer 原样复制一份也会失败，重启 IDE 后立刻成功。
  // 因此批量采集必须“一个项目一次冷启动”。
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-Process -Name '微信开发者工具' -ErrorAction SilentlyContinue | Stop-Process -Force",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  await wait(6000);
};

const findProjectLayout = (name) => {
  const directory = path.join(projectsRoot, name);
  const projectConfigPath = path.join(directory, "project.config.json");
  if (existsSync(projectConfigPath)) {
    try {
      const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf8"));
      const miniprogramRoot = String(projectConfig.miniprogramRoot ?? "")
        .replace(/\/+$/u, "");
      const appRoot = path.join(directory, miniprogramRoot);
      const appJsonPath = path.join(appRoot, "app.json");
      if (existsSync(appJsonPath)) {
        const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
        if (typeof appJson.workers === "string" && appJson.workers.trim()) {
          return {
            directory,
            appRoot,
            workersRoot: appJson.workers.replace(/\/+$/u, ""),
          };
        }
      }
    } catch {
      // 落到下面的递归查找。
    }
  }
  const candidates = [];
  const walk = (current, depth) => {
    if (depth > 2) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.name === "app.json") {
        candidates.push(fullPath);
      }
    }
  };
  walk(directory, 0);
  for (const appJsonPath of candidates) {
    let appJson;
    try {
      appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
    } catch {
      continue;
    }
    if (typeof appJson.workers !== "string" || !appJson.workers.trim()) continue;
    const appRoot = path.dirname(appJsonPath);
    if (!existsSync(path.join(appRoot, "project.config.json"))) continue;
    return {
      directory,
      appRoot,
      workersRoot: appJson.workers.replace(/\/+$/u, ""),
    };
  }
  return null;
};

const names = explicitProjects.length
  ? explicitProjects
  : readdirSync(projectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.endsWith(".tmp"))
      .map((entry) => entry.name)
      .sort();

mkdirSync(outputRoot, { recursive: true });
const records = [];

for (const name of names) {
  const layout = findProjectLayout(name);
  if (!layout) {
    console.log(`跳过 ${name}: 缺少 app.json workers 声明或 project.config.json`);
    records.push({ project: name, status: "skipped" });
    continue;
  }

  const workerScript = `${layout.workersRoot}/r97probe/index.js`;
  const probeTarget = path.join(
    layout.appRoot,
    layout.workersRoot,
    "r97probe",
    "index.js",
  );
  mkdirSync(path.dirname(probeTarget), { recursive: true });
  copyFileSync(probeSource, probeTarget);

  // 某些项目的 Worker 目录里有一个编译不过的脚本，会让整个 Worker 包加载
  // 失败（createWorker 返回 undefined）。--isolate 把项目自有 Worker 脚本移到
  // 项目外备份，只留探针；这是隔离实验，必须在汇总里保留标记。
  let isolatedWorker = false;
  if (isolateWorker) {
    const workersRootPath = path.join(layout.appRoot, layout.workersRoot);
    const backupRoot = path.join(outputRoot, name, "worker-backup");
    mkdirSync(backupRoot, { recursive: true });
    for (const entry of readdirSync(workersRootPath, { withFileTypes: true })) {
      if (entry.name === "r97probe") continue;
      renameSync(
        path.join(workersRootPath, entry.name),
        path.join(backupRoot, entry.name),
      );
    }
    isolatedWorker = true;
  }

  // 项目页面需要构建或有编译错误时，整个小程序无法启动，Worker 也就无从创建。
  // --minimal-host 只保留真实项目的 workers 声明和 Worker 目录，把页面入口换成
  // 最小宿主页；测量对象仍是微信 Worker 子环境，但必须在汇总里标注。
  let minimalHostRewritten = false;
  if (minimalHost) {
    const appJsonPath = path.join(layout.appRoot, "app.json");
    const originalAppJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
    const originalDir = path.join(outputRoot, name, "project-original");
    mkdirSync(originalDir, { recursive: true });
    copyFileSync(appJsonPath, path.join(originalDir, "app.json"));
    const appJsPath = path.join(layout.appRoot, "app.js");
    if (existsSync(appJsPath)) {
      copyFileSync(appJsPath, path.join(originalDir, "app.js"));
    }
    const minimalAppJson = {
      pages: ["pages/r97host/index"],
      window: originalAppJson.window ?? {},
      workers: originalAppJson.workers,
    };
    writeFileSync(appJsonPath, JSON.stringify(minimalAppJson, null, 2) + "\n", "utf8");
    const hostPageDir = path.join(layout.appRoot, "pages", "r97host");
    mkdirSync(hostPageDir, { recursive: true });
    writeFileSync(path.join(hostPageDir, "index.js"), "Page({ data: {} });\n", "utf8");
    writeFileSync(path.join(hostPageDir, "index.json"), "{}\n", "utf8");
    writeFileSync(path.join(hostPageDir, "index.wxml"), "<view>r97</view>\n", "utf8");
    writeFileSync(path.join(hostPageDir, "index.wxss"), "\n", "utf8");
    writeFileSync(appJsPath, "App({});\n", "utf8");
    minimalHostRewritten = true;
  }

  // 真实仓库里的 appid 属于项目作者，当前登录账号没有权限（实测 code 10）。
  // 只在数据集副本上改成游客测试号；原始仓库不动，改写记录进汇总。
  const rewrittenAppIds = [];
  for (const configName of ["project.config.json", "project.private.config.json"]) {
    const configPath = path.join(layout.appRoot, configName);
    if (!existsSync(configPath)) continue;
    let config;
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      continue;
    }
    if (config.appid && config.appid !== "touristappid") {
      rewrittenAppIds.push({ file: configName, original: config.appid });
      config.appid = "touristappid";
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    }
  }

  const projectOutputDir = path.join(outputRoot, name);
  mkdirSync(projectOutputDir, { recursive: true });
  const logPath = path.join(projectOutputDir, "probe.log");
  console.log(`\n=== ${name} ===`);
  console.log(`  project: ${layout.appRoot}`);
  console.log(`  worker:  ${workerScript}`);

  if (restartIde) {
    await restartWechatIde();
  }

  const cli = spawn(
    process.env.ComSpec ?? "cmd.exe",
    [
      "/c",
      cliPath,
      "auto",
      "--project",
      layout.appRoot,
      "--auto-port",
      String(port),
      "--trust-project",
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let cliOutput = "";
  cli.stdout.on("data", (chunk) => {
    cliOutput += chunk.toString();
  });
  cli.stderr.on("data", (chunk) => {
    cliOutput += chunk.toString();
  });

  const deadline = Date.now() + perProjectTimeoutMs;
  const opened = await waitForPort(port, deadline);
  let status = "failed";
  let error = null;
  let stdout = "";
  if (!opened) {
    error = "自动化端口未打开";
  } else {
    const result = spawnSync("node", ["tools/verify-worker-probe.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        R97_WORKER_PROJECT: layout.appRoot,
        R97_WORKER_SCRIPT: workerScript,
        R97_WORKER_OUT: projectOutputDir,
        R97_WECHAT_PORT: String(port),
      },
      encoding: "utf8",
      timeout: Math.max(30_000, deadline - Date.now()),
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.error) {
      error = result.error.message;
    } else if (result.status !== 0) {
      error = `verify 退出码 ${result.status}`;
    } else {
      status = "ok";
    }
  }

  writeFileSync(
    logPath,
    [
      `# ${name}`,
      "",
      `status: ${status}`,
      error ? `error: ${error}` : "",
      "",
      "## verify-worker-probe",
      stdout,
      "",
      "## cli output",
      cliOutput,
    ].join("\n"),
    "utf8",
  );

  killTree(cli.pid);
  const closed = await waitForPortClosed(port, Date.now() + 20_000);
  records.push({
    project: name,
    status,
    error,
    appRoot: path.relative(repoRoot, layout.appRoot),
    workerScript,
    isolatedWorker,
    minimalHostRewritten,
    rewrittenAppIds,
    log: path.relative(repoRoot, logPath),
    portClosed: closed,
  });
  console.log(`  ${status}${error ? `: ${error}` : ""}`);
  await wait(3000);
}

const summaryPath = path.join(outputRoot, "sweep-summary.json");
const previousRecords = (() => {
  try {
    return JSON.parse(readFileSync(summaryPath, "utf8")).records ?? [];
  } catch {
    return [];
  }
})();
const mergedRecords = new Map(
  previousRecords.map((record) => [record.project, record]),
);
for (const record of records) {
  mergedRecords.set(record.project, record);
}

writeFileSync(
  summaryPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      port,
      records: [...mergedRecords.values()],
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log("\n=== 汇总 ===");
for (const record of records) {
  console.log(`  ${record.project}: ${record.status}${record.error ? ` (${record.error})` : ""}`);
}
process.exit(0);
