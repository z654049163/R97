import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeSource } from "../analyzer.mjs";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".runtime",
  "miniprogram_npm",
  "node_modules",
]);

const DEFAULT_EXTENSIONS = Object.freeze([".js"]);

const PROJECT_LAYOUTS = new Set(["children", "root"]);

const DEFAULT_SOURCE_ROOTS = Object.freeze([
  "E:\\复现\\sample_collector\\可用于实验的干净源码包",
]);

export const buildCorpus = async ({
  sourceRoots = DEFAULT_SOURCE_ROOTS,
  sourceKind = "miniapp",
  projectLayout = "children",
  extensions = DEFAULT_EXTENSIONS,
  includeExtensionless = false,
  outputDir,
  limitProjects = 200,
  maxFilesPerProject = 60,
  maxFileBytes = 2 * 1024 * 1024,
  maxFindingsPerFile = 500,
  maxFindingsPerProject = 2500,
  maxRecords = 100000,
  onProgress = null,
}) => {
  const startedAt = performance.now();
  if (!Array.isArray(sourceRoots) || sourceRoots.length === 0) {
    throw new TypeError("sourceRoots must be a non-empty array");
  }
  if (typeof outputDir !== "string" || outputDir.trim() === "") {
    throw new TypeError("outputDir must be a non-empty string");
  }
  if (typeof sourceKind !== "string" || sourceKind.trim() === "") {
    throw new TypeError("sourceKind must be a non-empty string");
  }
  if (!PROJECT_LAYOUTS.has(projectLayout)) {
    throw new TypeError("projectLayout must be children or root");
  }
  const normalizedExtensions = normalizeExtensions(extensions);

  mkdirSync(outputDir, { recursive: true });
  const recordsPath = path.join(outputDir, "real-miniapp-candidates.jsonl");
  const failuresPath = path.join(outputDir, "real-miniapp-parse-failures.jsonl");
  const recordsStream = createWriteStream(recordsPath, { flags: "w" });
  const failuresStream = createWriteStream(failuresPath, { flags: "w" });

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceRoots,
    sourceKind,
    config: {
      projectLayout,
      extensions: normalizedExtensions,
      includeExtensionless,
      limitProjects,
      maxFilesPerProject,
      maxFileBytes,
      maxFindingsPerFile,
      maxFindingsPerProject,
      maxRecords,
    },
    projectsSeen: 0,
    projectsSampled: 0,
    filesDiscovered: 0,
    filesScanned: 0,
    filesParsed: 0,
    filesFailed: 0,
    filesSkippedTooLarge: 0,
    findingCount: 0,
    uniqueEntityCount: 0,
    parseSuccessRate: 0,
    byTransformation: {},
    byBindingKind: {},
    byCapabilityDomain: {},
    byRuntimeRoot: {},
    bySourceKind: {},
    topEntities: [],
  };
  const entityCounts = new Map();
  let recordCount = 0;
  let analysisMs = 0;

  try {
    for (const sourceRoot of sourceRoots) {
      const root = path.resolve(sourceRoot);
      if (!existsSync(root)) {
        throw new Error(`Source root does not exist: ${root}`);
      }

      const projects = discoverProjects(root, projectLayout);
      summary.projectsSeen += projects.length;

      for (const project of projects) {
        if (summary.projectsSampled >= limitProjects) {
          break;
        }
        if (recordCount >= maxRecords) {
          break;
        }

        const projectName = project.name;
        const projectRoot = project.root;
        const projectFiles = collectSourceFiles(projectRoot, {
          extensions: normalizedExtensions,
          includeExtensionless,
        }).slice(0, maxFilesPerProject);
        let projectFindingCount = 0;
        summary.projectsSampled += 1;

        for (const filePath of projectFiles) {
          if (
            recordCount >= maxRecords ||
            projectFindingCount >= maxFindingsPerProject
          ) {
            break;
          }
          summary.filesDiscovered += 1;
          const size = statSync(filePath).size;
          if (size > maxFileBytes) {
            summary.filesSkippedTooLarge += 1;
            continue;
          }

          summary.filesScanned += 1;
          const source = readFileSync(filePath, "utf8");
          try {
            const analysisStartedAt = performance.now();
            const analysis = analyzeSource({
              source,
              filePath: path.relative(root, filePath),
            });
            analysisMs += performance.now() - analysisStartedAt;
            summary.filesParsed += 1;
            const relativePath = path.relative(root, filePath);

            const findings = analysis.findings.slice(0, maxFindingsPerFile);
            for (const finding of findings) {
              if (
                recordCount >= maxRecords ||
                projectFindingCount >= maxFindingsPerProject
              ) {
                break;
              }
              const record = {
                sampleId: sampleId(relativePath, finding.programPointId),
                sourceKind,
                sourceRoot: root,
                project: projectName,
                file: relativePath,
                sourceHash: analysis.sourceHash,
                sourceBytes: size,
                programPointId: finding.programPointId,
                programPoint: finding.programPoint,
                transformationKind: finding.transformationKind,
                bindingKind: finding.bindingRef.bindingKind,
                resolutionStatus: finding.bindingRef.resolutionStatus,
                aliasChain: finding.bindingRef.aliasChain,
                mutationStatus: finding.bindingRef.mutationStatus,
                inFileDefinition: finding.bindingRef.inFileDefinition,
                entityId: finding.runtimeEntity.entityId,
                normalizedPath: finding.runtimeEntity.normalizedPath,
                capabilityDomain: finding.runtimeEntity.capabilityDomain,
                usageContext: finding.usageContext,
              };
              recordsStream.write(`${JSON.stringify(record)}\n`);
              recordCount += 1;
              projectFindingCount += 1;
              summary.findingCount += 1;
              increment(summary.byTransformation, finding.transformationKind);
              increment(summary.byBindingKind, finding.bindingRef.bindingKind);
              increment(
                summary.byCapabilityDomain,
                finding.runtimeEntity.capabilityDomain,
              );
              increment(
                summary.byRuntimeRoot,
                finding.runtimeEntity.entityId.split(".")[0] ?? "<unknown>",
              );
              increment(summary.bySourceKind, sourceKind);
              entityCounts.set(
                finding.runtimeEntity.entityId,
                (entityCounts.get(finding.runtimeEntity.entityId) ?? 0) + 1,
              );
            }
          } catch (error) {
            summary.filesFailed += 1;
            failuresStream.write(
              `${JSON.stringify({
                project: projectName,
                file: path.relative(root, filePath),
                sourceHash: sha256(source),
                message: error instanceof Error ? error.message : String(error),
              })}\n`,
            );
          }
        }

        if (typeof onProgress === "function") {
          onProgress({
            project: projectName,
            projectsSampled: summary.projectsSampled,
            filesParsed: summary.filesParsed,
            filesFailed: summary.filesFailed,
            findingCount: summary.findingCount,
          });
        }
      }
    }
  } finally {
    await Promise.all([
      closeStream(recordsStream),
      closeStream(failuresStream),
    ]);
  }

  summary.uniqueEntityCount = entityCounts.size;
  summary.parseSuccessRate =
    summary.filesScanned === 0
      ? 0
      : summary.filesParsed / summary.filesScanned;
  const totalMs = performance.now() - startedAt;
  summary.timing = {
    totalMs,
    analysisMs,
    filesPerSecond:
      totalMs === 0 ? null : (summary.filesScanned * 1000) / totalMs,
    findingsPerSecond:
      totalMs === 0 ? null : (summary.findingCount * 1000) / totalMs,
    averageAnalysisMsPerFile:
      summary.filesParsed === 0 ? null : analysisMs / summary.filesParsed,
  };
  summary.topEntities = [...entityCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 100)
    .map(([entityId, count]) => ({ entityId, count }));
  summary.output = {
    records: recordsPath,
    failures: failuresPath,
  };
  writeFileSync(
    path.join(outputDir, "real-miniapp-corpus-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  return summary;
};

export const parseBuildCorpusArgs = (argv) => {
  const options = {
    sourceRoots: [],
    sourceKind: "miniapp",
    projectLayout: "children",
    extensions: [...DEFAULT_EXTENSIONS],
    includeExtensionless: false,
    outputDir: path.resolve("datasets"),
    limitProjects: 200,
    maxFilesPerProject: 60,
    maxFileBytes: 2 * 1024 * 1024,
    maxFindingsPerFile: 500,
    maxFindingsPerProject: 2500,
    maxRecords: 100000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    switch (argument) {
      case "--source":
        options.sourceRoots.push(requireValue(argument, next));
        index += 1;
        break;
      case "--source-kind":
        options.sourceKind = requireValue(argument, next);
        index += 1;
        break;
      case "--project-layout":
        options.projectLayout = requireValue(argument, next);
        if (!PROJECT_LAYOUTS.has(options.projectLayout)) {
          throw new Error("--project-layout must be children or root");
        }
        index += 1;
        break;
      case "--extensions":
        options.extensions = normalizeExtensions(
          requireValue(argument, next).split(","),
        );
        index += 1;
        break;
      case "--include-extensionless":
        options.includeExtensionless = true;
        break;
      case "--out":
        options.outputDir = path.resolve(requireValue(argument, next));
        index += 1;
        break;
      case "--limit-projects":
        options.limitProjects = positiveInteger(argument, next);
        index += 1;
        break;
      case "--max-files-per-project":
        options.maxFilesPerProject = positiveInteger(argument, next);
        index += 1;
        break;
      case "--max-file-bytes":
        options.maxFileBytes = positiveInteger(argument, next);
        index += 1;
        break;
      case "--max-findings-per-file":
        options.maxFindingsPerFile = positiveInteger(argument, next);
        index += 1;
        break;
      case "--max-findings-per-project":
        options.maxFindingsPerProject = positiveInteger(argument, next);
        index += 1;
        break;
      case "--max-records":
        options.maxRecords = positiveInteger(argument, next);
        index += 1;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.sourceRoots.length === 0) {
    options.sourceRoots = [...DEFAULT_SOURCE_ROOTS];
  }
  return options;
};

const discoverProjects = (root, projectLayout) => {
  if (projectLayout === "root") {
    return [{ name: path.basename(root) || root, root }];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      root: path.join(root, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const normalizeExtensions = (extensions) => {
  const values = Array.isArray(extensions) ? extensions : [extensions];
  const normalized = values
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean)
    .map((value) => (value.startsWith(".") ? value : `.${value}`));
  if (
    normalized.length === 0 ||
    normalized.some((value) => !/^\.[a-z0-9]+$/u.test(value))
  ) {
    throw new Error("extensions must contain file suffixes such as .js or .mjs");
  }
  return [...new Set(normalized)];
};

const collectSourceFiles = (
  root,
  {
    extensions = DEFAULT_EXTENSIONS,
    includeExtensionless = false,
  } = {},
) => {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          stack.push(fullPath);
        }
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase();
        if (
          extensions.includes(extension) ||
          (includeExtensionless && extension === "" && !entry.name.startsWith("."))
        ) {
          files.push(fullPath);
        }
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
};

const increment = (target, key) => {
  target[key] = (Object.hasOwn(target, key) ? target[key] : 0) + 1;
};

const sampleId = (file, programPointId) =>
  sha256(`${file}|${programPointId}`).slice(0, 24);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const closeStream = (stream) =>
  new Promise((resolve, reject) => {
    stream.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

const requireValue = (argument, value) => {
  if (typeof value !== "string" || value.startsWith("--")) {
    throw new Error(`${argument} requires a value`);
  }
  return value;
};

const positiveInteger = (argument, value) => {
  const parsed = Number.parseInt(requireValue(argument, value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${argument} requires a positive integer`);
  }
  return parsed;
};

const isMain = () => {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
};

if (isMain()) {
  const options = parseBuildCorpusArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/dataset/build-corpus.mjs [options]",
        "",
        "Options:",
        "  --source <path>                 Source root; may be repeated",
        "  --source-kind <kind>            Dataset kind: miniapp, node, browser, etc.",
        "  --project-layout <layout>       children or root",
        "  --extensions <list>             Comma-separated suffixes, e.g. .js,.mjs,.cjs",
        "  --include-extensionless         Include extensionless JavaScript files",
        "  --out <path>                    Output directory",
        "  --limit-projects <n>            Maximum project count",
        "  --max-files-per-project <n>     Maximum JavaScript files per project",
        "  --max-file-bytes <n>            Skip files larger than this value",
        "  --max-findings-per-file <n>     Cap findings written from one file",
        "  --max-findings-per-project <n>  Cap findings written from one project",
        "  --max-records <n>               Stop after this many findings",
      ].join("\n"),
    );
  } else {
    const summary = await buildCorpus({
      ...options,
      onProgress: (progress) => {
        if (progress.projectsSampled % 10 === 0) {
          process.stdout.write(
            `[dataset] projects=${progress.projectsSampled} parsed=${progress.filesParsed} failed=${progress.filesFailed} findings=${progress.findingCount}\n`,
          );
        }
      },
    });
    console.log(JSON.stringify(summary, null, 2));
  }
}
