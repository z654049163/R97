import { createHash } from "node:crypto";

import {
  EVIDENCE_PROVENANCE,
  SEMANTIC_DIMENSION,
} from "../constants.mjs";
import { createRuntimeObservation } from "../model.mjs";
import { WECHAT_PROFILE } from "../runtime-profiles.mjs";
import { createOracleProbe } from "./oracle-probe.mjs";

const SAFE_DIMENSIONS = new Set([
  SEMANTIC_DIMENSION.EXISTENCE,
  SEMANTIC_DIMENSION.TYPE,
  SEMANTIC_DIMENSION.CALLABILITY,
]);

// Touching the `Function` constructor inside the WeChat AppService raises
// "Maximum call stack size exceeded" and leaves the AppService unresponsive to
// every later evaluate call. These entities are language built-ins that the R97
// decision rules never allow to identify a host runtime, so they are probed in
// the Node and browser runtimes only.
export const WECHAT_UNSAFE_ENTITY_ROOTS = new Set(["Function"]);

/**
 * 不参与微信侧判卷的根节点，以及原因。
 *
 * 实测确认：AppService 里只要读到 `Function`，会话就卡死——之后连 `Math.max`
 * 都会超时。所以这不是「暂时没测」，而是结构性不可测，必须在判卷报告里显式
 * 标注，而不是让它悄悄缺席。
 */
export const WECHAT_PROBE_EXCLUDED_ROOTS = Object.freeze(
  [...WECHAT_UNSAFE_ENTITY_ROOTS].map((root) => ({
    root,
    reason:
      "AppService 上读取 Function 会栈溢出并卡死会话，该根节点不参与微信侧判卷",
  })),
);

export const buildWechatProbeRequest = (entityDimensions) => {
  const requested = {};
  for (const [entityId, dimensions] of normalizeEntityDimensions(
    entityDimensions,
  )) {
    const root = entityId.split(".")[0];
    if (WECHAT_UNSAFE_ENTITY_ROOTS.has(root)) {
      continue;
    }
    const safeDimensions = dimensions.filter((dimension) =>
      SAFE_DIMENSIONS.has(dimension),
    );
    if (safeDimensions.length > 0) {
      requested[entityId] = safeDimensions;
    }
  }
  return requested;
};

// Serialized by miniprogram-automator and evaluated inside the real WeChat
// AppService. Keep this function self-contained.
//
// 小程序启动时，基础库会在 app-service 包的前导代码里给全局挂上 $gwx / wh /
// gra / grb 等对象。开发者工具刚连上时这些赋值可能还没执行，此时探针会把
// 「尚未装载」误报成「不存在」。采集前必须先用这个函数确认 AppService 已经
// 跑完启动前导，再取证据。
export function r97WechatAppServiceReady() {
  try {
    if (typeof globalThis.$gwx === "function") {
      return true;
    }
    if (typeof globalThis.wh !== "undefined") {
      return true;
    }
    if (typeof globalThis.getApp === "function") {
      const app = globalThis.getApp();
      if (app && typeof app === "object") {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 带维度裁剪的微信判卷探针。
 *
 * 探针本体在 `oracle-probe.mjs`，和 Node / Edge 判卷用的是同一段代码；
 * 这里只按请求的维度裁剪输出，避免把没请求的维度混进证据。
 *
 * 注意这里没有独立的探针实现：早先微信侧自己写了一份，与 Node / Edge 的
 * 判卷探针在 `in` 的用法上不一致，导致同一次比较里分不清「环境差异」和
 * 「尺子差异」。
 */
export const r97WechatProbe = (requested) => {
  const entityIds = Object.keys(requested ?? {});
  const observed = createOracleProbe()(entityIds);
  const output = {};
  for (const entityId of entityIds) {
    const dimensions = requested[entityId] ?? [];
    const values = observed[entityId] ?? {};
    const filtered = {};
    for (const dimension of dimensions) {
      if (Object.hasOwn(values, dimension)) {
        filtered[dimension] = values[dimension];
      }
    }
    output[entityId] = filtered;
  }
  return output;
};

export const importWechatProbeResult = ({
  report,
  entityDimensions,
  runtimeProfile = WECHAT_PROFILE,
  observedAt = new Date().toISOString(),
  scopeKind = "cross_project",
}) => {
  if (!report || report.stage !== "node-vs-wechat") {
    throw new TypeError(
      "WeChat report must be a completed node-vs-wechat result, not a Node-only fixture",
    );
  }
  if (!report.wechatTypeofs || typeof report.wechatTypeofs !== "object") {
    throw new TypeError("WeChat report must contain wechatTypeofs");
  }

  const observations = {};
  // 跨项目证据里，「存在」与「不存在」的信息量是不对称的：
  //
  // - **存在**可以外推：某个对象在 fixture 的微信里存在，说明它是微信平台提供的
  //   （基础库或宿主注入），这个事实对别的项目同样成立。
  // - **不存在不能外推**：它可能只是因为 fixture 那个项目没有注入这个名字
  //   （`wx.BaaS`、`$gwx_wx<hash>`、`nt_*` 都是逐项目生成的），或者 fixture 的
  //   基础库版本没有这个 API（`wx.loadSubpackage`）。
  //
  // 把「不存在」当成目标环境的「不存在」，会与语言基线的「不存在」撞成一致，
  // 于是**错误放行**。实测：微信语料里有 68 条记录正是这样被放行的。
  //
  // 因此跨项目证据下，`existence === false` 的观测直接丢弃，让它退化成
  // 「没有观测」→ EVIDENCE_MISSING → UNKNOWN。
  // `scopeKind` 的三种取值对应三种角色：
  // - `cross_project`（默认）：观测要用于别的项目，丢弃「不存在」。
  // - `same_project`：探针就在被分析项目里跑，「不存在」是有效信息。
  // - `raw`：判卷/差分场景，需要原始观测，不做任何裁剪。
  const dropAbsence = scopeKind === "cross_project";
  // Legacy reports only carry `wechatTypeofs`, so those entities fall back to a
  // typeof-derived reading. Reports that carry `wechatValues` are authoritative:
  // an entity missing from that map was never probed and must stay unobserved
  // instead of being recorded as "does not exist".
  const hasPerEntityValues =
    report.wechatValues !== undefined &&
    report.wechatValues !== null &&
    typeof report.wechatValues === "object";
  for (const [entityId, dimensions] of normalizeEntityDimensions(
    entityDimensions,
  )) {
    const type = report.wechatTypeofs[entityId] ?? "undefined";
    const probedValues = report.wechatValues?.[entityId];
    const values = {};
    const observedDimensions = [];

    if (dropAbsence && probedValues?.existence === false) {
      continue;
    }

    if (probedValues) {
      for (const dimension of dimensions) {
        if (
          SAFE_DIMENSIONS.has(dimension) &&
          Object.hasOwn(probedValues, dimension) &&
          probedValues[dimension] !== undefined
        ) {
          values[dimension] = probedValues[dimension];
          observedDimensions.push(dimension);
        }
      }
    } else if (!hasPerEntityValues) {
      // 老报告只带 wechatTypeofs，`type === "undefined"` 就是「不存在」；
      // 跨项目场景下它同样不可外推，必须一起丢掉。
      if (dropAbsence && type === "undefined") {
        continue;
      }
      for (const dimension of dimensions) {
        if (!SAFE_DIMENSIONS.has(dimension)) {
          continue;
        }
        if (dimension === SEMANTIC_DIMENSION.EXISTENCE) {
          values[dimension] = type !== "undefined";
        } else if (dimension === SEMANTIC_DIMENSION.TYPE) {
          values[dimension] = type;
        } else if (dimension === SEMANTIC_DIMENSION.CALLABILITY) {
          values[dimension] = type === "function";
        }
        observedDimensions.push(dimension);
      }
    } else {
      continue;
    }

    if (observedDimensions.length === 0) {
      continue;
    }

    observations[entityId] = createRuntimeObservation({
      runtimeProfileId: runtimeProfile.runtimeId,
      observedDimensions,
      values,
      sideEffects: [],
      observedAt,
      probeHash: probeHash({
        runtimeId: runtimeProfile.runtimeId,
        entityId,
        observedDimensions,
      }),
    });
  }

  return Object.freeze({
    runtimeId: runtimeProfile.runtimeId,
    provenance: EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
    scopeKind,
    droppedAbsenceCount: dropAbsence
      ? Object.values(report.wechatValues ?? {}).filter(
          (value) => value?.existence === false,
        ).length
      : 0,
    observations: Object.freeze(observations),
  });
};

const normalizeEntityDimensions = (input) => {
  if (input instanceof Map) {
    return input.entries();
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("entityDimensions must be a Map or object");
  }
  return Object.entries(input);
};

const probeHash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
