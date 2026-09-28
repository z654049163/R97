import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { EVIDENCE_PROVENANCE } from "../constants.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";

/** 能作为「目标运行时指纹」的来源。都是部署侧才会产生的证据。 */
export const RUNTIME_FINGERPRINT_SOURCES = Object.freeze([
  "runtime_fingerprint",
  "runtime_trace",
  "deployment_config",
]);

/**
 * 从一份**部署侧运行时指纹**构造目标证据记录。
 *
 * 这是唯一能把目标从 `context_unknown` 推进到 `confirmed` 的东西。平台判定器
 * 能从包结构确认平台族与执行表面，但**包内没有任何字段**能给出基础库版本——
 * 实测 1572 个真实项目全部如此。版本只能来自运行轨迹、崩溃上报、灰度配置这类
 * 部署侧通道。
 *
 * 这里做参数校验而不是默默拼装：缺产物绑定或时间范围时立刻报错，因为
 * `confirmed` 的门槛就是靠这些字段撑住的，放过一个假的会让整条判卷失效。
 */
export const buildRuntimeFingerprintEvidence = ({
  evidenceId,
  runtimeId,
  platformFamily,
  executionSurface,
  versionProfile,
  scopeId,
  artifactScope,
  artifactHash = null,
  revision = null,
  detectedAt,
  validFrom = detectedAt,
  validUntil = null,
  source = "runtime_fingerprint",
  provenance = EVIDENCE_PROVENANCE.HUMAN_REVIEW,
  authority = "authoritative",
}) => {
  requireString(evidenceId, "evidenceId");
  requireString(runtimeId, "runtimeId");
  requireString(platformFamily, "platformFamily");
  requireString(executionSurface, "executionSurface");
  requireString(scopeId, "scopeId");
  requireString(artifactScope, "artifactScope");
  requireString(detectedAt, "detectedAt");
  if (!Array.isArray(versionProfile) || versionProfile.length === 0) {
    throw new TypeError(
      "versionProfile 必须非空：正是它把目标从 context_unknown 推到 confirmed",
    );
  }
  if (!RUNTIME_FINGERPRINT_SOURCES.includes(source)) {
    throw new TypeError(
      `source 必须是部署侧指纹来源之一：${RUNTIME_FINGERPRINT_SOURCES.join(", ")}`,
    );
  }
  if (!artifactHash && !revision) {
    throw new TypeError(
      "artifactHash 或 revision 必须有一个：没有产物绑定就不算证据",
    );
  }
  return Object.freeze({
    evidenceId,
    runtimeId,
    platformFamily,
    executionSurface,
    versionProfile: Object.freeze([...versionProfile]),
    scopeId,
    artifactScope,
    artifactHash,
    revision,
    detectedAt,
    validFrom,
    validUntil,
    external: true,
    authority,
    source,
    provenance,
  });
};

const requireString = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
};

/** 具体版本号。`trial`、`latest`、空串都不是版本画像。 */
export const CONCRETE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-.][\w.]+)?$/u;

/** 解包产物优先，源码项目退到项目配置与入口——三者都能唯一锚定一次构建。 */
const DEFAULT_ARTIFACT_CANDIDATES = Object.freeze([
  "app-service.js",
  "project.config.json",
  "app.js",
]);

export const resolveFingerprintArtifactPath = (projectDir) => {
  for (const candidate of DEFAULT_ARTIFACT_CANDIDATES) {
    const candidatePath = path.join(projectDir, candidate);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  throw new Error(
    `项目目录里找不到可绑定的产物（试过 ${DEFAULT_ARTIFACT_CANDIDATES.join("、")}）：${projectDir}`,
  );
};

/**
 * 从**被分析项目**的运行时读数构造部署指纹证据。
 *
 * 这是把目标从 `context_unknown` 推到 `confirmed` 的实际入口：包结构能给出
 * 平台族与执行表面，但包内没有任何字段能给出基础库版本，版本只能来自真实
 * 运行轨迹。`sdkVersion` 因此必须是一个**具体版本号**——`trial` / `latest`
 * 这类占位值会在这里被拒掉，而不是拼进证据里让 `confirmed` 变成自欺。
 *
 * 单份指纹只到 `corroborated`：确认门槛要求同一运行时下 ≥2 条版本完整证据。
 */
export const buildWechatDeploymentFingerprint = ({
  evidenceId,
  projectDir,
  artifactPath = null,
  executionSurface = "appservice",
  scopeId = null,
  detectedAt = new Date().toISOString(),
  sdkVersion,
  runtimeId = RUNTIME_IDS.WECHAT,
  source = "runtime_trace",
  revision = null,
  provenance = EVIDENCE_PROVENANCE.HUMAN_REVIEW,
  authority = "authoritative",
}) => {
  requireString(projectDir, "projectDir");
  requireString(sdkVersion, "sdkVersion");
  if (!CONCRETE_VERSION_PATTERN.test(sdkVersion.trim())) {
    throw new TypeError(
      `sdkVersion 必须是具体版本号（形如 3.17.3），收到 ${JSON.stringify(sdkVersion)}`,
    );
  }

  const resolvedArtifact =
    artifactPath ?? resolveFingerprintArtifactPath(projectDir);
  if (!existsSync(resolvedArtifact)) {
    throw new Error(`产物文件不存在，无法绑定：${resolvedArtifact}`);
  }

  return buildRuntimeFingerprintEvidence({
    evidenceId,
    runtimeId,
    platformFamily: "wechat",
    executionSurface,
    versionProfile: [`sdk:${sdkVersion.trim()}`],
    scopeId: scopeId ?? path.basename(projectDir),
    artifactScope: resolvedArtifact,
    artifactHash: `sha256:${sha256File(resolvedArtifact)}`,
    revision,
    detectedAt,
    source,
    provenance,
    authority,
  });
};

const sha256File = (filePath) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");
