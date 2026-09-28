/**
 * 用 GitHub **代码搜索**找含 `wx.createWorker` 的仓库。
 *
 * 需要 GITHUB_TOKEN。未认证时 `/search/code` 直接返回 401 —— 这正是上一轮
 * 只能"猜关键词 + 查文件树"的原因。
 */
import https from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("需要 GITHUB_TOKEN");
  process.exit(1);
}

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

const QUERIES = [
  "wx.createWorker",
  "wx.createWorker language:javascript",
  "wx.createWorker language:typescript",
  "createWorker path:miniprogram",
  "r97probe", // 自检：应该只命中本项目（若已推送）
];

const repositories = new Map();
for (const query of QUERIES) {
  const result = await api(
    "/search/code?q=" + encodeURIComponent(query) + "&per_page=30",
  );
  if (result.status !== 200) {
    console.log(
      `[${query}] HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 120)}`,
    );
  } else {
    console.log(`[${query}] 命中 ${result.body.total_count} 个文件`);
    for (const item of result.body.items) {
      const name = item.repository.full_name;
      if (!repositories.has(name)) {
        repositories.set(name, {
          fullName: name,
          stars: item.repository.stargazers_count,
          paths: [],
        });
      }
      repositories.get(name).paths.push(item.path);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 3500));
}

console.log(`\n命中的去重仓库：${repositories.size} 个`);
for (const [name, info] of [...repositories.entries()].sort(
  (left, right) => right[1].stars - left[1].stars,
)) {
  console.log(`  ${name} (★${info.stars}) —— ${info.paths.length} 处`);
  for (const p of info.paths.slice(0, 3)) {
    console.log(`      ${p}`);
  }
}

const outDir = path.resolve("datasets/worker-miniapp-candidates");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "code-search-repositories.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      queries: QUERIES,
      repositoryCount: repositories.size,
      repositories: [...repositories.values()].sort(
        (left, right) => right.stars - left.stars,
      ),
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(`\n已写入 ${outDir}/code-search-repositories.json`);
