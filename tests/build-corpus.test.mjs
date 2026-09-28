import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCorpus,
  parseBuildCorpusArgs,
} from "../src/dataset/build-corpus.mjs";

test("语料参数支持来源类型、项目布局和扩展名", () => {
  const options = parseBuildCorpusArgs([
    "--source",
    "fixtures",
    "--source-kind",
    "browser",
    "--project-layout",
    "root",
    "--extensions",
    "js,mjs,cjs",
    "--include-extensionless",
  ]);

  assert.equal(options.sourceKind, "browser");
  assert.equal(options.projectLayout, "root");
  assert.deepEqual(options.extensions, [".js", ".mjs", ".cjs"]);
  assert.equal(options.includeExtensionless, true);
});

test("语料记录保留来源类型并支持多 JavaScript 扩展名", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "r97-corpus-source-"));
  const outputDir = path.join(root, "output");
  const projectDir = path.join(root, "sample-project");
  try {
    mkdirSync(projectDir);
    writeFileSync(
      path.join(projectDir, "main.mjs"),
      "process.nextTick(() => {});\n",
      "utf8",
    );
    writeFileSync(
      path.join(projectDir, "legacy.cjs"),
      'Buffer.from("x");\n',
      "utf8",
    );
    writeFileSync(path.join(projectDir, "plain"), 'require("fs");\n', "utf8");
    writeFileSync(path.join(projectDir, "ignored.ts"), "process.exit(0);\n", "utf8");

    const summary = await buildCorpus({
      sourceRoots: [root],
      sourceKind: "node",
      projectLayout: "children",
      extensions: [".mjs", ".cjs"],
      includeExtensionless: true,
      outputDir,
      limitProjects: 10,
      maxFilesPerProject: 10,
      maxFindingsPerFile: 10,
      maxFindingsPerProject: 30,
      maxRecords: 30,
    });

    assert.equal(summary.sourceKind, "node");
    assert.equal(summary.filesParsed, 3);
    assert.equal(summary.filesFailed, 0);
    assert.deepEqual(summary.config.extensions, [".mjs", ".cjs"]);

    const records = readFileSync(
      path.join(outputDir, "real-miniapp-candidates.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.ok(records.length > 0);
    assert.ok(records.every((record) => record.sourceKind === "node"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
