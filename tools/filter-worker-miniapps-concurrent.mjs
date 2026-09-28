/**
 * 并发版结构筛选：从代码搜索命中的仓库里挑出**真·小程序且含 Worker** 的。
 *
 * 与串行版的区别：并发 8 个请求、去掉 sleep（额度 5000 足够）。串行版跑
 * 33 个仓库要半小时，230 个跑不完。
 *
 * 判据（两个结构信号，不看文件名）：
 * 1. 有 `app.json`（小程序；小游戏用 `game.json`）
 * 2. 有 `workers/` 目录
 * 另加两条排除：仓库名含 `docs`、`app.json` 嵌在三层以上子目录 —— 那是文档
 * 仓库把别人的 demo 抄进来的情况（实测命中过 `wechat_miniprogram_docs`）。
 */
import https from "node:https";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("需要 GITHUB_TOKEN");
  process.exit(1);
}

const outDir = path.resolve("datasets/worker-miniapp-candidates");
const inputPath = path.join(outDir, "code-search-paged.json");
const candidates = JSON.parse(readFileSync(inputPath, "utf8"));

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
        timeout: 20000,
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
    // 总超时兜底：socket timeout 在连接阶段不触发，会永久悬挂。
    setTimeout(() => {
      try {
        req.destroy();
      } catch {}
      resolve({ status: 0, error: "hard timeout" });
    }, 25000);
  });

const previous = (() => {
  try {
    return JSON.parse(
      readFileSync(path.join(outDir, "real-worker-miniapps-paged.json"), "utf8"),
    );
  } catch {
    return null;
  }
})();
const checked = previous?.checked ?? [];
const alreadyChecked = new Set(checked.map((item) => item.fullName));

const inspect = async (repo) => {
  const meta = await api(`/repos/${repo.fullName}`);
  if (meta.status !== 200 || !meta.body?.default_branch) {
    return { fullName: repo.fullName, error: `meta HTTP ${meta.status}` };
  }
  const tree = await api(
    `/repos/${repo.fullName}/git/trees/${meta.body.default_branch}?recursive=1`,
  );
  if (tree.status !== 200 || !Array.isArray(tree.body?.tree)) {
    return { fullName: repo.fullName, error: `tree HTTP ${tree.status}` };
  }
  const paths = tree.body.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);
  const appJsonPaths = paths.filter(
    (p) => /(^|\/)app\.json$/u.test(p) && !/node_modules/u.test(p),
  );
  const gameJsonPaths = paths.filter((p) => /(^|\/)game\.json$/u.test(p));
  const workerPaths = paths.filter((p) => /(^|\/)workers?\//iu.test(p));
  // 排除：文档仓库、app.json 嵌得太深（那是别人项目的副本）。
  const shallowAppJson = appJsonPaths.some(
    (p) => p.split("/").length <= 4,
  );
  const isDocRepo = /docs?$/iu.test(repo.fullName.split("/")[1] ?? "");
  return {
    fullName: repo.fullName,
    hits: repo.hits,
    fileCount: paths.length,
    appJsonPaths: appJsonPaths.slice(0, 5),
    gameJsonPaths: gameJsonPaths.slice(0, 3),
    workerPaths: workerPaths.slice(0, 10),
    workerPathCount: workerPaths.length,
    isMiniappWithWorker:
      appJsonPaths.length > 0 && workerPaths.length > 0 && shallowAppJson,
    isMiniGameOnly: appJsonPaths.length === 0 && gameJsonPaths.length > 0,
    excludedAsDocRepo: isDocRepo && appJsonPaths.length > 0,
  };
};

const queue = candidates.repositories.filter(
  (repo) => !alreadyChecked.has(repo.fullName),
);
console.log(`待检查 ${queue.length} 个（已完成 ${checked.length}）`);

const CONCURRENCY = 8;
let cursor = 0;
let completed = 0;
const persist = () => {
  writeFileSync(
    path.join(outDir, "real-worker-miniapps-paged.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        candidateCount: candidates.repositories.length,
        checkedCount: checked.length,
        realMiniappCount: checked.filter((item) => item.isMiniappWithWorker)
          .length,
        realMiniapps: checked.filter((item) => item.isMiniappWithWorker),
        checked,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
};

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < queue.length) {
      const repo = queue[cursor];
      cursor += 1;
      const record = await inspect(repo);
      checked.push(record);
      completed += 1;
      if (record.isMiniappWithWorker) {
        console.log(
          `  ✓ ${record.fullName} —— app.json ${record.appJsonPaths.length} / workers ${record.workerPathCount}`,
        );
      }
      if (completed % 10 === 0) {
        persist();
        console.log(`  进度 ${completed}/${queue.length}`);
      }
    }
  }),
);

persist();
const real = checked.filter((item) => item.isMiniappWithWorker);
console.log("");
console.log(
  `共检查 ${checked.length} / ${candidates.repositories.length}，**真·小程序且含 Worker** ${real.length} 个：`,
);
for (const m of real) {
  console.log(`  ${m.fullName} —— workers ${m.workerPathCount}`);
}
