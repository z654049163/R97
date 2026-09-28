/**
 * 下载挑选出的「真·小程序含 Worker」项目，准备用开发者工具跑 Worker 探针。
 *
 * 只抓 tarball，不做构建——这一步的目的是先看清项目结构（有没有 app.json、
 * project.config.json、workers 目录），再决定哪些能直接打开。
 *
 * 用法：
 *   node tools/fetch-worker-miniapps.mjs --limit 12
 *   node tools/fetch-worker-miniapps.mjs --repos owner/name,owner/name
 *
 * 默认从 real-worker-miniapps-paged.json 里读真实项目候选，并排除路径或仓库名
 * 明显是 demo / examples / docs / study 的仓库。下载先落到 `.tmp`，解压失败会
 * 清理，避免留下半成品目录。
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import path from "node:path";

const FETCH_TIMEOUT_MS = 180_000;
const TAR_TIMEOUT_MS = 120_000;

const outRoot = path.resolve("datasets/worker-miniapp-projects");
mkdirSync(outRoot, { recursive: true });

const token = process.env.GITHUB_TOKEN ?? null;

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const limit = Number.parseInt(argValue("--limit") ?? "12", 10);
const explicitRepositories = (argValue("--repos") ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const demoPathPattern =
  /(^|\/)(demo|demos|example|examples|sample|samples|docs?|tutorial|blog|study|notes|test|tests)(\/|$)/iu;
const demoNamePattern =
  /(^|[-_.])(demo|docs?|example|sample|tutorial|study|notes|blog)([-_.]|$)/iu;

const repositories = (() => {
  if (explicitRepositories.length > 0) {
    return explicitRepositories;
  }
  const candidatesPath = path.join(
    "datasets/worker-miniapp-candidates",
    "real-worker-miniapps-paged.json",
  );
  const candidates = JSON.parse(readFileSync(candidatesPath, "utf8")).realMiniapps;
  return candidates
    .filter((item) => !demoNamePattern.test(item.fullName.split("/")[1] ?? ""))
    .filter(
      (item) =>
        (item.appJsonPaths ?? []).length > 0 &&
        !demoPathPattern.test(item.appJsonPaths[0]),
    )
    .sort((left, right) => left.fileCount - right.fileCount)
    .slice(0, limit)
    .map((item) => item.fullName);
})();

const extractTarball = (body, targetDir) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      ["-xz", "-C", targetDir, "--strip-components=1"],
      { stdio: ["pipe", "ignore", "pipe"], windowsHide: true },
    );
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      // tar 在 Windows 上可能带子进程；只 kill 主进程会留下锁住目录的孤儿。
      spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], {
        windowsHide: true,
        stdio: "ignore",
      });
      finish(new Error(`tar 超时（${TAR_TIMEOUT_MS / 1000}s）`));
    }, TAR_TIMEOUT_MS);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish(error));
    child.on("exit", (code) =>
      code === 0
        ? finish(null)
        : finish(new Error(`tar 退出码 ${code}: ${stderr.trim().slice(0, 200)}`)),
    );
    // Node 的 fetch 返回 Web ReadableStream；提前关闭 stdin 会触发 EPIPE，
    // 这里吞掉即可，真正的失败由 tar 退出码或超时表达。
    child.stdin.on("error", () => {});
    const readable = Readable.fromWeb(body);
    // 超时会中止 response body；不接住源流的 error，Node 会把它当未处理异常
    // 直接终止进程（实测：tar 收到 EPIPE / TimeoutError 时整个脚本崩掉）。
    readable.on("error", (error) => finish(error));
    readable.pipe(child.stdin);
  });

const statuses = [];

const removeQuietly = (target) => {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (error) {
    console.log(`清理失败（忽略）: ${target}: ${error.message}`);
  }
};

for (const repository of repositories) {
  const [owner, name] = repository.split("/");
  const targetDir = path.join(outRoot, name);
  if (
    (() => {
      try {
        return readdirSync(targetDir).length > 0;
      } catch {
        return false;
      }
    })()
  ) {
    console.log(`跳过（已下载）: ${repository}`);
    statuses.push({ repository, status: "skipped" });
    continue;
  }
  const url = `https://codeload.github.com/${owner}/${name}/tar.gz/HEAD`;
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.log(`失败 ${repository}: HTTP ${response.status}`);
      statuses.push({ repository, status: "failed", error: `HTTP ${response.status}` });
      continue;
    }
    const temporaryDir = `${targetDir}.tmp`;
    removeQuietly(temporaryDir);
    mkdirSync(temporaryDir, { recursive: true });
    // tar.gz 解包用系统 tar（Windows 10+ 自带 bsdtar），避免引入依赖。
    await extractTarball(response.body, temporaryDir);
    removeQuietly(targetDir);
    renameSync(temporaryDir, targetDir);
    const entries = readdirSync(targetDir);
    console.log(`✓ ${repository} → ${entries.length} 个顶层条目`);
    statuses.push({ repository, status: "ok", topLevelEntries: entries.length });
  } catch (error) {
    removeQuietly(`${targetDir}.tmp`);
    console.log(`失败 ${repository}: ${error.message}`);
    statuses.push({ repository, status: "failed", error: error.message });
  }
}

writeFileSync(
  path.join(outRoot, "fetch-status.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      repositories,
      statuses,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

// 保留一个明确的退出点：旧版在 tar / socket 未释放时会一直挂在事件循环里。
process.exit(0);
