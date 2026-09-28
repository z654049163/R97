import assert from "node:assert/strict";
import test from "node:test";

import {
  TARGET_RUNTIME_SOURCE,
  TARGET_RUNTIME_STATUS,
} from "../src/constants.mjs";
import { resolveTargetRuntime } from "../src/target-runtime-resolver.mjs";

const ARTIFACT = "miniapp/app-service.js";
const WECHAT_SURFACE = "wechat:appservice";
const WECHAT_VERSION = ["base-library:3.5.1", "sdk:3.5.1"];

const externalEvidence = ({
  evidenceId,
  runtimeId = "wechat",
  executionSurface = WECHAT_SURFACE,
  versionProfile = WECHAT_VERSION,
  scopeId = ARTIFACT,
  artifactScope = ARTIFACT,
  artifactHash = "sha256:aaa",
  revision = "rev-1",
  source = "official_project_config",
  authority = "authoritative",
  validFrom = "2026-09-01T00:00:00.000Z",
  validUntil = "2026-10-01T00:00:00.000Z",
} = {}) => ({
  evidenceId,
  runtimeId,
  platformFamily: "wechat",
  executionSurface,
  versionProfile,
  scopeId,
  artifactScope,
  artifactHash,
  revision,
  detectedAt: validFrom,
  validFrom,
  validUntil,
  external: true,
  authority,
  source,
  provenance: "official_spec",
});

const resolve = (overrides = {}) =>
  resolveTargetRuntime({
    artifactId: ARTIFACT,
    scopeIds: [ARTIFACT],
    ...overrides,
  });

test("来自代码外部的权威配置只能标为 corroborated", () => {
  const result = resolve({
    targetRuntimeEvidence: [externalEvidence({ evidenceId: "config:1" })],
  });

  assert.equal(result.status, TARGET_RUNTIME_STATUS.CORROBORATED);
  assert.deepEqual(result.targetRuntimeIds, ["wechat"]);
  assert.deepEqual(result.evidenceIds, ["config:1"]);
});

test("两个一致且独立的权威来源才可标为 confirmed", () => {
  const result = resolve({
    targetRuntimeEvidence: [
      externalEvidence({
        evidenceId: "config:1",
        authority: "corroborating",
      }),
      externalEvidence({
        evidenceId: "runtime:1",
        source: "runtime_fingerprint",
      }),
    ],
  });

  assert.equal(result.status, TARGET_RUNTIME_STATUS.CONFIRMED);
  assert.deepEqual(result.targetRuntimeIds, ["wechat"]);
  assert.equal(result.evidenceIds.length, 2);
  assert.equal(result.conflicts.length, 0);
});

test("作用域未绑定当前文件时不能确认目标", () => {
  const result = resolve({
    targetRuntimeEvidence: [
      externalEvidence({
        evidenceId: "config:1",
        scopeId: "other/project",
        artifactScope: "other/project",
      }),
    ],
  });

  assert.equal(result.status, TARGET_RUNTIME_STATUS.UNKNOWN);
  assert.deepEqual(result.targetRuntimeIds, []);
});

test("平台族已确认但版本或表面不完整时进入 context_unknown", () => {
  const noVersion = externalEvidence({
    evidenceId: "config:1",
    versionProfile: [],
  });
  const noSurface = externalEvidence({
    evidenceId: "config:2",
    executionSurface: "",
  });

  const versioned = resolve({ targetRuntimeEvidence: [noVersion] });
  assert.equal(versioned.status, TARGET_RUNTIME_STATUS.CONTEXT_UNKNOWN);
  assert.deepEqual(versioned.missing, ["version_profile"]);
  // 候选收窄到该族的执行表面，而不再是「什么都不知道」。
  assert.deepEqual(versioned.candidateRuntimeIds, ["appservice", "worker"]);

  const surfaceless = resolve({ targetRuntimeEvidence: [noSurface] });
  assert.equal(surfaceless.status, TARGET_RUNTIME_STATUS.CONTEXT_UNKNOWN);
  assert.deepEqual(surfaceless.missing, ["execution_surface"]);
});

test("缺少产物绑定时仍然是 unknown，而不是 context_unknown", () => {
  const noArtifact = externalEvidence({
    evidenceId: "config:3",
    artifactHash: null,
    revision: null,
  });

  const result = resolve({ targetRuntimeEvidence: [noArtifact] });
  assert.equal(result.status, TARGET_RUNTIME_STATUS.UNKNOWN);
});

test("同一范围出现不同版本、执行表面或产物时标记为 conflict", () => {
  const result = resolve({
    targetRuntimeEvidence: [
      externalEvidence({ evidenceId: "config:1" }),
      externalEvidence({
        evidenceId: "runtime:1",
        source: "runtime_fingerprint",
        artifactHash: "sha256:bbb",
      }),
      externalEvidence({
        evidenceId: "config:2",
        executionSurface: "wechat:webview",
      }),
    ],
  });

  assert.equal(result.status, TARGET_RUNTIME_STATUS.CONFLICT);
  assert.deepEqual(result.targetRuntimeIds, []);
  assert.equal(result.conflicts.length, 3);
  assert.ok(
    result.conflicts.every(
      (conflict) =>
        conflict.reason === "version_or_artifact_fingerprint_mismatch",
    ),
  );
});

test("多目标构建会枚举全部目标，而不是任选一个", () => {
  const appServiceEvidence = externalEvidence({
    evidenceId: "config:appservice",
  });
  const webViewEvidence = externalEvidence({
    evidenceId: "config:webview",
    runtimeId: "wechat-webview",
    executionSurface: "wechat:webview",
  });
  const result = resolve({
    targetRuntimeEvidence: [appServiceEvidence, webViewEvidence],
  });

  assert.deepEqual(
    [...result.targetRuntimeIds].sort(),
    ["wechat", "wechat-webview"],
  );
  assert.equal(result.status, TARGET_RUNTIME_STATUS.CORROBORATED);
});

test("用户声明和代码候选都不能越过 confirmation 门槛", () => {
  const declared = resolve({
    declaredRuntimeIds: ["wechat"],
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.DECLARED,
  });
  const inferred = resolve({
    requiredRuntimeIds: ["wechat"],
  });

  assert.equal(declared.status, TARGET_RUNTIME_STATUS.DECLARED);
  assert.deepEqual(declared.candidateRuntimeIds, ["wechat"]);
  assert.equal(inferred.status, TARGET_RUNTIME_STATUS.INFERRED);
  assert.deepEqual(inferred.candidateRuntimeIds, ["wechat"]);
});

test("显式实验配置只作为受控 evaluation default", () => {
  const result = resolve({
    declaredRuntimeIds: ["node"],
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    targetRuntimeExplicit: true,
  });

  assert.equal(result.status, TARGET_RUNTIME_STATUS.CONFIRMED);
  assert.deepEqual(result.targetRuntimeIds, ["node"]);
});

test("不同采集通道各给一部分产物标识不算冲突", () => {
  // 一份来源只给 artifactHash、另一份只给 revision——它们描述的是同一个产物，
  // 只是能拿到的标识不同。早先的实现直接比较字段值，会把这种情形判成 conflict。
  const result = resolve({
    targetRuntimeEvidence: [
      externalEvidence({
        evidenceId: "config:1",
        artifactHash: "sha256:aaa",
        revision: null,
      }),
      externalEvidence({
        evidenceId: "runtime:1",
        source: "runtime_fingerprint",
        artifactHash: null,
        revision: "rev-1",
      }),
    ],
  });

  assert.equal(result.status, TARGET_RUNTIME_STATUS.CONFIRMED);
  assert.deepEqual(result.conflicts, []);
});

test("两边都给出同一标识但不一致时才是冲突", () => {
  const hashes = resolve({
    targetRuntimeEvidence: [
      externalEvidence({ evidenceId: "config:1", artifactHash: "sha256:aaa" }),
      externalEvidence({
        evidenceId: "runtime:1",
        source: "runtime_fingerprint",
        artifactHash: "sha256:bbb",
      }),
    ],
  });
  assert.equal(hashes.status, TARGET_RUNTIME_STATUS.CONFLICT);

  const revisions = resolve({
    targetRuntimeEvidence: [
      externalEvidence({ evidenceId: "config:1", revision: "rev-1" }),
      externalEvidence({
        evidenceId: "runtime:1",
        source: "runtime_fingerprint",
        revision: "rev-2",
      }),
    ],
  });
  assert.equal(revisions.status, TARGET_RUNTIME_STATUS.CONFLICT);
});
