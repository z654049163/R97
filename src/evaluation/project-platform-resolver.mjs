import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { EVIDENCE_PROVENANCE } from "../constants.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";

/**
 * 平台判定器（第一片）：从**已解包的小程序包结构**生成平台族级外部证据。
 *
 * 这一片刻意只做「平台族 + 执行表面」，不伪造版本画像。实测 1572 个真实项目里
 * `app-config.json` 与 `page-frame.html` 都不含基础库版本，包内也没有任何字段
 * 能给出它——版本画像只能来自运行轨迹或运行时指纹。硬凑一个版本会让
 * `confirmed` 变成自欺，正确的结果是 `context_unknown`。
 *
 * 判据都来自平台自身的产物，不是「语料里见过什么」：
 *
 * - 同时存在 `app-service.js` 与 `page-frame.html`：微信打包器把业务包与渲染帧
 *   拆成这两个产物；
 * - `app-config.json` 含 `entries` 级别的编译后配置字段（`pages` +
 *   `entryPagePath`/`page`/`global`）。
 *
 * `app-service.js` 本身就是 AppService 包，因此执行表面可以直接定为
 * `appservice`；同一项目里没有 `workers/` 目录时不枚举 Worker 表面。
 */
export const detectMiniProgramPackage = ({
  projectDir,
  artifactScope,
  revision = null,
  detectedAt = new Date().toISOString(),
  runtimeId = RUNTIME_IDS.WECHAT,
}) => {
  const appServicePath = path.join(projectDir, "app-service.js");
  const pageFramePath = path.join(projectDir, "page-frame.html");
  const appConfigPath = path.join(projectDir, "app-config.json");

  const signals = [];
  if (existsSync(appServicePath) && existsSync(pageFramePath)) {
    signals.push({
      signalId: "miniprogram-package-layout",
      source: "build_manifest",
      detail: "app-service.js 与 page-frame.html 同时存在",
    });
  }

  const appConfig = readJsonIfPresent(appConfigPath);
  if (
    appConfig &&
    Array.isArray(appConfig.pages) &&
    (typeof appConfig.entryPagePath === "string" ||
      appConfig.page !== undefined ||
      appConfig.global !== undefined)
  ) {
    signals.push({
      signalId: "miniprogram-compiled-app-config",
      source: "official_project_config",
      detail: "app-config.json 含 entryPagePath / pages / page 等编译后配置字段",
    });
  }

  if (signals.length === 0) {
    return {
      platformFamily: null,
      executionSurface: null,
      signals: [],
      evidenceRecords: [],
      versionProfile: [],
      missing: ["platform_family"],
    };
  }

  // 产物绑定必须是真实的：算 app-service.js 的 sha256，而不是拿项目目录名充数。
  const artifactHash = existsSync(appServicePath)
    ? createHash("sha256").update(readFileSync(appServicePath)).digest("hex")
    : null;
  const hasWorkerDirectory = existsSync(path.join(projectDir, "workers"));
  // 版本画像：开发者工具会把实际使用的基础库版本写进项目私有配置。
  //
  // 此前只按**文件名**找 `project.config.json`（只有 3 个，且都在子目录），据此
  // 断定「包内没有版本信息」。按内容搜索后发现 474 个项目带
  // `project.private.config.json`，其中 354 个的 `libVersion` 是具体版本号
  // （3.15.2、3.16.1 这一类）；`trial` / `development` 不算版本画像，直接跳过。
  //
  // 要注意这只到 `corroborated`：单份项目配置是权威来源，但确认门槛要求
  // 「至少一个独立佐证」，而这 354 个项目里没有一个同时提供第二种来源。
  const libVersion = readConcreteLibVersion(projectDir);
  const versionProfile = libVersion
    ? Object.freeze([`sdk:${libVersion}`])
    : Object.freeze([]);
  if (libVersion) {
    signals.push({
      signalId: "miniprogram-project-lib-version",
      source: "official_project_config",
      detail: `项目私有配置声明基础库版本 ${libVersion}`,
    });
  }
  const evidenceRecords = signals.map((signal, index) =>
    Object.freeze({
      evidenceId: `${signal.signalId}:${path.basename(projectDir)}`,
      runtimeId,
      platformFamily: "wechat",
      executionSurface: "appservice",
      // 只有**真正提供版本信息的那一条**带版本画像。
      //
      // 第一版把读到的 libVersion 复制进了全部三条证据（包布局、编译配置、
      // 项目配置），结果确认门槛里的「≥2 条完整证据」被同一份数据的副本满足，
      // 354 个项目直接变成 `confirmed`。那不是独立佐证，是同一条观测数了三遍。
      // 现在只有 `miniprogram-project-lib-version` 带画像，其余两条的
      // versionProfile 保持为空，于是这 354 个项目正确地停在 `corroborated`。
      versionProfile:
        signal.signalId === "miniprogram-project-lib-version"
          ? [...versionProfile]
          : [],
      scopeId: path.basename(projectDir),
      artifactScope: artifactScope ?? projectDir,
      artifactHash,
      revision,
      detectedAt,
      validFrom: detectedAt,
      validUntil: null,
      external: true,
      authority: "authoritative",
      source: signal.source,
      provenance: EVIDENCE_PROVENANCE.OFFICIAL_SPEC,
      note: signal.detail,
      signalIndex: index,
    }),
  );

  return {
    platformFamily: "wechat",
    executionSurface: "appservice",
    hasWorkerDirectory,
    signals,
    evidenceRecords,
    versionProfile,
    // 族与执行表面一定有；版本画像只有部分项目拿得到，拿不到时就是
    // `context_unknown` 的形状。
    missing: libVersion ? [] : ["version_profile"],
  };
};

/**
 * 从项目配置里读**具体**的基础库版本。`trial` / `development` / `latest` 这类
 * 占位值不是版本画像，返回 null。
 */
const readConcreteLibVersion = (projectDir) => {
  for (const name of [
    "project.private.config.json",
    "project.config.json",
  ]) {
    const parsed = readJsonIfPresent(path.join(projectDir, name));
    const value = parsed?.libVersion;
    if (typeof value === "string" && /^\d+\.\d+\.\d+$/u.test(value)) {
      return value;
    }
  }
  return null;
};

const readJsonIfPresent = (filePath) => {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};
