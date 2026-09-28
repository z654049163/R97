import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import {
  EVIDENCE_PROVENANCE,
  SEMANTIC_DIMENSION,
} from "../constants.mjs";
import { createRuntimeObservation } from "../model.mjs";
import {
  isNodeBuiltinRoot,
  nodeBuiltinRequestFromRoot,
} from "../module-runtime.mjs";
import { NODE_PROFILE } from "../runtime-profiles.mjs";
import {
  COMMONJS_MODULE_BINDING_NAMES,
  createCommonJsModuleBindings,
} from "./node-module-bindings.mjs";

const nodeRequire = createRequire(import.meta.url);
const commonJsModuleBindings = createCommonJsModuleBindings();
const commonJsBindingNames = new Set(COMMONJS_MODULE_BINDING_NAMES);

const SAFE_DIMENSIONS = new Set([
  SEMANTIC_DIMENSION.EXISTENCE,
  SEMANTIC_DIMENSION.TYPE,
  SEMANTIC_DIMENSION.CALLABILITY,
]);

const SAFE_GLOBAL_ACCESSORS = new Set([
  "Buffer",
  "crypto",
  "document",
  "fetch",
  "localStorage",
  "navigator",
  "performance",
  "process",
  "sessionStorage",
  "window",
]);

export const collectNodeObservations = ({
  entityDimensions,
  runtimeProfile = NODE_PROFILE,
  allowedRoots = null,
  disallowedRootsAreAbsent = false,
  rootOverrides = null,
  observedAt = new Date().toISOString(),
}) => {
  const observations = {};
  const allowedRootSet = normalizeAllowedRoots(allowedRoots);

  for (const [entityId, dimensions] of normalizeEntityDimensions(
    entityDimensions,
  )) {
    const root = entityId.split(".")[0];
    const isDisallowedRoot = allowedRootSet && !allowedRootSet.has(root);
    if (isDisallowedRoot && !disallowedRootsAreAbsent) {
      continue;
    }

    const requestedDimensions = dimensions.filter((dimension) =>
      SAFE_DIMENSIONS.has(dimension),
    );
    if (requestedDimensions.length === 0) {
      continue;
    }

    const result = isDisallowedRoot
      ? {
          exists: false,
          type: "undefined",
          callable: false,
        }
      : observeEntityPath(entityId, rootOverrides);
    const values = {};
    const observedDimensions = [];

    if (requestedDimensions.includes(SEMANTIC_DIMENSION.EXISTENCE)) {
      values[SEMANTIC_DIMENSION.EXISTENCE] = result.exists;
      observedDimensions.push(SEMANTIC_DIMENSION.EXISTENCE);
    }
    if (
      requestedDimensions.includes(SEMANTIC_DIMENSION.TYPE) &&
      result.type !== null
    ) {
      values[SEMANTIC_DIMENSION.TYPE] = result.type;
      observedDimensions.push(SEMANTIC_DIMENSION.TYPE);
    }
    if (
      requestedDimensions.includes(SEMANTIC_DIMENSION.CALLABILITY) &&
      result.callable !== null
    ) {
      values[SEMANTIC_DIMENSION.CALLABILITY] = result.callable;
      observedDimensions.push(SEMANTIC_DIMENSION.CALLABILITY);
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
    observations: Object.freeze(observations),
  });
};

/**
 * `rootOverrides` 把指定根节点解析到别的对象上。
 *
 * 语言基线需要它：`globalThis` 本身是 ECMAScript 内建，但**它的内容取决于宿主**。
 * 引擎此前在 Node realm 里展开 `globalThis`，于是 `globalThis.console` 这类路径
 * 被当成语言内建观测成「存在」，与真实裸引擎不一致——实测因此放行了 2 条
 * `globalThis.console` 折叠。语言探针现在把 `globalThis` 指到隔离 vm 的全局对象。
 */
export const observeEntityPath = (entityId, rootOverrides = null) => {
  const parts = entityId.split(".");
  const root = parts.shift();
  const rootValue = getRootValue(root, rootOverrides);

  if (rootValue.status === "missing") {
    return {
      exists: false,
      type: "undefined",
      callable: false,
    };
  }
  if (rootValue.status === "accessor") {
    return {
      exists: true,
      type: null,
      callable: null,
    };
  }

  let value = rootValue.value;
  for (const property of parts) {
    const propertyResult = getPropertyWithoutInvokingGetter(value, property);
    if (propertyResult.status === "missing") {
      return {
        exists: false,
        type: "undefined",
        callable: false,
      };
    }
    if (propertyResult.status === "accessor") {
      return {
        exists: true,
        type: null,
        callable: null,
      };
    }
    value = propertyResult.value;
  }

  const type = typeof value;
  return {
    exists: true,
    type,
    callable: type === "function",
  };
};

const getRootValue = (name, rootOverrides = null) => {
  if (rootOverrides && Object.hasOwn(rootOverrides, name)) {
    return {
      status: "value",
      value: rootOverrides[name],
    };
  }
  if (isNodeBuiltinRoot(name)) {
    try {
      return {
        status: "value",
        value: nodeRequire(nodeBuiltinRequestFromRoot(name)),
      };
    } catch (error) {
      return {
        status: "accessor",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (name === "global" || name === "globalThis") {
    return {
      status: "value",
      value: globalThis,
    };
  }
  // CommonJS 模块作用域绑定不是 globalThis 属性，必须按模块上下文解析，
  // 否则观测结果会随启动方式（CJS / ESM）变化，见 node-module-bindings.mjs。
  if (commonJsBindingNames.has(name)) {
    return {
      status: "value",
      value: commonJsModuleBindings[name],
    };
  }
  const result = getPropertyWithoutInvokingGetter(globalThis, name);
  if (result.status === "accessor" && SAFE_GLOBAL_ACCESSORS.has(name)) {
    try {
      return {
        status: "value",
        value: globalThis[name],
      };
    } catch (error) {
      return {
        status: "accessor",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return result;
};

const getPropertyWithoutInvokingGetter = (object, property) => {
  if (object === null || object === undefined) {
    return { status: "missing" };
  }

  let current = object;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, property);
    if (descriptor) {
      if (Object.hasOwn(descriptor, "value")) {
        return {
          status: "value",
          value: descriptor.value,
        };
      }
      return { status: "accessor" };
    }
    current = Object.getPrototypeOf(current);
  }
  return { status: "missing" };
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

const normalizeAllowedRoots = (input) => {
  if (input === null) {
    return null;
  }
  if (!Array.isArray(input)) {
    throw new TypeError("allowedRoots must be an array or null");
  }
  input.forEach((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new TypeError(`allowedRoots[${index}] must be a non-empty string`);
    }
  });
  return new Set(input);
};

const probeHash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
