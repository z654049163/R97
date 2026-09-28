import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectWechatObservations } from "../evidence/wechat-devtools.mjs";

const DEFAULT_CORPUS = path.resolve(
  "datasets",
  "real-miniapp-full",
  "real-miniapp-candidates.jsonl",
);

export const runWechatCollection = async ({
  outputDir,
  corpusPath = DEFAULT_CORPUS,
  corpusLimit = Number.POSITIVE_INFINITY,
  entityLimit = Number.POSITIVE_INFINITY,
  projectPath,
  cliPath,
  timeoutMs = 60000,
  readinessTimeoutMs = null,
  port = 9420,
  mode = "auto",
  probeBatchSize = 150,
  quiet = false,
}) => {
  const { entities, scannedRecordCount } = await readDistinctCorpusEntities({
    corpusPath,
    scanLimit: corpusLimit,
    entityLimit,
  });
  if (entities.length === 0) {
    throw new Error("No runtime entities were found in the corpus");
  }

  const entityDimensions = Object.fromEntries(
    entities.map((entityId) => [
      entityId,
      ["existence", "type", "callability"],
    ]),
  );
  const collection = await collectWechatObservations({
    entityDimensions,
    projectPath,
    cliPath,
    timeoutMs,
    readinessTimeoutMs,
    port,
    mode,
    probeBatchSize,
    onProgress: quiet
      ? null
      : ({ batch, batchCount, completed, total }) => {
          process.stderr.write(
            `[wechat-probe] batch ${batch}/${batchCount} (${completed}/${total} entities)\n`,
          );
        },
  });

  mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "wechat-probe-report.json");
  const observationsPath = path.join(
    outputDir,
    "wechat-observations.json",
  );
  writeFileSync(
    reportPath,
    `${JSON.stringify(collection.report, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    observationsPath,
    `${JSON.stringify(
      {
        runtimeId: collection.runtimeId,
        provenance: collection.provenance,
        observations: collection.observations,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const byType = {};
  let missingCount = 0;
  for (const observation of Object.values(collection.observations)) {
    const type = observation.values.type ?? "<unobserved>";
    byType[type] = (byType[type] ?? 0) + 1;
    if (observation.values.existence === false) {
      missingCount += 1;
    }
  }
  const summary = {
    generatedAt: collection.report.generatedAt,
    runtimeId: collection.runtimeId,
    provenance: collection.provenance,
    corpusPath,
    scannedRecordCount,
    entityCount: entities.length,
    observedEntityCount: Object.keys(collection.observations).length,
    missingEntityCount: missingCount,
    byType,
    appServiceReady: collection.report.appServiceReady ?? null,
    readinessAttempts: collection.report.readinessAttempts ?? null,
    sdkVersion: collection.sdkVersion,
    platform: collection.platform,
    projectPath: collection.report.projectPath,
    cliPath: collection.report.cliPath,
    connectionMode: collection.report.connectionMode,
    wsEndpoint: collection.report.wsEndpoint,
    reportPath,
    observationsPath,
  };
  writeFileSync(
    path.join(outputDir, "wechat-collection-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  return summary;
};

/**
 * 微信证据要覆盖语料里出现过的全部实体，而不是某个抽样里的实体。
 * 抽样规模会随评测口径变化，证据报告不应该跟着变。
 */
export const readDistinctCorpusEntities = async ({
  corpusPath,
  scanLimit = Number.POSITIVE_INFINITY,
  entityLimit = Number.POSITIVE_INFINITY,
}) => {
  const entities = [];
  const seen = new Set();
  const input = createReadStream(corpusPath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let scannedRecordCount = 0;

  try {
    for await (const line of lines) {
      if (line.trim() === "") {
        continue;
      }
      scannedRecordCount += 1;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        if (scannedRecordCount >= scanLimit) {
          break;
        }
        continue;
      }
      const entityId = record.entityId;
      if (
        typeof entityId === "string" &&
        entityId !== "" &&
        !seen.has(entityId)
      ) {
        seen.add(entityId);
        entities.push(entityId);
        if (entities.length >= entityLimit) {
          break;
        }
      }
      if (scannedRecordCount >= scanLimit) {
        break;
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  return { entities, scannedRecordCount };
};

export const parseWechatCollectionArgs = (argv) => {
  const options = {
    outputDir: path.resolve("datasets", "wechat-live"),
    corpusPath: DEFAULT_CORPUS,
    corpusLimit: Number.POSITIVE_INFINITY,
    entityLimit: Number.POSITIVE_INFINITY,
    timeoutMs: 60000,
    port: 9420,
    mode: "auto",
    probeBatchSize: 150,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    switch (argument) {
      case "--out":
        options.outputDir = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--corpus":
        options.corpusPath = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--corpus-limit":
        options.corpusLimit = positiveInteger(argument, next);
        index += 1;
        break;
      case "--entity-limit":
        options.entityLimit = positiveInteger(argument, next);
        index += 1;
        break;
      case "--project":
        options.projectPath = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--cli":
        options.cliPath = path.resolve(value(argument, next));
        index += 1;
        break;
      case "--timeout":
        options.timeoutMs = positiveInteger(argument, next);
        index += 1;
        break;
      case "--port":
        options.port = positiveInteger(argument, next);
        index += 1;
        break;
      case "--mode":
        options.mode = connectionMode(argument, next);
        index += 1;
        break;
      case "--batch-size":
        options.probeBatchSize = positiveInteger(argument, next);
        index += 1;
        break;
      case "--quiet":
        options.quiet = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const value = (argument, input) => {
  if (typeof input !== "string" || input.startsWith("--")) {
    throw new Error(`${argument} requires a value`);
  }
  return input;
};

const positiveInteger = (argument, input) => {
  const parsed = Number.parseInt(value(argument, input), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${argument} requires a positive integer`);
  }
  return parsed;
};

const connectionMode = (argument, input) => {
  const parsed = value(argument, input);
  if (!["auto", "connect", "launch"].includes(parsed)) {
    throw new Error(`${argument} must be one of auto, connect, launch`);
  }
  return parsed;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseWechatCollectionArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node src/evaluation/collect-wechat.mjs [options]",
        "",
        "Options:",
        "  --out <path>          Output directory",
        "  --corpus <path>       Real miniapp JSONL corpus",
        "  --corpus-limit <n>    Maximum corpus rows to read",
        "  --entity-limit <n>    Maximum unique entities to probe",
        "  --project <path>      WeChat Mini Program fixture path",
        "  --cli <path>          WeChat DevTools cli.bat path",
        "  --timeout <ms>        DevTools launch timeout",
        "  --port <n>            Automation WebSocket port",
        "  --mode <mode>         auto | connect | launch (default: auto)",
        "  --batch-size <n>      Entities per automator evaluate call",
        "  --quiet               Suppress batch progress output",
      ].join("\n"),
    );
  } else {
    const summary = await runWechatCollection(options);
    console.log(JSON.stringify(summary, null, 2));
  }
}
