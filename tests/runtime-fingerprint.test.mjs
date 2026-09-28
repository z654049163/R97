import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TARGET_RUNTIME_STATUS } from "../src/constants.mjs";
import {
  buildRuntimeFingerprintEvidence,
  buildWechatDeploymentFingerprint,
  resolveFingerprintArtifactPath,
} from "../src/evaluation/runtime-fingerprint.mjs";
import { resolveTargetRuntime } from "../src/target-runtime-resolver.mjs";

const descriptor = {
  runtimeId: "e4-wechat-real",
  platformFamily: "wechat",
  executionSurface: "appservice",
  versionProfile: ["sdk:3.17.3"],
  scopeId: "proj",
  artifactScope: "proj/app-service.js",
  artifactHash: "sha256:abc",
  detectedAt: "2026-09-23T00:00:00.000Z",
};

test("部署指纹构造出可用的目标证据", () => {
  const record = buildRuntimeFingerprintEvidence({
    ...descriptor,
    evidenceId: "fp:1",
  });

  assert.equal(record.external, true);
  assert.equal(record.authority, "authoritative");
  assert.equal(record.source, "runtime_fingerprint");
  assert.deepEqual(record.versionProfile, ["sdk:3.17.3"]);
});

test("缺版本画像时拒绝构造：正是它把目标推进到 confirmed", () => {
  assert.throws(
    () =>
      buildRuntimeFingerprintEvidence({
        ...descriptor,
        evidenceId: "fp:1",
        versionProfile: [],
      }),
    /versionProfile/,
  );
});

test("缺产物绑定时拒绝构造", () => {
  assert.throws(
    () =>
      buildRuntimeFingerprintEvidence({
        ...descriptor,
        evidenceId: "fp:1",
        artifactHash: null,
        revision: null,
      }),
    /artifactHash 或 revision/,
  );
});

test("非部署侧来源不能冒充运行时指纹", () => {
  assert.throws(
    () =>
      buildRuntimeFingerprintEvidence({
        ...descriptor,
        evidenceId: "fp:1",
        source: "official_project_config",
      }),
    /部署侧指纹来源/,
  );
});

test("两份独立部署指纹把目标推进到 confirmed", () => {
  const first = buildRuntimeFingerprintEvidence({
    ...descriptor,
    evidenceId: "fp:1",
    source: "runtime_fingerprint",
  });
  const second = buildRuntimeFingerprintEvidence({
    ...descriptor,
    evidenceId: "fp:2",
    artifactHash: null,
    revision: "rev-1",
    source: "runtime_trace",
  });

  const resolved = resolveTargetRuntime({
    artifactId: descriptor.artifactScope,
    scopeIds: [descriptor.scopeId],
    targetRuntimeEvidence: [first, second],
    targetRuntimeSource: "unknown",
  });

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CONFIRMED);
  assert.deepEqual(resolved.targetRuntimeIds, ["e4-wechat-real"]);
});

test("只有一份部署指纹时停在 corroborated，不足以放行", () => {
  const only = buildRuntimeFingerprintEvidence({
    ...descriptor,
    evidenceId: "fp:1",
    source: "runtime_fingerprint",
  });

  const resolved = resolveTargetRuntime({
    artifactId: descriptor.artifactScope,
    scopeIds: [descriptor.scopeId],
    targetRuntimeEvidence: [only],
    targetRuntimeSource: "unknown",
  });

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CORROBORATED);
});

const scaffoldProject = (files) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "r97-fingerprint-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content, "utf8");
  }
  return dir;
};

test("从被分析项目的运行时读数构造部署指纹", () => {
  const dir = scaffoldProject({
    "app-service.js": "var app = 1;",
    "app-config.json": JSON.stringify({ pages: ["pages/index/index"] }),
  });

  const record = buildWechatDeploymentFingerprint({
    evidenceId: "trace:1",
    projectDir: dir,
    detectedAt: "2026-09-23T00:00:00.000Z",
    sdkVersion: "3.17.3",
  });

  assert.equal(record.platformFamily, "wechat");
  assert.equal(record.executionSurface, "appservice");
  assert.equal(record.source, "runtime_trace");
  assert.deepEqual(record.versionProfile, ["sdk:3.17.3"]);
  assert.match(record.artifactHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(record.scopeId, path.basename(dir));
});

test("占位版本号不构成版本画像", () => {
  const dir = scaffoldProject({ "app-service.js": "var app = 1;" });

  for (const placeholder of ["trial", "latest", "v3", ""]) {
    assert.throws(
      () =>
        buildWechatDeploymentFingerprint({
          evidenceId: "trace:1",
          projectDir: dir,
          sdkVersion: placeholder,
        }),
      /sdkVersion/,
    );
  }
});

test("产物候选按解包产物优先，其次项目配置与入口", () => {
  const unpacked = scaffoldProject({ "app-service.js": "var a;" });
  assert.equal(
    path.basename(resolveFingerprintArtifactPath(unpacked)),
    "app-service.js",
  );

  const source = scaffoldProject({
    "project.config.json": JSON.stringify({ libVersion: "3.17.3" }),
    "app.js": "App({});",
  });
  assert.equal(
    path.basename(resolveFingerprintArtifactPath(source)),
    "project.config.json",
  );
});

test("单份真实运行时指纹只到 corroborated，不授权放行", () => {
  const dir = scaffoldProject({ "app-service.js": "var app = 1;" });
  const record = buildWechatDeploymentFingerprint({
    evidenceId: "trace:1",
    projectDir: dir,
    detectedAt: "2026-09-23T00:00:00.000Z",
    sdkVersion: "3.17.3",
  });

  const resolved = resolveTargetRuntime({
    artifactId: record.artifactScope,
    scopeIds: [record.scopeId],
    targetRuntimeEvidence: [record],
    targetRuntimeSource: "unknown",
  });

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CORROBORATED);
});
