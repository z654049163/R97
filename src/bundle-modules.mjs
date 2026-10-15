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
import { HOST_GLOBAL_ROOTS, LANGUAGE_BUILTIN_ROOTS } from "./global-roots.mjs";

const LANGUAGE_BUILTIN_SET = new Set(LANGUAGE_BUILTIN_ROOTS);
const HOST_GLOBAL_SET = new Set(HOST_GLOBAL_ROOTS);

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

/**
 * 解包 Babel / TypeScript 助手函数（如 _interopRequireDefault(require(...))），
 * 提取内部核心 require 调用节点。
 * 遵循 CASCADE (ICSE 2026) 前置助手透明解包规范。
 */
export const unwrapInteropRequire = (node) => {
  if (!node || node.type !== "CallExpression") return node;
  if (isRequireCall(node)) return node;
  if (
    node.arguments?.length === 1 &&
    node.callee?.type === "Identifier" &&
    (node.callee.name.startsWith("_interopRequireDefault") ||
      node.callee.name.startsWith("_interopRequireWildcard") ||
      node.callee.name === "_interopRequire" ||
      node.callee.name === "_toPropertyKey" ||
      node.callee.name === "__toESM")
  ) {
    return unwrapInteropRequire(node.arguments[0]);
  }
  return node;
};

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

const walkWithParent = (node, visitor, parent = null, parentKey = null) => {
  if (!node || typeof node.type !== "string") return;
  visitor(node, parent, parentKey);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walkWithParent(child, visitor, node, key);
    } else if (value && typeof value.type === "string") {
      walkWithParent(value, visitor, node, key);
    }
  }
};

/**
 * 模块闭包静态依赖摘要（Module-Closure Static Dependency Summarization）。
 *
 * 理论依据：OBsmith (OOPSLA 2026) Host Dependence Orthogonality 公理。
 * 若模块工厂函数内部引用的外部自由标识符 100% 属于纯语言内建（零宿主、零未解析全局），
 * 则该闭包为 Host-Orthogonal，导出必然为标准 ECMAScript 语义，可安全 FOLD。
 */
export const summarizeModuleClosure = (factoryNode) => {
  if (!factoryNode?.body) {
    return { isHostOrthogonal: false, hasHostGlobal: false, hostRoots: [] };
  }
  const declaredLocals = new Set();
  for (const p of factoryNode.params ?? []) {
    if (p?.type === "Identifier") declaredLocals.add(p.name);
  }

  walk(factoryNode.body, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      declaredLocals.add(node.id.name);
    } else if (node.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
      declaredLocals.add(node.id.name);
    } else if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      for (const p of node.params ?? []) {
        if (p?.type === "Identifier") declaredLocals.add(p.name);
      }
    } else if (node.type === "CatchClause" && node.param?.type === "Identifier") {
      declaredLocals.add(node.param.name);
    }
  });

  const freeIdentifiers = new Set();
  walkWithParent(factoryNode.body, (node, parent) => {
    if (node.type === "Identifier") {
      if (
        (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
        (parent?.type === "Property" && parent.key === node && !parent.computed) ||
        (parent?.type === "VariableDeclarator" && parent.id === node) ||
        (parent?.type === "FunctionDeclaration" && parent.id === node)
      ) {
        return;
      }
      if (!declaredLocals.has(node.name)) {
        freeIdentifiers.add(node.name);
      }
    }
  });

  let hasHostGlobal = false;
  const hostRoots = new Set();
  let hasUnknownGlobal = false;

  for (const ident of freeIdentifiers) {
    if (LANGUAGE_BUILTIN_SET.has(ident)) {
      continue;
    }
    if (
      HOST_GLOBAL_SET.has(ident) ||
      ident === "$gwx" ||
      ident === "wh" ||
      ident.startsWith("$gw")
    ) {
      hasHostGlobal = true;
      hostRoots.add(ident);
    } else {
      hasUnknownGlobal = true;
    }
  }

  return {
    isHostOrthogonal: !hasHostGlobal && !hasUnknownGlobal,
    hasHostGlobal,
    hostRoots: [...hostRoots],
  };
};

/**
 * 从 AST 建立模块表。
 *
 * 返回 Map<规范路径, { modulePath, normalizedPath, factoryNode, defineNode, closureSummary }>。
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
      closureSummary: factoryNode ? summarizeModuleClosure(factoryNode) : null,
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
/**
 * 提取一个模块 factory 的静态导出。
 *
 * 识别标准 CommonJS 以及 Webpack / Babel 现代打包器合成导出：
 *   1. exports.foo = <expr> / exports["foo"] = <expr>
 *   2. module.exports.foo = <expr>
 *   3. module.exports = <expr>
 *   4. __webpack_require__.d(exports, "foo", function() { return <expr>; })
 *   5. Object.defineProperty(exports, "foo", { get: function() { return <expr>; }, value: <expr> })
 *
 * 动态写入（`exports[key] = ...`）会让 `dynamic` 置位，调用方据此保持保守。
 */
export const extractModuleExports = (factoryNode) => {
  const named = new Map();
  let defaultExport = null;
  let dynamic = false;
  if (!factoryNode?.body) {
    return { named, defaultExport, dynamic };
  }

  // 辅助函数：从 getter 函数或箭头函数体内提取 return 的表达式
  const extractReturnValue = (fnNode) => {
    if (!fnNode) return null;
    if (fnNode.type === "ArrowFunctionExpression" && fnNode.body.type !== "BlockStatement") {
      return fnNode.body;
    }
    const body = fnNode.body?.type === "BlockStatement" ? fnNode.body.body : null;
    if (!Array.isArray(body)) return null;
    for (const stmt of body) {
      if (stmt.type === "ReturnStatement" && stmt.argument) {
        return stmt.argument;
      }
    }
    return null;
  };

  walk(factoryNode.body, (node) => {
    // 1. 处理 Webpack ES6 导出合成桩: __webpack_require__.d(exports, "name", getter)
    // 或 r.d(e, "name", getter) / e.d(...)
    if (
      node.type === "CallExpression" &&
      node.arguments?.length >= 3 &&
      node.callee?.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property?.type === "Identifier" &&
      node.callee.property.name === "d"
    ) {
      const targetArg = node.arguments[0];
      const nameArg = node.arguments[1];
      const getterArg = node.arguments[2];

      const isExportsTarget =
        targetArg?.type === "Identifier" &&
        (targetArg.name === "exports" || targetArg.name === "e");
      const exportName =
        nameArg?.type === "Literal" && typeof nameArg.value === "string"
          ? nameArg.value
          : null;

      if (isExportsTarget && exportName) {
        const valueExpr = extractReturnValue(getterArg) ?? getterArg;
        if (exportName === "default") {
          defaultExport = valueExpr;
        } else {
          named.set(exportName, valueExpr);
        }
        return;
      }
    }

    // 2. 处理 Object.defineProperty(exports, "name", { get: ..., value: ... })
    if (
      node.type === "CallExpression" &&
      node.arguments?.length >= 3 &&
      node.callee?.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.object?.type === "Identifier" &&
      node.callee.object.name === "Object" &&
      node.callee.property?.type === "Identifier" &&
      node.callee.property.name === "defineProperty"
    ) {
      const targetArg = node.arguments[0];
      const nameArg = node.arguments[1];
      const descriptorArg = node.arguments[2];

      const isExportsTarget =
        (targetArg?.type === "Identifier" && (targetArg.name === "exports" || targetArg.name === "e")) ||
        (targetArg?.type === "MemberExpression" &&
          targetArg.object?.type === "Identifier" &&
          targetArg.object.name === "module" &&
          targetArg.property?.type === "Identifier" &&
          targetArg.property.name === "exports");

      const exportName =
        nameArg?.type === "Literal" && typeof nameArg.value === "string"
          ? nameArg.value
          : nameArg?.type === "Identifier"
          ? nameArg.name
          : null;

      if (isExportsTarget && exportName && descriptorArg?.type === "ObjectExpression") {
        for (const prop of descriptorArg.properties) {
          if (prop.type !== "Property" || prop.computed) continue;
          const propName = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
          if (propName === "get") {
            const val = extractReturnValue(prop.value) ?? prop.value;
            if (exportName === "default") defaultExport = val;
            else named.set(exportName, val);
          } else if (propName === "value") {
            if (exportName === "default") defaultExport = prop.value;
            else named.set(exportName, prop.value);
          }
        }
        return;
      }
    }

    // 3. 处理常规赋值导出: AssignmentExpression
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

  // 局部 var 单赋值解绑（Unbind local single-assignment chains）
  // UglifyJS/Terser/Babel 压缩产物中常出现:
  //   var n, r; n = function() { ... }; exports.foo = n;
  // 或:
  //   var _toPropertyKey = require("./toPropertyKey"); exports.default = _toPropertyKey;
  // 若 exports.x 导出的右值是局部变量 a，且 a 在 factory 顶层仅被单次赋值为 targetExpr，
  // 则安全穿透将导出右值还原为 targetExpr。
  const localBindingValues = new Map();
  const localAssignCounts = new Map();

  if (factoryNode.body?.type === "BlockStatement" && Array.isArray(factoryNode.body.body)) {
    for (const stmt of factoryNode.body.body) {
      if (stmt.type === "VariableDeclaration") {
        for (const decl of stmt.declarations) {
          if (decl.id?.type === "Identifier" && decl.init) {
            localBindingValues.set(decl.id.name, decl.init);
            localAssignCounts.set(decl.id.name, 1);
          }
        }
      } else if (stmt.type === "FunctionDeclaration" && stmt.id?.type === "Identifier") {
        localBindingValues.set(stmt.id.name, stmt);
        localAssignCounts.set(stmt.id.name, 1);
      } else if (stmt.type === "ExpressionStatement") {
        const expr = stmt.expression;
        if (expr?.type === "AssignmentExpression" && expr.left?.type === "Identifier") {
          const varName = expr.left.name;
          const count = (localAssignCounts.get(varName) ?? 0) + 1;
          localAssignCounts.set(varName, count);
          if (count === 1) {
            localBindingValues.set(varName, expr.right);
          } else {
            localBindingValues.delete(varName);
          }
        }
      }
    }
  }

  const unbindValue = (val) => {
    if (!val || val.type !== "Identifier") return val;
    if (localAssignCounts.get(val.name) === 1 && localBindingValues.has(val.name)) {
      const bound = localBindingValues.get(val.name);
      if (bound && bound !== val) {
        return unbindValue(bound);
      }
    }
    return val;
  };

  if (defaultExport?.type === "Identifier") {
    defaultExport = unbindValue(defaultExport);
  }
  for (const [k, v] of named.entries()) {
    if (v?.type === "Identifier") {
      named.set(k, unbindValue(v));
    }
  }

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
