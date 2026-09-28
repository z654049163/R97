import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CAPABILITY_WEIGHTS = Object.freeze({
  native_bridge: 2.4,
  network: 2.2,
  payment: 2.5,
  storage: 1.8,
  visible_ui: 1.7,
  crypto: 1.5,
  module_runtime: 1.5,
  timing: 1.3,
  unknown: 1.1,
});

const TRANSFORMATION_WEIGHTS = Object.freeze({
  CALL_EVAL: 1.3,
  BRANCH_PRUNE: 1.2,
  DEAD_CODE_DELETE: 1.1,
  CONST_EVAL: 1.0,
});

export const rankProbeCandidates = ({ records, limit = 100 }) => {
  if (!Array.isArray(records)) {
    throw new TypeError("records must be an array");
  }
  const groups = new Map();

  for (const record of records) {
    const entityId = record.entityId;
    if (typeof entityId !== "string" || entityId.trim() === "") {
      continue;
    }
    const group = groups.get(entityId) ?? {
      entityId,
      occurrences: 0,
      projects: new Set(),
      unresolvedOccurrences: 0,
      capabilityDomains: new Set(),
      transformationKinds: new Set(),
    };
    group.occurrences += 1;
    group.projects.add(record.project ?? "<unknown>");
    if (record.resolutionStatus !== "resolved") {
      group.unresolvedOccurrences += 1;
    }
    group.capabilityDomains.add(record.capabilityDomain ?? "unknown");
    group.transformationKinds.add(record.transformationKind ?? "CONST_EVAL");
    groups.set(entityId, group);
  }

  const ranked = [...groups.values()].map((group) => {
    const capabilityWeight = max(
      [...group.capabilityDomains].map(
        (capability) => CAPABILITY_WEIGHTS[capability] ?? 1,
      ),
    );
    const transformationWeight = max(
      [...group.transformationKinds].map(
        (kind) => TRANSFORMATION_WEIGHTS[kind] ?? 1,
      ),
    );
    const unresolvedRatio =
      group.unresolvedOccurrences / group.occurrences;
    const score =
      Math.log2(1 + group.occurrences) *
      (1 + Math.log2(1 + group.projects.size)) *
      (1 + 0.5 * unresolvedRatio) *
      capabilityWeight *
      transformationWeight;

    return {
      entityId: group.entityId,
      occurrences: group.occurrences,
      projectCount: group.projects.size,
      unresolvedRatio,
      capabilityDomains: [...group.capabilityDomains].sort(),
      transformationKinds: [...group.transformationKinds].sort(),
      score,
      scoreFactors: {
        frequency: Math.log2(1 + group.occurrences),
        projectSpread: 1 + Math.log2(1 + group.projects.size),
        uncertainty: 1 + 0.5 * unresolvedRatio,
        capabilityWeight,
        transformationWeight,
      },
    };
  });

  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      right.occurrences - left.occurrences ||
      left.entityId.localeCompare(right.entityId),
  );
  const selected = ranked.slice(0, limit);
  const maxScore = selected[0]?.score ?? 1;

  return {
    candidateCount: ranked.length,
    formula:
      "log2(1+occurrences) * (1+log2(1+projectCount)) * (1+0.5*unresolvedRatio) * capabilityWeight * transformationWeight",
    results: selected.map((item, index) => ({
      rank: index + 1,
      ...item,
      normalizedPriority: round(item.score / maxScore, 6),
    })),
  };
};

export const loadJsonLines = (filePath) =>
  readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

export const writePriorityReport = ({
  records,
  outputDir,
  limit = 100,
}) => {
  const report = rankProbeCandidates({ records, limit });
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "probe-priority.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDir, "probe-priority.csv"),
    renderCsv(report.results),
    "utf8",
  );
  return report;
};

const renderCsv = (results) => {
  const header = [
    "rank",
    "entityId",
    "occurrences",
    "projectCount",
    "unresolvedRatio",
    "capabilityDomains",
    "score",
    "normalizedPriority",
  ];
  const lines = [header.join(",")];
  for (const result of results) {
    lines.push(
      [
        result.rank,
        csv(result.entityId),
        result.occurrences,
        result.projectCount,
        result.unresolvedRatio,
        csv(result.capabilityDomains.join("|")),
        result.score,
        result.normalizedPriority,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
};

const csv = (value) => `"${String(value).replaceAll('"', '""')}"`;

const max = (values) => (values.length === 0 ? 1 : Math.max(...values));

const round = (value, digits) =>
  Number(value.toFixed(digits));

const parseArgs = (argv) => {
  const options = {
    corpusPath: path.resolve("datasets/real-miniapp/real-miniapp-candidates.jsonl"),
    outputDir: path.resolve("datasets/real-miniapp"),
    limit: 100,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--corpus") {
      options.corpusPath = path.resolve(next);
      index += 1;
    } else if (argument === "--out") {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (argument === "--limit") {
      options.limit = Number.parseInt(next, 10);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseArgs(process.argv.slice(2));
  const report = writePriorityReport({
    records: loadJsonLines(options.corpusPath),
    outputDir: options.outputDir,
    limit: options.limit,
  });
  console.log(JSON.stringify(report, null, 2));
}
