/**
 * 统计各语料里记录的运行时归属分布。
 *
 * 文档 §「全部语料合并后的运行时归属」用它复现。归类顺序固定：
 * 模块导入 → 语言内建 → 宿主根表 → 基础库私有模式 → 其余。
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import { HOST_RUNTIME_ROOTS } from "../src/contract-builder.mjs";
import { LANGUAGE_BUILTIN_ROOTS } from "../src/global-roots.mjs";
import { RUNTIME_IDS } from "../src/runtime-profiles.mjs";

const WECHAT_PRIVATE_PATTERN =
  /^(\$gwx|\$gwn|\$gwl|\$gwh|wh|gra|grb|nt_\d|nv_|__wx|__subContextEngine__)/u;

const languageRoots = new Set(LANGUAGE_BUILTIN_ROOTS);
const hostRoots = new Map(
  HOST_RUNTIME_ROOTS.map((entry) => [entry.runtimeId, entry.roots]),
);

const classify = (record) => {
  if (record.bindingKind === "module_import") {
    return "module";
  }
  const root = String(record.entityId).split(".")[0];
  if (languageRoots.has(root)) {
    return "language";
  }
  for (const [runtimeId, roots] of hostRoots) {
    if (roots.has(root)) {
      return runtimeId;
    }
  }
  if (WECHAT_PRIVATE_PATTERN.test(root)) {
    return RUNTIME_IDS.WECHAT;
  }
  return "other";
};

const totals = {};
for (const corpusPath of process.argv.slice(2)) {
  const input = createReadStream(corpusPath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const bucket = classify(JSON.parse(line));
    totals[bucket] = (totals[bucket] ?? 0) + 1;
  }
}

console.log(JSON.stringify(totals, null, 2));
console.log(
  "total",
  Object.values(totals).reduce((sum, value) => sum + value, 0),
);
