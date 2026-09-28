/**
 * 从主基准的逐条结果里构造**独立人工标注**抽样。
 *
 * 用途：`exactStateAccuracy` 来自与决策器共用证据规则的自洽校验，不能作为
 * 有效性证据。这个脚本只负责把待人工判断的样本分层抽出来并生成标注模板；
 * 真正的标签必须由人独立给出。
 *
 * 分层维度：R97 决策状态 × 变换类型。抽样是确定性的（按 sampleId 排序 +
 * 固定种子），重复运行得到同一份样本。
 *
 * 用法：
 *   node tools/build-annotation-sample.mjs --input datasets/benchmark-wechat/benchmark-results.jsonl --out datasets/annotation-sample --size 500
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const inputPath = path.resolve(
  argValue("--input") ?? "datasets/benchmark-wechat/benchmark-results.jsonl",
);
const outputDir = path.resolve(argValue("--out") ?? "datasets/annotation-sample");
const targetSize = Number.parseInt(argValue("--size") ?? "500", 10);
const seed = argValue("--seed") ?? "r97-annotation-v1";

if (!existsSync(inputPath)) {
  console.error(`找不到逐条结果文件：${inputPath}`);
  process.exit(1);
}

const rows = readFileSync(inputPath, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line));

const bucketKeyOf = (row) =>
  `${row.actualState}\u0000${row.transformationKind ?? "<unknown>"}`;

const buckets = new Map();
for (const row of rows) {
  const key = bucketKeyOf(row);
  const bucket = buckets.get(key) ?? [];
  bucket.push(row);
  buckets.set(key, bucket);
}

const hash = (value) => {
  let result = 2166136261;
  const text = `${seed}:${value}`;
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

const sortedBuckets = [...buckets.entries()]
  .map(([key, bucket]) => ({
    key,
    rows: [...bucket].sort((left, right) => {
      const delta = hash(left.sampleId) - hash(right.sampleId);
      return delta !== 0 ? delta : left.sampleId.localeCompare(right.sampleId);
    }),
  }))
  .sort((left, right) => left.key.localeCompare(right.key));

// 先每层均分，再按剩余容量补齐；保证长尾变换类型不会被高频类型挤掉。
const perBucketTarget = Math.max(
  1,
  Math.floor(targetSize / sortedBuckets.length),
);
const selected = [];
const selectedIds = new Set();
for (const bucket of sortedBuckets) {
  for (const row of bucket.rows.slice(0, perBucketTarget)) {
    selected.push(row);
    selectedIds.add(row.sampleId);
  }
}
if (selected.length < targetSize) {
  const remainder = sortedBuckets
    .flatMap((bucket) => bucket.rows)
    .filter((row) => !selectedIds.has(row.sampleId))
    .sort((left, right) => {
      const delta = hash(left.sampleId) - hash(right.sampleId);
      return delta !== 0 ? delta : left.sampleId.localeCompare(right.sampleId);
    });
  for (const row of remainder) {
    if (selected.length >= targetSize) break;
    selected.push(row);
    selectedIds.add(row.sampleId);
  }
}

selected.sort((left, right) => left.sampleId.localeCompare(right.sampleId));
mkdirSync(outputDir, { recursive: true });

const samplePath = path.join(outputDir, "sample.jsonl");
writeFileSync(
  samplePath,
  `${selected
    .map((row) =>
      JSON.stringify({
        sampleId: row.sampleId,
        project: row.project,
        file: row.file,
        entityId: row.entityId,
        generatedSource: row.generatedSource,
        transformationKind: row.transformationKind,
        bindingKind: row.bindingKind,
        resolutionStatus: row.resolutionStatus,
        targetRuntimeStatus: row.targetRuntimeStatus,
        r97State: row.actualState,
        r97Action: row.actualAction,
        reasonCodes: row.reasonCodes,
      }),
    )
    .join("\n")}\n`,
  "utf8",
);

const labelsPath = path.join(outputDir, "labels.tsv");
writeFileSync(
  labelsPath,
  [
    "sampleId\tlabel_a\tlabel_b\tadjudicated\tnotes",
    ...selected.map((row) => `${row.sampleId}\t\t\t\t`),
  ].join("\n") + "\n",
  "utf8",
);

const byState = {};
const byTransformation = {};
for (const row of selected) {
  byState[row.actualState] = (byState[row.actualState] ?? 0) + 1;
  byTransformation[row.transformationKind ?? "<unknown>"] =
    (byTransformation[row.transformationKind ?? "<unknown>"] ?? 0) + 1;
}
writeFileSync(
  path.join(outputDir, "sampling-summary.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      inputPath: path.relative(process.cwd(), inputPath),
      seed,
      requestedSize: targetSize,
      selectedSize: selected.length,
      populationSize: rows.length,
      bucketCount: sortedBuckets.length,
      byState,
      byTransformation,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  path.join(outputDir, "README.md"),
  `# 独立人工标注协议

## 标注什么

对 \`sample.jsonl\` 里的每个条目，判断这一处**具体 transformation** 在给定
target 下是否保持可观察行为。不要判断"R97 应该输出什么"——R97 的决策已经写在
\`r97State\` 字段里，但标注时必须先忽略它。

每个条目的判断序列：

1. 读 \`generatedSource\`：这是折叠点在求值基线里的表达式。
2. 读 \`targetRuntimeStatus\`：目标环境是什么（本抽样统一来自 4 宿主配置，
   target 含真实微信 AppService）。
3. 判断：把这个表达式替换成基线结果后，在 target 里执行是否产生**不同的
   可观察行为**（返回值、异常、调用是否发生、副作用）。

## 标签取值

| 标签 | 含义 |
|---|---|
| \`SAFE_FOLD\` | 观察不到差异，折叠保持行为 |
| \`UNSAFE_FOLD\` | 观察到差异，折叠会改变行为 |
| \`INSUFFICIENT_EVIDENCE\` | 无法在不引入额外假设的情况下判断 |

不要为了和 R97 一致而改标签；分歧本身就是结果。

## 流程

1. 两名标注者**独立**填写 \`labels.tsv\` 的 \`label_a\` / \`label_b\` 列。
2. 有分歧的条目进入 adjudication，填写 \`adjudicated\` 列。
3. 运行 \`node tools/annotation-agreement.mjs --labels datasets/annotation-sample/labels.tsv\`
   计算原始一致率、Cohen's kappa 与冲突清单。

## 与自洽校验的区别

\`benchmark-summary.json\` 里的 \`exactStateAccuracy\` 用 R97 自己的证据规则
重算 expected，只能说明内部一致。这份人工标注是独立 oracle，结论以它为准。
`,
  "utf8",
);

console.log(`样本 ${selected.length} / ${rows.length} 条`);
console.log(`  ${samplePath}`);
console.log(`  ${labelsPath}`);
console.log(`  ${path.join(outputDir, "README.md")}`);
