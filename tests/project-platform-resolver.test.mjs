import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TARGET_RUNTIME_STATUS } from "../src/constants.mjs";
import { detectMiniProgramPackage } from "../src/evaluation/project-platform-resolver.mjs";
import { resolveTargetRuntime } from "../src/target-runtime-resolver.mjs";

const scaffold = ({
  appService = "var a = 1;",
  pageFrame = "<!doctype html><html></html>",
  appConfig = { pages: ["pages/index/index"], entryPagePath: "pages/index/index" },
  workers = false,
} = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "r97-project-"));
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
  if (workers) {
    mkdirSync(path.join(dir, "workers"));
  }
  return dir;
};

test("标准小程序包布局产出两条独立的结构指纹", () => {
  const dir = scaffold();
  try {
    const detection = detectMiniProgramPackage({
      projectDir: dir,
      artifactScope: dir,
      detectedAt: "2026-09-23T00:00:00.000Z",
    });

    assert.equal(detection.platformFamily, "wechat");
    assert.equal(detection.executionSurface, "appservice");
    assert.equal(detection.signals.length, 2);
    assert.deepEqual(detection.missing, ["version_profile"]);
    assert.equal(detection.evidenceRecords.length, 2);
    // 产物绑定必须是真实哈希，不能为 null。
    for (const record of detection.evidenceRecords) {
      assert.match(record.artifactHash, /^[0-9a-f]{64}$/);
      assert.equal(record.external, true);
      assert.equal(record.authority, "authoritative");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("只有单条指纹时仍然识别，但信号数不同", () => {
  const dir = scaffold({ pageFrame: null, appConfig: null });
  try {
    const detection = detectMiniProgramPackage({
      projectDir: dir,
      artifactScope: dir,
      detectedAt: "2026-09-23T00:00:00.000Z",
    });

    assert.equal(detection.signals.length, 0);
    assert.equal(detection.platformFamily, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("不认识的目录结构不产出任何平台证据", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "r97-project-"));
  try {
    writeFileSync(path.join(dir, "index.js"), "console.log(1);", "utf8");
    const detection = detectMiniProgramPackage({
      projectDir: dir,
      artifactScope: dir,
    });

    assert.deepEqual(detection.evidenceRecords, []);
    assert.equal(detection.platformFamily, null);
    assert.deepEqual(detection.missing, ["platform_family"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("平台判定器产出的证据把目标推进到 context_unknown", () => {
  const dir = scaffold();
  try {
    const detection = detectMiniProgramPackage({
      projectDir: dir,
      artifactScope: dir,
      detectedAt: "2026-09-23T00:00:00.000Z",
    });
    const resolved = resolveTargetRuntime({
      artifactId: path.join(dir, "app-service.js"),
      scopeIds: [path.basename(dir)],
      targetRuntimeEvidence: detection.evidenceRecords,
      targetRuntimeSource: "unknown",
    });

    assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CONTEXT_UNKNOWN);
    assert.deepEqual(resolved.missing, ["version_profile"]);
    // 候选收窄到微信族的执行表面，而不是空集。
    assert.deepEqual(resolved.candidateRuntimeIds, ["appservice", "worker"]);
    assert.notEqual(resolved.status, TARGET_RUNTIME_STATUS.CONFIRMED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("项目配置给出具体 libVersion 时拿到版本画像，但仍只到 corroborated", () => {
  const dir = scaffold();
  try {
    writeFileSync(
      path.join(dir, "project.private.config.json"),
      JSON.stringify({ libVersion: "3.15.2" }),
      "utf8",
    );
    const detection = detectMiniProgramPackage({
      projectDir: dir,
      artifactScope: dir,
      detectedAt: "2026-09-24T00:00:00.000Z",
    });

    assert.deepEqual(detection.versionProfile, ["sdk:3.15.2"]);
    assert.deepEqual(detection.missing, []);

    // 关键边界：**只有真正提供版本信息的那一条证据**带画像。若把 libVersion
    // 复制进全部证据，确认门槛的「≥2 条完整证据」就会被同一份数据的副本满足，
    // 项目会被误判成 confirmed——那不是独立佐证。
    const withProfile = detection.evidenceRecords.filter(
      (record) => record.versionProfile.length > 0,
    );
    assert.equal(withProfile.length, 1);
    assert.equal(withProfile[0].signalIndex !== undefined, true);

    const resolved = resolveTargetRuntime({
      artifactId: dir,
      scopeIds: [path.basename(dir)],
      targetRuntimeEvidence: detection.evidenceRecords,
      targetRuntimeSource: "unknown",
    });
    assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CORROBORATED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("占位版本号不构成版本画像", () => {
  for (const placeholder of ["trial", "development", "latest"]) {
    const dir = scaffold();
    try {
      writeFileSync(
        path.join(dir, "project.private.config.json"),
        JSON.stringify({ libVersion: placeholder }),
        "utf8",
      );
      const detection = detectMiniProgramPackage({
        projectDir: dir,
        artifactScope: dir,
        detectedAt: "2026-09-24T00:00:00.000Z",
      });
      assert.deepEqual(
        detection.versionProfile,
        [],
        `${placeholder} 不应被当成版本画像`,
      );
      assert.deepEqual(detection.missing, ["version_profile"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
