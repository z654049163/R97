import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readDistinctCorpusEntities } from "../src/evaluation/collect-wechat.mjs";
import { collectWechatObservations } from "../src/evidence/wechat-devtools.mjs";

test("通过自动化启动真实开发者工具项目并生成微信观测", async () => {
  let launchOptions;
  let closed = false;
  const launcher = {
    launch: async (options) => {
      launchOptions = options;
      return {
        evaluate: async (probe, requested) => {
          assert.equal(typeof probe, "function");
          if (!requested) {
            return true;
          }
          // 判卷探针收的是实体数组，与 Node / Edge 判卷一致。
          assert.deepEqual(requested, ["wx.request", "process"]);
          return {
            "wx.request": {
              existence: true,
              type: "function",
              callability: true,
            },
            process: {
              existence: false,
              type: "undefined",
              callability: false,
            },
          };
        },
        systemInfo: async () => ({
          SDKVersion: "3.10.0",
          platform: "devtools",
        }),
        close: async () => {
          closed = true;
        },
      };
    },
  };

  const collection = await collectWechatObservations({
    entityDimensions: {
      "wx.request": ["existence", "type", "callability"],
      process: ["existence", "type", "callability"],
    },
    cliPath: "E:\\微信开发者工具\\cli.bat",
    launcher,
    observedAt: "2026-09-18T00:00:00.000Z",
  });

  assert.equal(launchOptions.trustProject, true);
  assert.equal(launchOptions.cliPath, "E:\\微信开发者工具\\cli.bat");
  assert.equal(closed, true);
  assert.deepEqual(collection.observations["wx.request"].values, {
    existence: true,
    type: "function",
    callability: true,
  });
  // 探针跑在 fixture 项目，而采集的观测要用于别的项目，因此这是**跨项目证据**：
  // 「存在」可以外推，「不存在」不能——`process` 在 fixture 的微信里不存在，
  // 但这只说明这个 fixture 没有，不代表被分析项目的微信里没有。
  // 把「不存在」当成目标环境的「不存在」，会与语言基线撞成一致而错误放行。
  assert.equal(collection.observations.process, undefined);
  assert.equal(collection.scopeKind, "cross_project");
  assert.ok(collection.droppedAbsenceCount >= 1);
  assert.equal(collection.sdkVersion, "3.10.0");
  assert.equal(collection.report.appServiceReady, true);
  assert.equal(collection.report.stage, "node-vs-wechat");
});

test("AppService 未就绪时拒绝产出微信证据", async () => {
  const launcher = {
    launch: async () => ({
      evaluate: async () => false,
      systemInfo: async () => ({ SDKVersion: "3.10.0", platform: "devtools" }),
      close: async () => {},
    }),
  };

  await assert.rejects(
    () =>
      collectWechatObservations({
        entityDimensions: {
          "wx.request": ["existence", "type", "callability"],
        },
        cliPath: "E:\\微信开发者工具\\cli.bat",
        launcher,
        readinessTimeoutMs: 300,
        observedAt: "2026-09-18T00:00:00.000Z",
      }),
    /AppService did not finish startup/,
  );
});

test("微信证据覆盖语料里出现过的全部实体，而不是某个抽样", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "r97-entities-"));
  const filePath = path.join(directory, "corpus.jsonl");
  try {
    const lines = [];
    for (let index = 0; index < 500; index += 1) {
      lines.push(
        JSON.stringify({
          sampleId: `s${index}`,
          project: "p",
          file: "f.js",
          programPointId: `p${index}`,
          entityId: `Entity${index}.member`,
        }),
      );
    }
    writeFileSync(filePath, lines.join("\n"), "utf8");

    const { entities, scannedRecordCount } =
      await readDistinctCorpusEntities({ corpusPath: filePath });

    assert.equal(scannedRecordCount, 500);
    assert.equal(entities.length, 500);
    assert.equal(entities.at(-1), "Entity499.member");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
