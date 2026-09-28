/**
 * 分页抓 `wx.createWorker` 的代码搜索命中。
 *
 * 上一版只取了 `per_page=30` 的第一页，等于把 4376 个命中的 99.3% 直接丢了。
 * GitHub 代码搜索每页最多 100、最多 1000 条结果，所以最多能覆盖 10 页。
 */
import https from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("需要 GITHUB_TOKEN");
  process.exit(1);
}

const QUERIES = [
  "wx.createWorker",
  "wx.createWorker language:javascript",
  "wx.createWorker language:typescript",
];

const api = (apiPath) =>
  new Promise((resolve) => {
    const req = https.get(
      {
        hostname: "api.github.com",
        path: apiPath,
        headers: {
          "User-Agent": "r97-research",
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
        },
        timeout: 25000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body: null });
          }
        });
      },
    );
    req.on("error", (error) => resolve({ status: 0, error: error.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
  });

const repositories = new Map();
const outDir = path.resolve("datasets/worker-miniapp-candidates");
mkdirSync(outDir, { recursive: true });

const persist = () => {
  writeFileSync(
    path.join(outDir, "code-search-paged.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        queries: QUERIES,
        repositoryCount: repositories.size,
        repositories: [...repositories.values()].sort(
          (left, right) => right.hits - left.hits,
        ),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
};

for (const query of QUERIES) {
  let total = null;
  for (let page = 1; page <= 10; page += 1) {
    const result = await api(
      `/search/code?q=${encodeURIComponent(query)}&per_page=100&page=${page}`,
    );
    if (result.status !== 200) {
      console.log(`[${query}] 第 ${page} 页 HTTP ${result.status}，停止翻页`);
      break;
    }
    if (total === null) {
      total = result.body.total_count;
      console.log(`[${query}] 总命中 ${total}`);
    }
    if (result.body.items.length === 0) {
      break;
    }
    for (const item of result.body.items) {
      const name = item.repository.full_name;
      if (!repositories.has(name)) {
        repositories.set(name, {
          fullName: name,
          hits: 0,
          paths: [],
        });
      }
      const entry = repositories.get(name);
      entry.hits += 1;
      if (entry.paths.length < 10) {
        entry.paths.push(item.path);
      }
    }
    console.log(
      `   第 ${page} 页 ${result.body.items.length} 条，累计仓库 ${repositories.size}`,
    );
    persist();
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

persist();
console.log(`\n去重后 ${repositories.size} 个仓库，写入 code-search-paged.json`);
