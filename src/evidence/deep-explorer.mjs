/**
 * 深度原型链与长链命名空间非破坏性反射工具 (Deep Prototype & Namespace Explorer)。
 *
 * 核心守则（实测踩坑与安全公理）：
 * 1. 绝对不执行任何 getter 访问器（只用 Object.getOwnPropertyDescriptor 读 static value）；
 * 2. 绝对不触发函数调用，只反射函数的 type 与 callability；
 * 3. 严格限制最大深度与原型链回环检测，防止内存暴涨。
 */

const DEFAULT_MAX_DEPTH = 3;
const MAX_PROPERTIES_PER_LEVEL = 100;

// 排除会引起副作用、环境崩溃或无限回环的属性名称
const BLACKLISTED_PROPERTIES = new Set([
  "caller",
  "callee",
  "arguments",
  "prototype",
  "__proto__",
  "constructor",
]);

/**
 * 深度遍历对象的命名空间属性路径。
 */
export function exploreDeepEntityPaths(
  rootObject,
  rootPrefix,
  {
    maxDepth = DEFAULT_MAX_DEPTH,
    seenObjects = new WeakSet(),
    currentDepth = 1,
  } = {},
) {
  const results = {};
  if (
    rootObject === null ||
    rootObject === undefined ||
    (typeof rootObject !== "object" && typeof rootObject !== "function")
  ) {
    return results;
  }

  if (seenObjects.has(rootObject)) {
    return results;
  }
  seenObjects.add(rootObject);

  let propNames = [];
  try {
    propNames = Object.getOwnPropertyNames(rootObject);
  } catch {
    return results;
  }

  let count = 0;
  for (const prop of propNames) {
    if (BLACKLISTED_PROPERTIES.has(prop)) continue;
    count += 1;
    if (count > MAX_PROPERTIES_PER_LEVEL) break;

    const fullPath = `${rootPrefix}.${prop}`;
    let descriptor = null;
    try {
      descriptor = Object.getOwnPropertyDescriptor(rootObject, prop);
    } catch {
      continue;
    }

    if (!descriptor) continue;

    // 遇到 getter / setter：严格按 accessor 处理，不执行 getter！
    if (descriptor.get || descriptor.set || !Object.hasOwn(descriptor, "value")) {
      results[fullPath] = {
        existence: true,
        type: null,
        callability: null,
        isAccessor: true,
      };
      continue;
    }

    const val = descriptor.value;
    const valType = typeof val;
    const isCallable = valType === "function";

    results[fullPath] = {
      existence: true,
      type: valType,
      callability: isCallable,
      isAccessor: false,
    };

    // 如果是子对象且未达到最大深度，递归深入
    if (
      currentDepth < maxDepth &&
      val !== null &&
      (valType === "object" || valType === "function")
    ) {
      const childResults = exploreDeepEntityPaths(val, fullPath, {
        maxDepth,
        seenObjects,
        currentDepth: currentDepth + 1,
      });
      Object.assign(results, childResults);
    }
  }

  return results;
}

/**
 * 安全反射实例原型（Prototype）上的方法与属性。
 */
export function reflectPrototypeProperties(protoObject, prefix) {
  const results = {};
  if (!protoObject || typeof protoObject !== "object") {
    return results;
  }

  let propNames = [];
  try {
    propNames = Object.getOwnPropertyNames(protoObject);
  } catch {
    return results;
  }

  for (const prop of propNames) {
    if (BLACKLISTED_PROPERTIES.has(prop)) continue;

    const fullPath = `${prefix}.${prop}`;
    let descriptor = null;
    try {
      descriptor = Object.getOwnPropertyDescriptor(protoObject, prop);
    } catch {
      continue;
    }

    if (!descriptor) continue;

    if (descriptor.get || descriptor.set || !Object.hasOwn(descriptor, "value")) {
      results[fullPath] = {
        existence: true,
        type: null,
        callability: null,
        isAccessor: true,
      };
      continue;
    }

    const val = descriptor.value;
    const valType = typeof val;
    results[fullPath] = {
      existence: true,
      type: valType,
      callability: valType === "function",
      isAccessor: false,
    };
  }

  return results;
}

/**
 * 汇总根节点深度扫描与原型反射。
 */
export function buildHarvestedEntityMap({
  roots = {},
  prototypes = {},
  maxDepth = DEFAULT_MAX_DEPTH,
} = {}) {
  const harvested = {};

  for (const [rootName, rootVal] of Object.entries(roots)) {
    harvested[rootName] = {
      existence: rootVal !== undefined,
      type: typeof rootVal,
      callability: typeof rootVal === "function",
      isAccessor: false,
    };
    const deepPaths = exploreDeepEntityPaths(rootVal, rootName, { maxDepth });
    Object.assign(harvested, deepPaths);
  }

  for (const [protoPrefix, protoVal] of Object.entries(prototypes)) {
    const protoProps = reflectPrototypeProperties(protoVal, protoPrefix);
    Object.assign(harvested, protoProps);
  }

  return harvested;
}
