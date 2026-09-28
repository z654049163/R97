/**
 * 在 GitHub 上找**含 Worker 的微信小程序项目**。
 *
 * 思路：先按关键词搜仓库，再对每个候选查一次文件树（`/git/trees?recursive=1`），
 * 看有没有 `workers/` 目录或 `createWorker` 相关文件。**不下载 tarball** ——
 * 文件树一次 API 调用就能回答「这个仓库有没有 Worker」，比下载再 grep 省几个
 * 数量级。
 *
 * GitHub 未认证 API 限制约 60 次/小时，所以只查前若干候选并把结果落盘，
 * 便于中断后接着跑。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";

const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
const outDir = path.resolve("datasets/worker-miniapp-candidates");

const SEARCH_QUERIES = [
  "wechat miniprogram",
  "微信小程序",
  "miniprogram demo",
  "miniprogram worker",
  "wx.createWorker",
  "小程序 多线程",
  "miniprogram 多线程",
  "wechat miniprogram worker",
];

/**
 * 带**总超时**的请求。
 *
 * 只用 `https.get` 的 socket timeout 不够：连接或 DNS 阶段卡住时它不触发，
 * 整个 top-level await 就永久悬挂（实测跑完 37 个仓库后脚本停住）。外面再包
 * 一层 `Promise.race`，保证任何一条请求都会 settle。
 */
const requestOnce = (apiPath, timeoutMs) =>
  new Promise((resolve) => {
    const headers = {
      "User-Agent": "r97-research",
      Accept: "application/vnd.github+json",
    };
    if (TOKEN) {
      headers.Authorization = `Bearer ${TOKEN}`;
    }
    let settled = false;
    const done = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const req = https.get(
      { hostname: "api.github.com", path: apiPath, headers, timeout: timeoutMs },
      (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            if (res.statusCode !== 200) {
              done({ error: `HTTP ${res.statusCode}`, body });
              return;
            }
            try {
              done(JSON.parse(body));
            } catch {
              done({ error: "parse failed" });
            }
          });
      },
    );
    // 动态 import 的 Promise 之前没人接，网络一旦悬挂整个脚本就停在这里。
    // 现在用静态 import + 显式超时，任何一条请求都一定会 settle。
    req.on("error", (error) => done({ error: error.message }));
    req.on("timeout", () => {
      req.destroy();
      done({ error: "timeout" });
    });
  });

const request = (apiPath, timeoutMs = 20000) =>
  Promise.race([
    requestOnce(apiPath, timeoutMs),
    new Promise((resolve) =>
      setTimeout(() => resolve({ error: "hard timeout" }), timeoutMs + 5000),
    ),
  ]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const repositories = new Map();
for (const query of SEARCH_QUERIES) {
  const result = await request(
    `/search/repositories?q=${encodeURIComponent(query)}&per_page=30&sort=stars`,
  );
  if (result.error) {
    console.log(`搜索失败 [${query}]: ${result.error}`);
    continue;
  }
  console.log(`[${query}] 命中 ${result.total_count}，取前 ${result.items.length}`);
  for (const item of result.items) {
    if (!repositories.has(item.full_name)) {
      repositories.set(item.full_name, {
        fullName: item.full_name,
        stars: item.stargazers_count,
        defaultBranch: item.default_branch,
        description: (item.description ?? "").slice(0, 100),
        queries: [],
      });
    }
    repositories.get(item.full_name).queries.push(query);
  }
  await sleep(1500);
}

console.log(`\n候选仓库去重后 ${repositories.size} 个，开始查文件树…\n`);

const withWorker = [];
const checked = [];
let apiCalls = 0;

/** 每查一个仓库就落盘：上一次崩溃时 119 个候选的检查结果全丢了。 */
const persist = () => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "worker-miniapp-candidates.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        authenticated: TOKEN !== null,
        searchQueries: SEARCH_QUERIES,
        repositoryCount: repositories.size,
        checkedCount: checked.length,
        withWorkerCount: withWorker.length,
        withWorker,
        checked,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
};

for (const repo of repositories.values()) {
  if (apiCalls >= 45) {
    console.log("接近 API 限额，停止查树（已落盘，可重跑）。");
    break;
  }
  const tree = await request(
    `/repos/${repo.fullName}/git/trees/${repo.defaultBranch}?recursive=1`,
  );
  apiCalls += 1;
  if (tree.error || !Array.isArray(tree.tree)) {
    persist();
    continue;
  }
  const workerPaths = tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        (/(^|\/)workers?\//i.test(entry.path) ||
          /(^|\/)worker\.js$/i.test(entry.path)),
    )
    .map((entry) => entry.path);
  const record = {
    fullName: repo.fullName,
    stars: repo.stars,
    defaultBranch: repo.defaultBranch,
    fileCount: tree.tree.length,
    workerPaths: workerPaths.slice(0, 20),
    workerPathCount: workerPaths.length,
  };
  checked.push(record);
  persist();
  if (workerPaths.length > 0) {
    withWorker.push(record);
    console.log(
      `  ✓ ${repo.fullName} (★${repo.stars}) —— ${workerPaths.length} 个 worker 路径`,
    );
    for (const p of workerPaths.slice(0, 4)) {
      console.log(`      ${p}`);
    }
  }
  await sleep(900);
}

persist();

console.log("");
console.log(`已检查 ${checked.length} 个仓库，其中 ${withWorker.length} 个含 Worker 路径。`);
console.log(`结果写入 ${outDir}/worker-miniapp-candidates.json`);
