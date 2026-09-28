/**
 * 审计「语料里出现的名字，有多少其实是被分析文件自己赋值的」。
 *
 * 这一问决定了改进方向：如果名字在文件里被赋值过（`wh=$gwh();`），运行时
 * 探针对它的观测就只反映「探针有没有执行这段代码」，不是环境差异，靠加探针
 * 或补名单都解决不了。判定结果落在 `bindingRef.inFileDefinition` 上。
 *
 * 用法：
 *   node tools/audit-implicit-globals.mjs <语料 jsonl> <真实项目源码根目录>
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const corpusPath = process.argv[2];
const sourceRoot = process.argv[3];

const REMAINING_ROOTS = [
  "wh",
  "$gwx",
  "$gwn",
  "$gwl",
  "$gwh",
  "gra",
  "grb",
  "__wxConfig",
  "__subContextEngine__",
];

const filesByRoot = new Map(REMAINING_ROOTS.map((root) => [root, new Set()]));
const input = createReadStream(corpusPath, { encoding: "utf8" });
const lines = createInterface({ input, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.trim()) {
    continue;
  }
  const record = JSON.parse(line);
  const root = String(record.entityId).split(".")[0];
  const bucket = filesByRoot.get(root);
  if (bucket && record.file) {
    bucket.add(record.file);
  }
}

const definitionPattern = (root) => {
  const escaped = root.replace(/\$/g, "\\$");
  return new RegExp(
    `(?:^|[^\\w$.])${escaped}\\s*(?:=[^=]|\\+\\+|--)`,
    "m",
  );
};

for (const [root, files] of filesByRoot) {
  let definedInFile = 0;
  let missingFile = 0;
  const samples = [];
  for (const relative of files) {
    const absolute = path.join(sourceRoot, relative);
    if (!existsSync(absolute)) {
      missingFile += 1;
      continue;
    }
    const source = readFileSync(absolute, "utf8");
    if (definitionPattern(root).test(source)) {
      definedInFile += 1;
    } else if (samples.length < 3) {
      samples.push(relative);
    }
  }
  console.log(
    `${root.padEnd(22)} files=${String(files.size).padEnd(5)} assignedInFile=${String(definedInFile).padEnd(5)} missing=${missingFile}` +
      (samples.length > 0 ? `\n    not-assigned samples: ${samples.join(" | ")}` : ""),
  );
}
