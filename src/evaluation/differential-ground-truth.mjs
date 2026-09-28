import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { collectBrowserObservations, findBrowserPath } from "../evidence/browser-probe.mjs";
import { withCdpPage } from "../evidence/cdp-client.mjs";
import { collectNodeObservations } from "../evidence/node-probe.mjs";
import {
  buildOracleProbeExpression,
  evaluateOracleProbeInNode,
  evaluateOracleProbeInVm,
} from "../evidence/oracle-probe.mjs";
import { RUNTIME_IDS } from "../runtime-profiles.mjs";
import { WECHAT_PROBE_EXCLUDED_ROOTS } from "../evidence/wechat-probe.mjs";

const PROBE_DIMENSIONS = Object.freeze([
  "existence",
  "type",
  "callability",
]);

/**
 * 独立真值：把同一份**判卷探针**放进每个宿主里执行，比较同一实体路径的
 * 三个语义维度。
 *
 * 关键约束是「同一把尺子」：Node、Edge、真实微信三边跑的必须是同一段代码，
 * 否则两边结果不同时，分不清是环境差异还是探针写法差异。语言基线的观测取自
 * 描述符探针（它没有独立的判卷实现），这一点在 provenance 里显式标出。
 *
 * `expectedStateFromEvidence` 用 R97 自己的规则重算 expected，拿它比较等于让
 * R97 和自己对答案；只有这里的跨宿主实测差分能回答「放行的折叠里有多少在真实
 * 宿主上并不一致」。
 */
export const collectGroundTruth = async ({
  entityIds,
  wechatReportPath = null,
  observedAt = new Date().toISOString(),
}) => {
  const entityDimensions = Object.fromEntries(
    entityIds.map((entityId) => [entityId, [...PROBE_DIMENSIONS]]),
  );

  // 判卷侧观测：同一份探针，四个环境。语言基线跑在真实隔离的 vm 里，
  // 而不是「当前 Node realm + 白名单过滤」——后者既不是独立环境，也不是
  // 独立实现，作为判卷参照说不通。
  const languageDirect = evaluateOracleProbeInVm(entityIds);
  const nodeDirect = evaluateOracleProbeInNode(entityIds);
  const profileDir = path.join(process.cwd(), ".runtime", "edge-profile");
  mkdirSync(profileDir, { recursive: true });
  const edgeDirect = await withCdpPage(
    { browserPath: findBrowserPath(), profileDir },
    ({ evaluate }) => evaluate(buildOracleProbeExpression(entityIds)),
  );
  const wechat = loadWechatGroundTruth({ entityIds, wechatReportPath });

  const observations = {};
  for (const entityId of entityIds) {
    observations[entityId] = {
      [RUNTIME_IDS.LANGUAGE]:
        normalizeOracleObservation(languageDirect[entityId]),
      [RUNTIME_IDS.NODE]: normalizeOracleObservation(nodeDirect[entityId]),
      [RUNTIME_IDS.EDGE]: normalizeOracleObservation(edgeDirect[entityId]),
    };
    if (wechat) {
      observations[entityId][RUNTIME_IDS.WECHAT] =
        wechat.observations[entityId] ?? null;
    }
  }

  const divergent = {};
  for (const entityId of entityIds) {
    const byRuntime = observations[entityId];
    const observedRuntimes = Object.entries(byRuntime)
      .filter(([, values]) => values !== null)
      .map(([runtimeId]) => runtimeId);
    divergent[entityId] = hasPairwiseDivergence(byRuntime, observedRuntimes);
  }

  return {
    divergent,
    observations,
    provenance: describeProvenance({ entityIds, observations, wechat }),
    excluded: describeExclusions(entityIds),
  };
};

/** 兼容旧调用点：只取布尔差分表。 */
export const collectDifferentialGroundTruth = async (entityIds, options = {}) =>
  (await collectGroundTruth({ entityIds, ...options })).divergent;

const loadWechatGroundTruth = ({ entityIds, wechatReportPath }) => {
  if (!wechatReportPath || !existsSync(wechatReportPath)) {
    return null;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(wechatReportPath, "utf8"));
  } catch {
    return null;
  }
  const values = report?.wechatValues;
  if (!values || typeof values !== "object") {
    return null;
  }
  const observations = {};
  for (const entityId of entityIds) {
    const raw = values[entityId];
    if (!raw || typeof raw !== "object" || raw.probeError) {
      continue;
    }
    const normalized = {};
    for (const dimension of PROBE_DIMENSIONS) {
      if (Object.hasOwn(raw, dimension)) {
        normalized[dimension] = raw[dimension];
      }
    }
    if (Object.keys(normalized).length > 0) {
      observations[entityId] = normalized;
    }
  }
  return {
    observations,
    collectedAt: report.generatedAt ?? null,
    sdkVersion: report.sdkVersion ?? null,
    platform: report.platform ?? null,
    probeImplementation: report.probeImplementation ?? "unknown",
  };
};

const normalizeOracleObservation = (value) => {
  if (!value || typeof value !== "object" || value.error) {
    return null;
  }
  const values = {};
  for (const dimension of PROBE_DIMENSIONS) {
    if (Object.hasOwn(value, dimension)) {
      values[dimension] = value[dimension];
    }
  }
  return Object.keys(values).length === 0 ? null : values;
};

const hasPairwiseDivergence = (byRuntime, runtimeIds) => {
  for (let left = 0; left < runtimeIds.length; left += 1) {
    for (let right = left + 1; right < runtimeIds.length; right += 1) {
      if (
        !sameObservation(
          byRuntime[runtimeIds[left]],
          byRuntime[runtimeIds[right]],
        )
      ) {
        return true;
      }
    }
  }
  return false;
};

const sameObservation = (left, right) => {
  if (!left || !right) {
    return false;
  }
  for (const dimension of PROBE_DIMENSIONS) {
    const leftHas = Object.hasOwn(left, dimension);
    const rightHas = Object.hasOwn(right, dimension);
    if (!leftHas && !rightHas) {
      continue;
    }
    if (leftHas !== rightHas || left[dimension] !== right[dimension]) {
      return false;
    }
  }
  return true;
};

const describeProvenance = ({ entityIds, observations, wechat }) => {
  const countObserved = (runtimeId) =>
    entityIds.filter(
      (entityId) => observations[entityId][runtimeId] !== null,
    ).length;
  const runtimes = [
    {
      runtimeId: RUNTIME_IDS.LANGUAGE,
      probeImplementation: "r97-oracle-probe（隔离 vm，非宿主）",
      isHost: false,
      observedEntityCount: countObserved(RUNTIME_IDS.LANGUAGE),
      collectedAt: null,
      versionProfile: null,
    },
    {
      runtimeId: RUNTIME_IDS.NODE,
      probeImplementation: "r97-oracle-probe",
      isHost: true,
      observedEntityCount: countObserved(RUNTIME_IDS.NODE),
      collectedAt: null,
      versionProfile: process.version,
    },
    {
      runtimeId: RUNTIME_IDS.EDGE,
      probeImplementation: "r97-oracle-probe",
      isHost: true,
      observedEntityCount: countObserved(RUNTIME_IDS.EDGE),
      collectedAt: null,
      versionProfile: null,
    },
  ];
  if (wechat) {
    runtimes.push({
      runtimeId: RUNTIME_IDS.WECHAT,
      probeImplementation: wechat.probeImplementation,
      isHost: true,
      observedEntityCount: countObserved(RUNTIME_IDS.WECHAT),
      collectedAt: wechat.collectedAt,
      versionProfile: wechat.sdkVersion,
      platform: wechat.platform,
      snapshot: true,
    });
  }
  return { runtimes };
};

const describeExclusions = (entityIds) => {
  const excluded = [];
  for (const entry of WECHAT_PROBE_EXCLUDED_ROOTS) {
    const matched = entityIds.filter(
      (entityId) => String(entityId).split(".")[0] === entry.root,
    );
    if (matched.length > 0) {
      excluded.push({
        root: entry.root,
        reason: entry.reason,
        entityCount: matched.length,
        entityIds: matched.slice(0, 20),
      });
    }
  }
  return excluded;
};
