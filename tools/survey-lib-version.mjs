/**
 * 一次性调查：样本包里有多少项目带可用的基础库版本画像。
 *
 * 之前只按文件名找 `project.config.json`（3 个，且都在子目录），结论是「包内没有
 * 版本信息」。改成按内容搜索后 `project.private.config.json` 有 356 个——这是
 * 微信开发者工具生成的项目配置，含具体 `libVersion`。
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const root =
  process.argv[2] ?? "E:\\复现\\sample_collector\\可用于实验的干净源码包";

const projects = readdirSync(root).filter((name) => {
  try {
    return statSync(path.join(root, name)).isDirectory();
  } catch {
    return false;
  }
});

const versionCounts = new Map();
let withPrivateConfig = 0;
let withConcreteVersion = 0;
let withSecondSource = 0;
const placeholders = new Map();
const appConfigVersions = new Map();

for (const project of projects) {
  const dir = path.join(root, project);
  const privatePath = path.join(dir, "project.private.config.json");
  const publicPath = path.join(dir, "project.config.json");
  const appConfigPath = path.join(dir, "app-config.json");

  if (existsSync(appConfigPath)) {
    try {
      const parsed = JSON.parse(readFileSync(appConfigPath, "utf8"));
      if (parsed.version !== undefined) {
        const key = JSON.stringify(parsed.version);
        appConfigVersions.set(key, (appConfigVersions.get(key) ?? 0) + 1);
      }
    } catch {
      // 忽略无法解析的
    }
  }

  if (!existsSync(privatePath)) {
    continue;
  }
  withPrivateConfig += 1;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(privatePath, "utf8"));
  } catch {
    continue;
  }
  const libVersion = parsed.libVersion;
  if (typeof libVersion !== "string") {
    continue;
  }
  if (/^\d+\.\d+\.\d+$/u.test(libVersion)) {
    withConcreteVersion += 1;
    versionCounts.set(libVersion, (versionCounts.get(libVersion) ?? 0) + 1);
    // 第二个独立来源：同目录下的 project.config.json 也给出同一版本。
    if (existsSync(publicPath)) {
      try {
        const publicConfig = JSON.parse(readFileSync(publicPath, "utf8"));
        if (publicConfig.libVersion === libVersion) {
          withSecondSource += 1;
        }
      } catch {
        // 忽略
      }
    }
  } else {
    placeholders.set(libVersion, (placeholders.get(libVersion) ?? 0) + 1);
  }
}

console.log("项目总数:", projects.length);
console.log("有 project.private.config.json:", withPrivateConfig);
console.log("其中 libVersion 是具体版本号:", withConcreteVersion);
console.log("且 project.config.json 给出同一版本（第二来源）:", withSecondSource);
console.log("非具体值:", JSON.stringify(Object.fromEntries(placeholders)));
console.log("app-config.json 的 version 字段分布:", JSON.stringify(Object.fromEntries(appConfigVersions)).slice(0, 300));
console.log(
  "版本分布（前 12）:",
  JSON.stringify(
    Object.fromEntries(
      [...versionCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12),
    ),
    null,
    2,
  ),
);
