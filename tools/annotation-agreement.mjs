/**
 * 计算双人标注的一致率与 Cohen's kappa。
 *
 * 只统计两位标注者都填了的行；空行视为未标注。协议见
 * `datasets/annotation-sample/README.md`。
 *
 * 用法：
 *   node tools/annotation-agreement.mjs --labels datasets/annotation-sample/labels.tsv
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const labelsPath = path.resolve(
  argValue("--labels") ?? "datasets/annotation-sample/labels.tsv",
);
if (!existsSync(labelsPath)) {
  console.error(`找不到标注文件：${labelsPath}`);
  process.exit(1);
}

const lines = readFileSync(labelsPath, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "");
const header = lines[0].split("\t");
const sampleIndex = header.indexOf("sampleId");
const aIndex = header.indexOf("label_a");
const bIndex = header.indexOf("label_b");
const adjudicatedIndex = header.indexOf("adjudicated");
if (sampleIndex < 0 || aIndex < 0 || bIndex < 0) {
  console.error("labels.tsv 缺少 sampleId / label_a / label_b 列");
  process.exit(1);
}

const rows = lines.slice(1).map((line) => {
  const cells = line.split("\t");
  return {
    sampleId: cells[sampleIndex] ?? "",
    labelA: (cells[aIndex] ?? "").trim(),
    labelB: (cells[bIndex] ?? "").trim(),
    adjudicated:
      adjudicatedIndex >= 0 ? (cells[adjudicatedIndex] ?? "").trim() : "",
  };
});

const labeled = rows.filter((row) => row.labelA && row.labelB);
const conflicts = labeled.filter((row) => row.labelA !== row.labelB);
const adjudicated = conflicts.filter((row) => row.adjudicated);

const agreementRate =
  labeled.length === 0 ? null : 1 - conflicts.length / labeled.length;

const labels = [
  ...new Set(labeled.flatMap((row) => [row.labelA, row.labelB])),
].sort();
const countA = Object.fromEntries(labels.map((label) => [label, 0]));
const countB = Object.fromEntries(labels.map((label) => [label, 0]));
for (const row of labeled) {
  countA[row.labelA] += 1;
  countB[row.labelB] += 1;
}
const expectedAgreement =
  labeled.length === 0
    ? null
    : labels.reduce(
        (total, label) =>
          total + (countA[label] / labeled.length) * (countB[label] / labeled.length),
        0,
      );
const cohenKappa =
  labeled.length === 0 || expectedAgreement === null
    ? null
    : expectedAgreement === 1
      ? 1
      : (agreementRate - expectedAgreement) / (1 - expectedAgreement);

const summary = {
  generatedAt: new Date().toISOString(),
  labelsPath: path.relative(process.cwd(), labelsPath),
  totalRows: rows.length,
  labeledBoth: labeled.length,
  unlabeled: rows.length - labeled.length,
  agreementCount: labeled.length - conflicts.length,
  conflictCount: conflicts.length,
  adjudicatedConflictCount: adjudicated.length,
  agreementRate,
  expectedAgreement,
  cohenKappa,
  byLabel: labels.map((label) => ({
    label,
    annotatorA: countA[label],
    annotatorB: countB[label],
  })),
  conflicts: conflicts.map((row) => ({
    sampleId: row.sampleId,
    labelA: row.labelA,
    labelB: row.labelB,
    adjudicated: row.adjudicated || null,
  })),
};

const outputPath = path.join(path.dirname(labelsPath), "agreement.json");
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(
  `已标注 ${labeled.length} / ${rows.length}；一致 ${summary.agreementCount}，冲突 ${summary.conflictCount}`,
);
console.log(
  `agreement=${agreementRate === null ? "—" : (agreementRate * 100).toFixed(2) + "%"}，Cohen's kappa=${
    cohenKappa === null ? "—" : cohenKappa.toFixed(3)
  }`,
);
console.log(`报告写入 ${outputPath}`);
