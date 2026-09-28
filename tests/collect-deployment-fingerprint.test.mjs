import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectDeploymentFingerprint,
  parseCollectFingerprintArgs,
} from "../src/evaluation/collect-deployment-fingerprint.mjs";

const scaffoldProject = ({
  appService = "var a = 1;",
  pageFrame = "<!doctype html><html></html>",
  appConfig = { pages: ["pages/index/index"], entryPagePath: "pages/index/index" },
} = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "r97-deploy-"));
  if (appService !== null) {
    writeFileSync(path.join(dir, "app-service.js"), appService, "utf8");
  }
  if (pageFrame !== null) {
    writeFileSync(path.join(dir, "page-frame.html"), pageFrame, "utf8");
  }
  if (appConfig !== null) {
    writeFileSync(
      path.join(dir, "app-config.json"),
      JSON.stringify(appConfig),
      "utf8",
    );
  }
  return dir;
};

const stubRuntimeInfo = (sdkVersion) => async () => ({
  observedAt: "2026-09-23T00:00:00.000Z",
  sdkVersion,
  wechatVersion: "8.0.49",
  platform: "devtools",
  connectionMode: "connect",
});

test("采集真实运行时读数并产出可绑定的部署指纹", async () => {
  const dir = scaffoldProject();

  const summary = await collectDeploymentFingerprint({
    projectDir: dir,
    detectedAt: "2026-09-23T00:00:00.000Z",
    readRuntimeInfo: stubRuntimeInfo("3.17.3"),
  });

  assert.equal(summary.platformFamily, "wechat");
  assert.equal(summary.executionSurface, "appservice");
  assert.equal(summary.sdkVersion, "3.17.3");
  assert.equal(summary.evidence.source, "runtime_trace");
  assert.deepEqual(summary.evidence.versionProfile, ["sdk:3.17.3"]);
  assert.deepEqual(summary.packageSignals, [
    "miniprogram-package-layout",
    "miniprogram-compiled-app-config",
  ]);
});

test("运行时没返回 SDKVersion 时拒绝产出证据", async () => {
  const dir = scaffoldProject();

  await assert.rejects(
    () =>
      collectDeploymentFingerprint({
        projectDir: dir,
        readRuntimeInfo: stubRuntimeInfo(null),
      }),
    /SDKVersion/,
  );
});

test("输出目录里写出产物绑定与版本画像", async () => {
  const dir = scaffoldProject();
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "r97-deploy-out-"));

  await collectDeploymentFingerprint({
    projectDir: dir,
    outputDir,
    detectedAt: "2026-09-23T00:00:00.000Z",
    readRuntimeInfo: stubRuntimeInfo("3.17.3"),
  });

  const written = JSON.parse(
    readFileSync(path.join(outputDir, "deployment-fingerprint.json"), "utf8"),
  );
  assert.equal(written.sdkVersion, "3.17.3");
  assert.match(written.artifactHash, /^sha256:[0-9a-f]{64}$/u);
});

test("采集参数要求显式项目路径", () => {
  assert.throws(
    () => parseCollectFingerprintArgs(["--out", "x"]),
    /--project/,
  );
  const options = parseCollectFingerprintArgs([
    "--project",
    ".",
    "--mode",
    "connect",
  ]);
  assert.equal(options.mode, "connect");
});
