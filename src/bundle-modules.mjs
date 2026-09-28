/**
 * 微信 app-service.js 的 bundle 模块表解析。
 *
 * 背景：R97 语料里每个小程序项目只有一个 app-service.js，它是 wcc 编译后的
 * bundle，用微信自己的 AMD 风格模块系统：
 *
 *   define("pages/index/index.js", function (require, module, exports, ...) { ... })
 *   require("pages/index/index.js")
 *
 * 全量实测（`tools/analyze-bundle-modules.mjs`，1570 个项目）：259,068 个
 * require 调用点里 254,663 个（98.30%）能在同文件的 define 表里找到目标。
 * 也就是说跨模块信息**已经在同一个文件里**，缺的是把模块表显式化。
 *
 * 这个模块只做三件事，不引入任何新的分析器：
 *   1. 扫描 AST，建立 模块路径 → define factory 的映射；
 *   2. 把 require 的相对路径按「请求方模块」解析成规范路径（带 .js 归一化）；
 *   3. 从 factory 体内提取静态可识别的导出符号（exports.x / module.exports）。
 *
 * 它不判断导出值的语义，也不做跨模块数据流——那是接入 analyzer 之后的下一步。
 */
import path from "node:path";

/** `define("path", factory)` / `define("path", [deps], factory)` */
const isDefineCall = (node) =>
  node?.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  node.callee.name === "define" &&
  node.arguments?.length >= 2 &&
  node.arguments[0]?.type === "Literal" &&
  typeof node.arguments[0].value === "string";

/** `require("path")`：只认单字符串字面量参数。 */
export const isRequireCall = (node) =>
  node?.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  node.callee.name === "require" &&
  node.arguments?.length === 1 &&
  node.arguments[0]?.type === "Literal" &&
  typeof node.arguments[0].value === "string";

/** 模块路径归一化：去掉 `.js` 后缀，供查表使用。 */
export const normalizeModulePath = (value) =>
  String(value).replace(/\.js$/u, "");

/**
 * 把 require 的请求路径解析成模块表里的规范路径。
 *
 * 相对路径（以 `.` 开头）相对于**请求方模块**的目录解析：
 *   owner = "pages/index/index.js"，request = "../../common/vendor.js"
 *   → "common/vendor"
 *
 * 非相对路径（`common/vendor.js`、`wx-server-sdk`）按原样归一化。前者是
 * 微信 bundle 里常见的写法，后者是真正的外部依赖。
 */
export const resolveBundleRequest = (request, ownerModulePath) => {
  if (!request.startsWith(".")) {
    return normalizeModulePath(request);
  }
  const baseDir = ownerModulePath
    ? path.posix.dirname(normalizeModulePath(ownerModulePath))
    : "";
  return normalizeModulePath(
    path.posix.normalize(path.posix.join(baseDir, request)),
  );
};

const staticPropertyName = (node) => {
  if (!node.computed && node.property?.type === "Identifier") {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property?.type === "Literal" &&
    (typeof node.property.value === "string" ||
      typeof node.property.value === "number")
  ) {
    return String(node.property.value);
  }
  return null;
};

/**
 * 判断一个表达式是不是 `exports` / `module.exports` 的写入目标。
 *
 * 返回 `{ kind: "default" }`、`{ kind: "named", name }` 或 null。
 */
const classifyExportTarget = (node) => {
  if (node?.type !== "MemberExpression") return null;
  // module.exports
  if (
    !node.computed &&
    node.object?.type === "Identifier" &&
    node.object.name === "module" &&
    node.property?.type === "Identifier" &&
    node.property.name === "exports"
  ) {
    return { kind: "default" };
  }
  // exports.foo
  if (
    node.object?.type === "Identifier" &&
    node.object.name === "exports"
  ) {
    const name = staticPropertyName(node);
    return name === null ? null : { kind: "named", name };
  }
  // module.exports.foo
  const inner = classifyExportTarget(node.object);
  if (inner?.kind === "default") {
    const name = staticPropertyName(node);
    return name === null ? null : { kind: "named", name };
  }
  return null;
};

const walk = (node, visitor) => {
  if (!node || typeof node.type !== "string") return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor);
    } else if (value && typeof value.type === "string") {
      walk(value, visitor);
    }
  }
};

/**
 * 从 AST 建立模块表。
 *
 * 返回 Map<规范路径, { modulePath, normalizedPath, factoryNode, defineNode }>。
 * 同一路径出现多次时保留第一次，并累计 duplicateCount。
 */
export const buildBundleModuleTable = (ast) => {
  const modules = new Map();
  let duplicateCount = 0;
  walk(ast, (node) => {
    if (!isDefineCall(node)) return;
    const modulePath = node.arguments[0].value;
    const normalizedPath = normalizeModulePath(modulePath);
    if (modules.has(normalizedPath)) {
      duplicateCount += 1;
      return;
    }
    const factoryNode =
      node.arguments.find(
        (argument) =>
          argument?.type === "FunctionExpression" ||
          argument?.type === "ArrowFunctionExpression",
      ) ?? null;
    modules.set(normalizedPath, {
      modulePath,
      normalizedPath,
      factoryNode,
      defineNode: node,
    });
  });
  return { modules, duplicateCount };
};

/**
 * 提取一个模块 factory 的静态导出。
 *
 * 只识别四种写法（覆盖微信 bundle 的绝大多数情况）：
 *   exports.foo = <expr>
 *   exports["foo"] = <expr>
 *   module.exports.foo = <expr>
 *   module.exports = <expr>
 *
 * 动态写入（`exports[key] = ...`）会让 `dynamic` 置位，调用方应据此保持保守。
 */
export const extractModuleExports = (factoryNode) => {
  const named = new Map();
  let defaultExport = null;
  let dynamic = false;
  if (!factoryNode?.body) {
    return { named, defaultExport, dynamic };
  }
  walk(factoryNode.body, (node) => {
    if (node.type !== "AssignmentExpression") return;
    const target = classifyExportTarget(node.left);
    if (!target) {
      // exports[expr] = ... 这类无法静态识别，标记为动态但不算错误。
      if (
        node.left?.type === "MemberExpression" &&
        node.left.object?.type === "Identifier" &&
        node.left.object.name === "exports" &&
        node.left.computed &&
        staticPropertyName(node.left) === null
      ) {
        dynamic = true;
      }
      return;
    }
    if (target.kind === "default") {
      defaultExport = node.right;
    } else {
      named.set(target.name, node.right);
    }
  });
  return { named, defaultExport, dynamic };
};

/**
 * 给一条 finding 找它所属的模块：返回包含它的最小 define factory 的模块路径。
 *
 * `node` 是 finding 的 AST 节点，`moduleTable` 来自 buildBundleModuleTable。
 * 用节点 range 判断包含关系；没有 range 时返回 null（调用方保持保守）。
 */
export const findOwningModule = (node, moduleTable) => {
  const start = node?.range?.[0];
  if (typeof start !== "number") return null;
  let owner = null;
  for (const entry of moduleTable.modules.values()) {
    const factory = entry.factoryNode;
    if (!factory?.range) continue;
    const [factoryStart, factoryEnd] = factory.range;
    if (start < factoryStart || start >= factoryEnd) continue;
    if (!owner || factoryStart > owner.factoryNode.range[0]) {
      owner = entry;
    }
  }
  return owner?.normalizedPath ?? null;
};
