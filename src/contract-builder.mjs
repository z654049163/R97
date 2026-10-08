import { createHash } from "node:crypto";

import {
  BINDING_KIND,
  REQUIRED_RUNTIME_STATUS,
  SEMANTIC_DIMENSION,
  TRANSFORMATION_KIND,
} from "./constants.mjs";
import { createSemanticContract } from "./model.mjs";
import { LANGUAGE_BUILTIN_ROOTS } from "./global-roots.mjs";
import { NODE_BUILTIN_ROOTS } from "./module-runtime.mjs";
import { RUNTIME_IDS } from "./runtime-profiles.mjs";

const LANGUAGE_BUILTIN_SET = new Set(LANGUAGE_BUILTIN_ROOTS);

/**
 * 宿主归属表：根节点 → 必须参与比较的运行时。
 *
 * 只放**宿主专属**的全局。跨宿主全局（`fetch`、`Blob`、`crypto`、`global` 等
 * 在 Node 与浏览器都存在）不绑定到单一宿主，否则会把无关宿主强行拉进目标集。
 * 判定依据是平台规范加实测存在性，见 `eval:host-attribution`。
 */
export const HOST_RUNTIME_ROOTS = Object.freeze([
  {
    runtimeId: RUNTIME_IDS.WECHAT,
    roots: new Set([
      "App",
      "Behavior",
      "Component",
      "Page",
      "getApp",
      "getCurrentPages",
      "wx",
    ]),
  },
  {
    runtimeId: RUNTIME_IDS.NODE,
    roots: new Set([
      "Buffer",
      "__dirname",
      "__filename",
      "exports",
      "module",
      "process",
      "require",
      // Node 的全局函数，不属于任何内置模块，浏览器与微信都没有。
      "clearImmediate",
      "setImmediate",
      ...NODE_BUILTIN_ROOTS,
    ]),
  },
  {
    runtimeId: RUNTIME_IDS.EDGE,
    roots: new Set([
      "XMLHttpRequest",
      "document",
      "localStorage",
      "location",
      "MutationObserver",
      "navigator",
      "sessionStorage",
      "window",
    ]),
  },
]);

export const inferRequiredRuntimeIds = (runtimeEntity) => {
  const root = runtimeEntity.normalizedPath.split(".")[0];
  return HOST_RUNTIME_ROOTS.filter((entry) => entry.roots.has(root)).map(
    (entry) => entry.runtimeId,
  );
};

export const buildSemanticContract = ({
  finding,
  contractVersion = "v1",
}) => {
  if (!finding || typeof finding !== "object") {
    throw new TypeError("finding must be an object");
  }
  if (typeof contractVersion !== "string" || contractVersion.trim() === "") {
    throw new TypeError("contractVersion must be a non-empty string");
  }
  // 用 Set 去重：`requiredDimensionsFor` 在 `returnValueUsage` 为真时已经会加
  // `return_value`，下面的非确定性规则再 add 一次就会重复，而契约模型层对此
  // 有断言（`requiredDimensions must not contain duplicates`）。用数组 push
  // 时这个组合会直接抛错——它确实漏过了一轮测试，只有跑
  // `eval:constant-propagation` 才触发。
  const dimensions = new Set(requiredDimensionsFor(finding));
  // 非确定性的语言内建：调用结果依赖调用时刻或随机源，折叠必然改变语义。
  //
  // 这不是"见过的 API 名单"，而是规范直接规定的语义：`Date()` 取当前时间、
  // `Date.now()` 取当前毫秒、`Math.random()` 取随机数。它们的返回值在求值基线
  // 与目标环境之间不可比较——不是因为环境不同，而是因为**同一个环境里调用两次
  // 也不相等**。语料规模的 Level 2 变换执行（`transformation-execution-subset`）
  // 抓到 `Date` / `Date.now` 确实被放行（500 个放行点里 2 个），因此在这里要求
  // `return_value` 维度：现有探针不产出该维度，判定于是停在 UNKNOWN。
  if (isNonDeterministicCall(finding)) {
    dimensions.add(SEMANTIC_DIMENSION.RETURN_VALUE);
  }
  const requiredRuntimeIds = inferRequiredRuntimeIds(
    finding.runtimeEntity,
  );
  const requiredRuntimeStatus = requiredRuntimeIds.length === 0
    ? null
    : [BINDING_KIND.RUNTIME_GLOBAL, BINDING_KIND.MODULE_IMPORT].includes(
        finding.bindingRef.bindingKind,
      )
      ? REQUIRED_RUNTIME_STATUS.DEFINITE
      : REQUIRED_RUNTIME_STATUS.POSSIBLE;
  const identity = [
    contractVersion,
    finding.transformationKind,
    finding.usageContext.usageContextId,
    [...dimensions].join(","),
    requiredRuntimeIds.join(","),
  ].join("|");
  const contractId = `contract:${sha256(identity).slice(0, 20)}`;

  return createSemanticContract({
    contractId,
    transformationKind: finding.transformationKind,
    usageContextId: finding.usageContext.usageContextId,
    requiredDimensions: [...dimensions],
    observationProjection: [...dimensions],
    comparisonPredicate: "strict_equal",
    validityScope: {
      contractVersion,
      capabilityDomain: finding.runtimeEntity.capabilityDomain,
      runtimeBindingKind: finding.runtimeEntity.runtimeBindingKind,
      requiredRuntimeIds,
      requiredRuntimeStatus,
      requiredRuntimeEvidence: {
        bindingKind: finding.bindingRef.bindingKind,
        resolutionStatus: finding.bindingRef.resolutionStatus,
        aliasChain: [...finding.bindingRef.aliasChain],
      },
    },
  });
};

/**
 * 规范直接规定的非确定性语言内建成员。
 *
 * 只列 ECMAScript 核心内建里结果必然随时间或随机源变化的成员：Date.now 与 Math.random。
 * 宿主特有 API（如 performance.now、crypto.randomUUID）属于运行时能力，保持正交，
 * 不在此处硬编码侵入，而是由宿主环境探针体系负责，确保纯语言内建与宿主能力的清晰边界。
 */
export const NON_DETERMINISTIC_LANGUAGE_MEMBERS = Object.freeze(new Set([
  "Date.now",
  "Math.random",
]));

export const isNonDeterministicCall = (finding) => {
  if (finding.transformationKind !== TRANSFORMATION_KIND.CALL_EVAL) {
    return false;
  }
  const entityId = finding.runtimeEntity.entityId;
  // `Date()` 无参调用取当前时间；`Date` 作为命名空间本身是确定的，
  // 所以只对调用点判定。
  return (
    NON_DETERMINISTIC_LANGUAGE_MEMBERS.has(entityId) || entityId === "Date"
  );
};

const requiredDimensionsFor = (finding) => {
  const dimensions = new Set();

  switch (finding.transformationKind) {
    case TRANSFORMATION_KIND.CONST_EVAL:
      dimensions.add(SEMANTIC_DIMENSION.EXISTENCE);
      dimensions.add(SEMANTIC_DIMENSION.TYPE);
      break;
    case TRANSFORMATION_KIND.CALL_EVAL:
      dimensions.add(SEMANTIC_DIMENSION.EXISTENCE);
      dimensions.add(SEMANTIC_DIMENSION.TYPE);
      dimensions.add(SEMANTIC_DIMENSION.CALLABILITY);
      break;
    case TRANSFORMATION_KIND.BRANCH_PRUNE:
      dimensions.add(SEMANTIC_DIMENSION.EXISTENCE);
      dimensions.add(SEMANTIC_DIMENSION.TYPE);
      break;
    case TRANSFORMATION_KIND.DEAD_CODE_DELETE:
      dimensions.add(SEMANTIC_DIMENSION.SIDE_EFFECT);
      break;
    default:
      throw new TypeError(
        `Unsupported transformation kind: ${finding.transformationKind}`,
      );
  }

  if (finding.usageContext.callbackPresence) {
    dimensions.add(SEMANTIC_DIMENSION.CALLBACK_BEHAVIOR);
  }
  if (finding.usageContext.awaited) {
    dimensions.add(SEMANTIC_DIMENSION.ASYNC_BEHAVIOR);
  }
  if (finding.usageContext.returnValueUsage) {
    // 纯语言实体的返回值由语言语义决定，跨宿主一致，不需要独立的 return_value
    // 观测——现有探针本来也不产出该维度，要求它只会把判定卡死在 UNKNOWN。
    //
    // 两类实体适用：
    //   1. 根是 ECMAScript 语言内建（`Error.call`、`String.prototype.charCodeAt.call`）
    //   2. 已证明无宿主依赖的 bundle 内导出（`bundle-export:` / `bundle-default:`）
    //
    // 宿主导出的实体（`cloud.database`、`wx.request`）**不适用**：它们的返回值
    // 取决于宿主行为，必须继续要求观测。
    const root = finding.runtimeEntity.normalizedPath.split(".")[0];
    const origin = finding.bindingRef.bindingOrigin ?? "";
    const isPureLanguageEntity =
      LANGUAGE_BUILTIN_SET.has(root) ||
      origin.startsWith("bundle-export:") ||
      origin.startsWith("bundle-default:");
    if (!isPureLanguageEntity) {
      dimensions.add(SEMANTIC_DIMENSION.RETURN_VALUE);
    }
  }
  return [...dimensions];
};

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
