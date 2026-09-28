/**
 * 从代码搜索命中的仓库里筛出**真·小程序且含 Worker** 的。
 *
 * 判据刻意用两个**结构信号**而不是文件名：
 * 1. 仓库里存在 `app.json` —— 小程序的标志（小游戏用 `game.json`）
 * 2. 存在 `workers/` 目录 —— Worker 代码的约定位置
 *
 * 上一轮只按关键词搜仓库名，119 个候选里 3 个是误报（TypeScript 前端、three.js
 * 加载器、Java 类）；代码搜索把命中面收敛到"文件里真的出现 wx.createWorker"，
 * 但里面仍有大量小游戏、适配器和文档，所以还要做这一步结构筛选。
 */
import https from "node:https";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("需要 GITHUB_TOKEN");
  process.exit(1);
}

const candidatesPath = path.resolve(
  "datasets/worker-miniapp-candidates/code-search-repositories.json",
);
const candidates = JSON.parse(readFileSync(candidatesPath, "utf8"));
const outDir = path.resolve("datasets/worker-miniapp-candidates");

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

// 断点续跑：`https` 在这里会随机悬挂（同一类超时问题），一次跑不完 67 个。
// 读回已有进度，跳过检查过的仓库，反复跑几次就能覆盖全。
const previous = (() => {
  try {
    return JSON.parse(
      readFileSync(path.join(outDir, "real-worker-miniapps.json"), "utf8"),
    );
  } catch {
    return null;
  }
})();
const realMiniapps = previous?.realMiniapps ?? [];
const checked = previous?.checked ?? [];
const alreadyChecked = new Set(checked.map((item) => item.fullName));

/** 每查一个就落盘：上一版在第 67 个仓库上悬挂，整轮结果全没写出去。 */
const persist = () => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "real-worker-miniapps.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        candidateCount: candidates.repositories.length,
        checkedCount: checked.length,
        realMiniappCount: realMiniapps.length,
        realMiniapps,
        checked,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
};

for (const repo of candidates.repositories) {
  if (alreadyChecked.has(repo.fullName)) {
    continue;
  }
  const meta = await api(`/repos/${repo.fullName}`);
  if (meta.status !== 200 || !meta.body?.default_branch) {
    checked.push({ ...repo, error: `meta HTTP ${meta.status}` });
    persist();
    continue;
  }
  const tree = await api(
    `/repos/${repo.fullName}/git/trees/${meta.body.default_branch}?recursive=1`,
  );
  if (tree.status !== 200 || !Array.isArray(tree.body?.tree)) {
    checked.push({ ...repo, error: `tree HTTP ${tree.status}` });
    persist();
    continue;
  }
  const paths = tree.body.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);
  const appJsonPaths = paths.filter(
    (p) => /(^|\/)app\.json$/u.test(p) && !/node_modules/u.test(p),
  );
  const gameJsonPaths = paths.filter((p) => /(^|\/)game\.json$/u.test(p));
  const workerPaths = paths.filter((p) => /(^|\/)workers?\//iu.test(p));

  const record = {
    fullName: repo.fullName,
    stars: repo.stars,
    appJsonPaths: appJsonPaths.slice(0, 5),
    gameJsonPaths: gameJsonPaths.slice(0, 3),
    workerPaths: workerPaths.slice(0, 10),
    workerPathCount: workerPaths.length,
    // 真小程序的判据：有小程序配置 + 有 workers 目录，且不是纯小游戏。
    isMiniappWithWorker: appJsonPaths.length > 0 && workerPaths.length > 0,
    isMiniGameOnly: appJsonPaths.length === 0 && gameJsonPaths.length > 0,
  };
  checked.push(record);
  persist();
  if (record.isMiniappWithWorker) {
    realMiniapps.push(record);
    console.log(
      `  ✓ ${repo.fullName} (★${repo.stars}) —— app.json ${appJsonPaths.length} 处 / workers ${workerPaths.length} 处`,
    );
    for (const p of workerPaths.slice(0, 3)) {
      console.log(`      ${p}`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
}

persist();
const remaining = candidates.repositories.length - checked.length;
console.log("");
console.log(
  `已检查 ${checked.length} / ${candidates.repositories.length}（剩 ${remaining}），` +
    `**真·小程序且含 Worker** 的有 ${realMiniapps.length} 个。`,
);
if (remaining > 0) {
  console.log("还有未检查的——脚本被网络悬挂打断，再跑一次即可续上。");
}
console.log(`已写入 ${outDir}/real-worker-miniapps.json`);
