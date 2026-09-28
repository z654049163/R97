import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  countByRoot,
  parseBenchmarkArgs,
  readDeduplicatedCorpusRecords,
  sourceForRecord,
} from "../src/evaluation/run-benchmark.mjs";

const record = (overrides = {}) => ({
  entityId: "console.log",
  transformationKind: "CALL_EVAL",
  bindingKind: "runtime_global",
  resolutionStatus: "resolved",
  usageContext: { usageContextId: "call" },
  ...overrides,
});

test("流式语料读取按原顺序去重并遵守上限", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "r97-corpus-"));
  const filePath = path.join(directory, "corpus.jsonl");
  try {
    writeFileSync(
      filePath,
      [
        record({ sampleId: "first" }),
        record({ sampleId: "duplicate" }),
        record({
          sampleId: "second",
          entityId: "Math.max",
          usageContext: { usageContextId: "read" },
        }),
      ]
        .map((item) => JSON.stringify(item))
        .join("\n"),
      "utf8",
    );

    const records = await readDeduplicatedCorpusRecords(filePath, 2);

    assert.deepEqual(
      records.map((item) => item.sampleId),
      ["first", "second"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("无法作为独立表达式表示的保留字实体不进入评测", () => {
  assert.equal(
    sourceForRecord(record({ entityId: "default" })),
    null,
  );
  assert.equal(
    sourceForRecord(record({ entityId: "console.log" })),
    "console.log();",
  );
});

test("按根节点统计不被原型上的同名属性污染", () => {
  const counts = countByRoot([
    "constructor",
    "constructor.prototype",
    "toString",
    "toString.call",
    "wx.request",
    "wx.login",
    "__proto__",
  ]);

  assert.equal(counts.constructor, 2);
  assert.equal(counts.toString, 2);
  assert.equal(counts.wx, 2);
  assert.equal(counts.__proto__, 1);
  for (const value of Object.values(counts)) {
    assert.equal(typeof value, "number");
  }
});

test("同一表达式形状在不同文件里是不同样本", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "r97-corpus-"));
  const filePath = path.join(directory, "corpus.jsonl");
  try {
    writeFileSync(
      filePath,
      ["a.js", "b.js", "c.js"]
        .map((file, index) =>
          JSON.stringify(
            record({ sampleId: `s${index}`, file, programPointId: `p${index}` }),
          ),
        )
        .join("\n"),
      "utf8",
    );

    const records = await readDeduplicatedCorpusRecords(filePath);

    assert.deepEqual(
      records.map((item) => item.sampleId),
      ["s0", "s1", "s2"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("有上限时对全语料抽样，而不是只取文件头部", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "r97-corpus-"));
  const filePath = path.join(directory, "corpus.jsonl");
  try {
    const total = 400;
    const lines = [];
    for (let index = 0; index < total; index += 1) {
      lines.push(
        JSON.stringify(
          record({
            sampleId: `s${index}`,
            file: `f${index}.js`,
            programPointId: `p${index}`,
          }),
        ),
      );
    }
    writeFileSync(filePath, lines.join("\n"), "utf8");

    const records = await readDeduplicatedCorpusRecords(filePath, 20);
    const indexes = records.map((item) =>
      Number.parseInt(item.sampleId.slice(1), 10),
    );

    assert.equal(records.length, 20);
    assert.ok(
      Math.max(...indexes) >= total / 2,
      `样本应覆盖文件后半段，实际最大下标 ${Math.max(...indexes)}`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("按实体分层抽样时高频实体不会挤掉低频实体", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "r97-corpus-"));
  const filePath = path.join(directory, "corpus.jsonl");
  try {
    const lines = [];
    for (let index = 0; index < 200; index += 1) {
      lines.push(
        JSON.stringify(
          record({
            sampleId: `hot${index}`,
            file: "f.js",
            programPointId: `hot${index}`,
            entityId: "Object.defineProperty",
          }),
        ),
      );
    }
    for (let index = 0; index < 6; index += 1) {
      lines.push(
        JSON.stringify(
          record({
            sampleId: `rare${index}`,
            file: "f.js",
            programPointId: `rare${index}`,
            entityId: `Rare${index}.call`,
          }),
        ),
      );
    }
    writeFileSync(filePath, lines.join("\n"), "utf8");

    const records = await readDeduplicatedCorpusRecords(filePath, 10, {
      perEntityCap: 2,
    });
    const entities = new Set(records.map((item) => item.entityId));

    assert.equal(entities.size, 7);
    assert.ok(entities.has("Object.defineProperty"));
    for (let index = 0; index < 6; index += 1) {
      assert.ok(
        entities.has(`Rare${index}.call`),
        `低频实体 Rare${index}.call 不应被高频实体挤掉`,
      );
    }
    assert.equal(
      records.filter((item) => item.entityId === "Object.defineProperty").length,
      2,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Node 内置模块实体重建为可再次解析的模块调用", () => {
  assert.equal(
    sourceForRecord(
      record({
        entityId: "node:fs.readFileSync",
        bindingKind: "module_import",
      }),
    ),
    'import * as fs from "fs";\nfs.readFileSync();',
  );
});

test("微信目标运行时必须由真实报告文件提供证据", () => {
  const options = parseBenchmarkArgs([
    "--include-wechat",
    "--wechat-report",
    "datasets/wechat-live/wechat-probe-report.json",
  ]);

  assert.ok(options.targetRuntimeIds.includes("e4-wechat-real"));
  assert.match(
    options.wechatReportPath,
    /wechat-probe-report\.json$/,
  );
});
