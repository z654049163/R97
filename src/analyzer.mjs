import { createHash } from "node:crypto";
import { parse as parseJavaScript } from "espree";

import {
  BINDING_KIND,
  RESOLUTION_STATUS,
  TRANSFORMATION_KIND,
} from "./constants.mjs";
import {
  createBindingRef,
  createRuntimeEntity,
  createUsageContext,
} from "./model.mjs";
import {
  HOST_GLOBAL_ROOTS,
  LANGUAGE_BUILTIN_ROOTS,
} from "./global-roots.mjs";
import { normalizeNodeBuiltinSpecifier } from "./module-runtime.mjs";
import {
  buildBundleModuleTable,
  extractModuleExports,
  findOwningModule,
  isRequireCall,
  resolveBundleRequest,
} from "./bundle-modules.mjs";

const DEFAULT_RUNTIME_GLOBALS = new Set([
  ...LANGUAGE_BUILTIN_ROOTS,
  ...HOST_GLOBAL_ROOTS,
]);

const HOST_GLOBAL_SET = new Set(HOST_GLOBAL_ROOTS);
const LANGUAGE_BUILTIN_SET = new Set(LANGUAGE_BUILTIN_ROOTS);

/**
 * 导出值溯源的最大递归深度。
 *
 * 模块导出可能套好几层：`exports.a = b`、`b` 又是另一个模块的导出。
 * 超过深度就返回"未知"，退回原来的 module_import 行为，不做猜测。
 */
const MAX_BUNDLE_EXPORT_DEPTH = 4;

const FUNCTION_NODE_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

const BLOCK_SCOPE_NODE_TYPES = new Set([
  "BlockStatement",
  "CatchClause",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "SwitchStatement",
]);

export const analyzeSource = ({
  source,
  filePath = "<inline>",
  runtimeGlobals = [],
  sourceType = "auto",
}) => {
  if (typeof source !== "string") {
    throw new TypeError("source must be a string");
  }
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new TypeError("filePath must be a non-empty string");
  }

  const ast = parseSource(source, sourceType);
  const sourceHash = sha256(source);
  // 只有出现 `define(` 的源码才值得扫模块表；普通文件直接跳过，避免无谓遍历。
  const bundleModules = source.includes("define(")
    ? buildBundleModuleTable(ast).modules
    : new Map();
  const scopes = buildScopeTree(ast, bundleModules);
  const knownGlobals = new Set([
    ...DEFAULT_RUNTIME_GLOBALS,
    ...runtimeGlobals,
  ]);
  const context = {
    filePath,
    knownGlobals,
    parentByNode: scopes.parentByNode,
    scopeByNode: scopes.scopeByNode,
    recordByNode: scopes.recordByNode,
    implicitGlobalAssignments: scopes.implicitGlobalAssignments,
    bundleModules,
    bundleExportCache: new Map(),
    consumedNodes: new Set(),
    findings: [],
  };

  collectFindings(ast, context);

  return Object.freeze({
    filePath,
    sourceHash,
    findingCount: context.findings.length,
    findings: Object.freeze(context.findings),
  });
};

export const extractRuntimeGlobalNames = (legacyRuleMap) => {
  const entries = Array.isArray(legacyRuleMap?.entries)
    ? legacyRuleMap.entries
    : [];
  return entries
    .map((entry) => entry?.symbol)
    .filter(
      (name) =>
        typeof name === "string" &&
        /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name),
    );
};

const parseSource = (source, sourceType) => {
  const options = {
    ecmaVersion: "latest",
    loc: true,
    range: true,
  };
  const candidates =
    sourceType === "auto" ? ["script", "module"] : [sourceType];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return parseJavaScript(source, {
        ...options,
        sourceType: candidate,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const getRequiredBuiltinPath = (node) => {
  if (
    node?.type !== "CallExpression" ||
    node.callee.type !== "Identifier" ||
    node.callee.name !== "require" ||
    node.arguments.length !== 1 ||
    node.arguments[0].type !== "Literal" ||
    typeof node.arguments[0].value !== "string"
  ) {
    return null;
  }
  return normalizeNodeBuiltinSpecifier(node.arguments[0].value);
};

/**
 * `const m = require("./x.js")` 的请求是否命中同文件的 bundle 模块表。
 *
 * 命中返回目标模块路径；外部依赖（`wx-server-sdk`、Node 内建）返回 null，
 * 保持原有行为。Node 内建由 getRequiredBuiltinPath 处理，优先级更高。
 */
const bundleModulePathForRequire = (initNode, bundleModules) => {
  if (bundleModules.size === 0 || !isRequireCall(initNode)) {
    return null;
  }
  const owner = findOwningModule(initNode, { modules: bundleModules });
  const target = resolveBundleRequest(initNode.arguments[0].value, owner);
  return bundleModules.has(target) ? target : null;
};

const getImportModulePath = (declaration, specifier) => {
  const basePath = normalizeNodeBuiltinSpecifier(declaration.source.value);
  if (!basePath) {
    return null;
  }
  if (specifier.type !== "ImportSpecifier") {
    return basePath;
  }
  const importedName =
    specifier.imported.type === "Identifier"
      ? specifier.imported.name
      : specifier.imported.value;
  return `${basePath}.${importedName}`;
};

class Scope {
  constructor(parent = null, kind = "block") {
    this.parent = parent;
    this.kind = kind;
    this.bindings = new Map();
    this.functionScope =
      kind === "function" || kind === "program"
        ? this
        : parent?.functionScope ?? parent;
  }

  declare({
    name,
    kind,
    node,
    aliasNode = null,
    modulePath = null,
    bundleModulePath = null,
    declarationKind = null,
  }) {
    const existing = this.bindings.get(name);
    if (existing) {
      if (!existing.aliasNode && aliasNode) {
        existing.aliasNode = aliasNode;
      }
      if (!existing.modulePath && modulePath) {
        existing.modulePath = modulePath;
      }
      if (!existing.bundleModulePath && bundleModulePath) {
        existing.bundleModulePath = bundleModulePath;
      }
      if (!existing.declarationKind && declarationKind) {
        existing.declarationKind = declarationKind;
      }
      return existing;
    }

    const binding = {
      name,
      kind,
      node,
      aliasNode,
      modulePath,
      bundleModulePath,
      declarationKind,
      mutated: false,
      scope: this,
    };
    this.bindings.set(name, binding);
    return binding;
  }

  resolve(name) {
    let current = this;
    while (current) {
      const binding = current.bindings.get(name);
      if (binding) {
        return binding;
      }
      current = current.parent;
    }
    return null;
  }
}

const buildScopeTree = (ast, bundleModules = new Map()) => {
  const parentByNode = new WeakMap();
  const scopeByNode = new WeakMap();
  const recordByNode = new WeakMap();
  const rootScope = new Scope(null, "program");
  // 未声明就赋值的名字（`wh=$gwh();` 这类编译产物写法）。
  //
  // 这不是绑定解析：解析器依然把它们当 unresolved_global，判定也依然是
  // UNKNOWN。它只回答归因问题——这个未解析的名字是宿主注入的，还是代码自己
  // 写出来的。实测见 tools/audit-implicit-globals.mjs：语料里 wh、$gwx 这一族
  // 100% 在被分析文件内被赋值，因此运行时探针对它们观测到的「存在/不存在」
  // 只反映探针有没有执行这段代码，不是环境差异。
  const implicitGlobalAssignments = new Map();

  const walk = (node, currentScope, parent = null, parentKey = null) => {
    if (!node || typeof node.type !== "string") {
      return;
    }

    parentByNode.set(node, parent);
    let activeScope = currentScope;

    if (node.type === "Program") {
      activeScope = rootScope;
    } else if (BLOCK_SCOPE_NODE_TYPES.has(node.type)) {
      activeScope = new Scope(currentScope, "block");
    }

    if (FUNCTION_NODE_TYPES.has(node.type)) {
      if (node.type === "FunctionDeclaration" && node.id) {
        currentScope.declare({
          name: node.id.name,
          kind: "local",
          node,
        });
      }
      activeScope = new Scope(currentScope, "function");
      if (node.type === "FunctionExpression" && node.id) {
        activeScope.declare({
          name: node.id.name,
          kind: "local",
          node,
        });
      }
      declarePatterns(
        node.params,
        activeScope,
        "parameter",
        node,
      );
      if (
        node.type !== "ArrowFunctionExpression" &&
        !activeScope.bindings.has("arguments")
      ) {
        activeScope.declare({
          name: "arguments",
          kind: "local",
          node,
        });
      }
    } else if (node.type === "VariableDeclaration") {
      for (const declarator of node.declarations) {
        const targetScope =
          node.kind === "var" ? currentScope.functionScope : currentScope;
        const modulePath = getRequiredBuiltinPath(declarator.init);
        const bundleModulePath = bundleModulePathForRequire(
          declarator.init,
          bundleModules,
        );
        declarePatterns(
          declarator.id,
          targetScope,
          "local",
          declarator,
          declarator.init,
          modulePath,
          node.kind,
          bundleModulePath,
        );
      }
    } else if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers) {
        const modulePath = getImportModulePath(node, specifier);
        currentScope.declare({
          name: specifier.local.name,
          kind: "module_import",
          node: specifier,
          modulePath,
        });
      }
    } else if (node.type === "ClassDeclaration" && node.id) {
      currentScope.declare({
        name: node.id.name,
        kind: "local",
        node,
      });
    } else if (node.type === "CatchClause" && node.param) {
      declarePatterns(node.param, activeScope, "local", node);
    } else if (node.type === "AssignmentExpression") {
      markAssignedBinding(node.left, currentScope);
      recordImplicitGlobalAssignment(
        node.left,
        currentScope,
        implicitGlobalAssignments,
      );
    } else if (node.type === "UpdateExpression") {
      markAssignedBinding(node.argument, currentScope);
    }

    scopeByNode.set(node, activeScope);
    recordByNode.set(node, {
      parent,
      parentKey,
    });

    for (const key of Object.keys(node)) {
      if (
        key === "parent" ||
        key === "loc" ||
        key === "range" ||
        key === "tokens" ||
        key === "comments"
      ) {
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          walk(child, activeScope, node, key);
        }
      } else if (value && typeof value.type === "string") {
        walk(value, activeScope, node, key);
      }
    }
  };

  walk(ast, rootScope);
  return {
    parentByNode,
    scopeByNode,
    recordByNode,
    implicitGlobalAssignments,
  };
};

const declarePatterns = (
  pattern,
  scope,
  kind,
  declarationNode,
  aliasNode = null,
  modulePath = null,
  declarationKind = null,
  bundleModulePath = null,
) => {
  if (!pattern) {
    return;
  }
  if (Array.isArray(pattern)) {
    pattern.forEach((item) =>
      declarePatterns(
        item,
        scope,
        kind,
        declarationNode,
        aliasNode,
        modulePath,
        declarationKind,
      ),
    );
    return;
  }
  if (pattern.type === "Identifier") {
    scope.declare({
      name: pattern.name,
      kind,
      node: declarationNode,
      aliasNode:
        declarationNode?.type === "VariableDeclarator" &&
        declarationNode.id === pattern
          ? aliasNode
          : null,
      modulePath,
      declarationKind,
      bundleModulePath,
    });
    return;
  }
  if (pattern.type === "AssignmentPattern") {
    declarePatterns(
      pattern.left,
      scope,
      kind,
      declarationNode,
      aliasNode,
      modulePath,
      declarationKind,
      bundleModulePath,
    );
    return;
  }
  if (pattern.type === "RestElement") {
    declarePatterns(
      pattern.argument,
      scope,
      kind,
      declarationNode,
      aliasNode,
      modulePath,
      declarationKind,
      bundleModulePath,
    );
    return;
  }
  if (pattern.type === "ArrayPattern") {
    pattern.elements.forEach((element) =>
      declarePatterns(
        element,
        scope,
        kind,
        declarationNode,
        null,
        null,
        declarationKind,
      ),
    );
    return;
  }
  if (pattern.type === "ObjectPattern") {
    pattern.properties.forEach((property) => {
      if (property.type === "Property") {
        const propertyName = getStaticObjectPropertyName(property);
        declarePatterns(
          property.value,
          scope,
          kind,
          declarationNode,
          null,
          modulePath && propertyName
            ? `${modulePath}.${propertyName}`
            : null,
          declarationKind,
        );
      } else if (property.type === "RestElement") {
        declarePatterns(
          property.argument,
          scope,
          kind,
          declarationNode,
          null,
          null,
          declarationKind,
        );
      }
    });
  }
};

const getStaticObjectPropertyName = (property) => {
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }
  if (
    property.computed &&
    property.key.type === "Literal" &&
    (typeof property.key.value === "string" ||
      typeof property.key.value === "number")
  ) {
    return String(property.key.value);
  }
  return null;
};

const markAssignedBinding = (target, scope) => {
  if (!target) {
    return;
  }
  if (target.type === "Identifier") {
    const binding = scope.resolve(target.name);
    if (binding) {
      binding.mutated = true;
    }
  } else if (target.type === "MemberExpression") {
    markAssignedBinding(target.object, scope);
  }
};

const recordImplicitGlobalAssignment = (target, scope, assignments) => {
  if (!target || target.type !== "Identifier") {
    return;
  }
  if (scope.resolve(target.name)) {
    return;
  }
  const existing = assignments.get(target.name);
  const inFunctionBody = scope.functionScope?.kind !== "program";
  if (!existing) {
    assignments.set(target.name, { topLevel: !inFunctionBody });
    return;
  }
  existing.topLevel = existing.topLevel || !inFunctionBody;
};

const collectFindings = (node, context) => {
  if (!node || typeof node.type !== "string") {
    return;
  }
  if (context.consumedNodes.has(node)) {
    return;
  }

  if (node.type === "IfStatement") {
    const reference = findPrimaryRuntimeReference(node.test, context);
    if (reference) {
      markSubtreeConsumed(node.test, context.consumedNodes);
      pushFinding({
        node: node.test,
        reference: reference.reference,
        transformationKind: TRANSFORMATION_KIND.BRANCH_PRUNE,
        context,
      });
    }
  }

  if (!context.consumedNodes.has(node)) {
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const reference = resolveExpressionPath(node.callee, context);
      if (isR97Relevant(reference, context)) {
        pushFinding({
          node,
          reference,
          transformationKind: TRANSFORMATION_KIND.CALL_EVAL,
          context,
        });
      }
    } else if (node.type === "UnaryExpression" && node.operator === "typeof") {
      const reference = resolveExpressionPath(node.argument, context);
      if (isR97Relevant(reference, context)) {
        context.consumedNodes.add(node.argument);
        pushFinding({
          node,
          reference,
          transformationKind: TRANSFORMATION_KIND.CONST_EVAL,
          context,
        });
      }
    } else if (node.type === "MemberExpression") {
      const record = context.recordByNode.get(node);
      const parent = record?.parent;
      const isCallee =
        parent &&
        (parent.type === "CallExpression" || parent.type === "NewExpression") &&
        parent.callee === node;
      if (!isCallee) {
        const reference = resolveExpressionPath(node, context);
        if (isR97Relevant(reference, context)) {
          pushFinding({
            node,
            reference,
            transformationKind: TRANSFORMATION_KIND.CONST_EVAL,
            context,
          });
        }
      }
    } else if (node.type === "Identifier") {
      if (!isStandaloneIdentifierUsage(node, context)) {
        return walkChildren(node, context);
      }
      const reference = resolveExpressionPath(node, context);
      if (isR97Relevant(reference, context)) {
        pushFinding({
          node,
          reference,
          transformationKind: TRANSFORMATION_KIND.CONST_EVAL,
          context,
        });
      }
    }
  }

  walkChildren(node, context);
};

const walkChildren = (node, context) => {
  for (const key of Object.keys(node)) {
    if (
      key === "parent" ||
      key === "loc" ||
      key === "range" ||
      key === "tokens" ||
      key === "comments"
    ) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child) => collectFindings(child, context));
    } else if (value && typeof value.type === "string") {
      collectFindings(value, context);
    }
  }
};

const isBindingTargetIdentifier = (node, parent) => {
  switch (parent.type) {
    case "VariableDeclarator":
      return parent.id === node;
    case "AssignmentPattern":
      return parent.left === node;
    case "ClassDeclaration":
    case "ClassExpression":
      return parent.id === node;
    case "ExportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ImportSpecifier":
    case "LabeledStatement":
    case "ArrayPattern":
    case "ObjectPattern":
    case "RestElement":
      return true;
    default:
      return false;
  }
};

const isStandaloneIdentifierUsage = (node, context) => {
  const record = context.recordByNode.get(node);
  const parent = record?.parent;
  if (!parent) {
    return false;
  }
  if (isBindingTargetIdentifier(node, parent)) {
    return false;
  }
  if (
    parent.type === "MemberExpression" &&
    (parent.object === node || parent.property === node)
  ) {
    return false;
  }
  if (
    parent.type === "Property" &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }
  if (
    (parent.type === "CallExpression" || parent.type === "NewExpression") &&
    parent.callee === node
  ) {
    return false;
  }
  if (parent.type === "UnaryExpression" && parent.operator === "typeof") {
    return false;
  }
  return true;
};

const findPrimaryRuntimeReference = (node, context) => {
  if (!node || typeof node.type !== "string") {
    return null;
  }

  const direct = resolveExpressionPath(node, context);
  if (isR97Relevant(direct, context)) {
    return {
      node,
      reference: direct,
    };
  }

  const childKeys = [
    "argument",
    "left",
    "right",
    "test",
    "callee",
    "object",
  ];
  for (const key of childKeys) {
    const child = node[key];
    if (child && typeof child.type === "string") {
      const found = findPrimaryRuntimeReference(child, context);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

/**
 * bundle 模块系统自己的符号。
 *
 * 它们在 HOST_GLOBAL_ROOTS 里（Node 端确实由宿主注入），但在微信 bundle 里是
 * 模块系统关键字：遇到它们不能判成宿主能力，只能判「未知」。
 */
const BUNDLE_SYSTEM_SYMBOLS = new Set([
  "define",
  "require",
  "module",
  "exports",
  "definePlugin",
  "requirePlugin",
]);

/** 取 bundle 模块的导出表，带缓存。 */
const bundleExportsFor = (modulePath, context) => {
  if (context.bundleExportCache.has(modulePath)) {
    return context.bundleExportCache.get(modulePath);
  }
  const entry = context.bundleModules.get(modulePath);
  const exports = entry ? extractModuleExports(entry.factoryNode) : null;
  context.bundleExportCache.set(modulePath, exports);
  return exports;
};

/**
 * 判断导出值的来源，三态：
 *   pure    没有任何宿主引用，也没有无法解析的名字
 *   host    最终引用到宿主全局（返回根名字与路径）
 *   unknown 无法确定（外部依赖、参数、深度超限、动态写法）
 *
 * 导出函数也会进入函数体检查——导出函数的函数体里调用宿主同样危险。
 * seen 用来防止别名环与递归函数导致无限展开。
 */
const analyzeExportProvenance = (node, context, seen, depth) => {
  let verdict = { kind: "pure" };
  const visit = (current, currentDepth) => {
    if (!current || typeof current.type !== "string") return;
    if (verdict.kind !== "pure") return;
    if (currentDepth > MAX_BUNDLE_EXPORT_DEPTH) {
      verdict = { kind: "unknown" };
      return;
    }
    if (current.type === "Identifier") {
      if (BUNDLE_SYSTEM_SYMBOLS.has(current.name)) {
        if (current.name !== "define") {
          verdict = { kind: "unknown" };
        }
        return;
      }
      const scope = context.scopeByNode.get(current);
      const binding = scope?.resolve(current.name);
      if (!binding) {
        if (HOST_GLOBAL_SET.has(current.name)) {
          verdict = { kind: "host", root: current.name, path: current.name };
          return;
        }
        if (LANGUAGE_BUILTIN_SET.has(current.name)) {
          return;
        }
        verdict = { kind: "unknown" };
        return;
      }
      if (seen.has(binding)) return;
      seen.add(binding);
      if (binding.bundleModulePath) {
        verdict = { kind: "unknown" };
        return;
      }
      if (binding.aliasNode && !binding.mutated) {
        visit(binding.aliasNode, currentDepth + 1);
        return;
      }
      const declaration = binding.node;
      if (
        declaration &&
        (declaration.type === "FunctionDeclaration" ||
          declaration.type === "FunctionExpression" ||
          declaration.type === "ArrowFunctionExpression")
      ) {
        visit(declaration.body, currentDepth + 1);
        return;
      }
      verdict = { kind: "unknown" };
      return;
    }
    if (isRequireCall(current)) {
      // 导出值里再 require：v1 不做跨模块串联解析，保守返回未知。
      verdict = { kind: "unknown" };
      return;
    }
    // 成员表达式的属性名不是变量引用：`r.length` 里的 length 不能被当成
    // 未解析全局，否则任何函数体都会因为属性名而判成 unknown。
    if (current.type === "MemberExpression") {
      visit(current.object, currentDepth);
      if (current.computed) {
        visit(current.property, currentDepth);
      }
      return;
    }
    // 对象字面量的 key 同理，只有 computed key 才是表达式。
    if (current.type === "Property") {
      if (current.computed) {
        visit(current.key, currentDepth);
      }
      visit(current.value, currentDepth);
      return;
    }
    for (const key of Object.keys(current)) {
      if (key === "parent") continue;
      const value = current[key];
      if (Array.isArray(value)) {
        for (const child of value) visit(child, currentDepth);
      } else if (value && typeof value.type === "string") {
        visit(value, currentDepth);
      }
    }
  };
  visit(node, depth);
  return verdict;
};

/**
 * 把一个 bundle 模块的命名导出解析成绑定解析结果。
 *
 * 返回 null 表示无法确定，调用方保持原来的 module_import 行为（UNKNOWN）。
 */
const resolveBundleExport = (modulePath, exportName, context, depth, seen) => {
  if (depth > MAX_BUNDLE_EXPORT_DEPTH) return null;
  const exports = bundleExportsFor(modulePath, context);
  if (!exports || exports.dynamic) return null;
  const valueNode =
    exports.named.get(exportName) ??
    (exportName === "default" ? exports.defaultExport : null);
  if (!valueNode) return null;
  const verdict = analyzeExportProvenance(valueNode, context, seen, depth);
  if (verdict.kind === "pure") {
    return {
      kind: BINDING_KIND.LOCAL,
      origin: `bundle-export:${modulePath}.${exportName}`,
      path: `${modulePath}.${exportName}`,
      root: null,
      aliasChain: [],
      mutationStatus: "stable",
      scopeId: null,
    };
  }
  if (verdict.kind === "host") {
    return {
      kind: BINDING_KIND.RUNTIME_GLOBAL,
      origin: verdict.root,
      path: verdict.path,
      root: verdict.root,
      aliasChain: [verdict.root],
      mutationStatus: "stable",
      scopeId: null,
    };
  }
  return null;
};

const resolveExpressionPath = (node, context, resolving = new Set()) => {
  if (!node || typeof node.type !== "string") {
    return dynamicResolution("invalid_expression");
  }

  if (node.type === "ChainExpression") {
    return resolveExpressionPath(node.expression, context, resolving);
  }

  if (node.type === "Identifier") {
    if (resolving.has(node.name)) {
      return dynamicResolution(`alias_cycle:${node.name}`);
    }

    const scope = context.scopeByNode.get(node);
    const binding = scope?.resolve(node.name);
    if (!binding) {
      const kind = context.knownGlobals.has(node.name)
        ? BINDING_KIND.RUNTIME_GLOBAL
        : BINDING_KIND.UNRESOLVED_GLOBAL;
      return {
        kind,
        origin: node.name,
        path: node.name,
        root: node.name,
        aliasChain: [node.name],
        mutationStatus: "stable",
        scopeId: scopeId(scope),
      };
    }

    if (binding.bundleModulePath) {
      // 模块整体导出：`module.exports = <expr>` 时，require() 的返回值就是该表达式。
      const moduleExports = bundleExportsFor(binding.bundleModulePath, context);
      if (moduleExports?.defaultExport && !moduleExports.dynamic) {
        const verdict = analyzeExportProvenance(
          moduleExports.defaultExport,
          context,
          new Set(),
          0,
        );
        if (verdict.kind === "pure") {
          return {
            kind: BINDING_KIND.LOCAL,
            origin: `bundle-default:${binding.bundleModulePath}`,
            path: `${binding.bundleModulePath}.default`,
            root: null,
            aliasChain: [node.name],
            mutationStatus: "stable",
            scopeId: scopeId(binding.scope),
          };
        }
        if (verdict.kind === "host") {
          return {
            kind: BINDING_KIND.RUNTIME_GLOBAL,
            origin: verdict.root,
            path: verdict.path,
            root: verdict.root,
            aliasChain: [node.name, verdict.root],
            mutationStatus: "stable",
            scopeId: scopeId(binding.scope),
          };
        }
      }
      return {
        kind: BINDING_KIND.MODULE_IMPORT,
        origin: `bundle:${binding.bundleModulePath}`,
        path: binding.bundleModulePath,
        root: binding.bundleModulePath.split("/")[0],
        bundleModulePath: binding.bundleModulePath,
        aliasChain: [node.name],
        mutationStatus: binding.mutated ? "mutated" : "stable",
        scopeId: scopeId(binding.scope),
      };
    }

    if (binding.kind === "module_import") {
      if (binding.modulePath) {
        return moduleResolution(binding.modulePath, node.name, binding);
      }
      return {
        kind: BINDING_KIND.MODULE_IMPORT,
        origin: `import:${node.name}`,
        path: node.name,
        root: node.name,
        aliasChain: [node.name],
        mutationStatus: binding.mutated ? "mutated" : "stable",
        scopeId: scopeId(binding.scope),
      };
    }

    if (binding.modulePath) {
      return moduleResolution(binding.modulePath, node.name, binding);
    }

    if (!binding.aliasNode || binding.mutated) {
      return {
        kind: BINDING_KIND.LOCAL,
        origin: binding.kind,
        path: node.name,
        root: node.name,
        aliasChain: [node.name],
        mutationStatus: binding.mutated ? "mutated" : "stable",
        scopeId: scopeId(binding.scope),
      };
    }

    const nextResolving = new Set(resolving);
    nextResolving.add(node.name);
    const alias = resolveExpressionPath(
      binding.aliasNode,
      context,
      nextResolving,
    );
    if (alias.kind === BINDING_KIND.DYNAMIC) {
      return alias;
    }
    if (alias.kind === BINDING_KIND.LOCAL) {
      return {
        ...alias,
        aliasChain: [node.name, ...alias.aliasChain],
      };
    }
    if (
      alias.kind === BINDING_KIND.MODULE_IMPORT &&
      alias.path === null
    ) {
      return {
        ...alias,
        path: node.name,
        aliasChain: [node.name, ...alias.aliasChain],
        mutationStatus: binding.mutated ? "mutated" : "stable",
        scopeId: scopeId(binding.scope),
      };
    }
    return {
      ...alias,
      origin: `${binding.kind}:${node.name}->${alias.origin}`,
      aliasChain: [node.name, ...alias.aliasChain],
      mutationStatus: binding.mutated ? "mutated" : "stable",
      scopeId: scopeId(binding.scope),
    };
  }

  if (node.type === "ThisExpression") {
    return dynamicResolution("this");
  }

  if (node.type === "MemberExpression") {
    const object = resolveExpressionPath(node.object, context, resolving);
    if (object.kind === BINDING_KIND.DYNAMIC) {
      return object;
    }
    const property = getStaticPropertyName(node, context);
    if (!property || property.trim() === "") {
      return {
        ...dynamicResolution(
          `${object.path ?? object.root ?? "unknown"}[dynamic]`,
        ),
        root: object.root,
        path: object.path,
      };
    }
    // bundle 内部模块的命名导出：解析到导出值的来源。
    // 解析不出来（外部依赖、动态导出、深度超限）就保持原来的拼接行为，
    // 让判定停在 UNKNOWN，不做猜测。
    if (object.bundleModulePath) {
      const resolved = resolveBundleExport(
        object.bundleModulePath,
        property,
        context,
        0,
        new Set(),
      );
      if (resolved) {
        return {
          ...resolved,
          aliasChain: [...object.aliasChain, property],
        };
      }
    }
    const path = object.path ? `${object.path}.${property}` : property;
    return {
      ...object,
      path,
      aliasChain: [...object.aliasChain, property],
    };
  }

  if (isRequireCall(node)) {
    const builtinPath = getRequiredBuiltinPath(node);
    const bundlePath = builtinPath
      ? null
      : bundleModulePathForRequire(node, context.bundleModules);
    const modulePath = builtinPath ?? bundlePath;
    return {
      kind: BINDING_KIND.MODULE_IMPORT,
      origin: `require:${node.arguments[0].value}`,
      path: modulePath,
      root: modulePath?.split(".")[0] ?? "require",
      bundleModulePath: bundlePath,
      aliasChain: ["require", node.arguments[0].value],
      mutationStatus: "stable",
      scopeId: scopeId(context.scopeByNode.get(node)),
    };
  }

  return dynamicResolution(node.type);
};

const moduleResolution = (modulePath, localName, binding) => ({
  kind: BINDING_KIND.MODULE_IMPORT,
  origin: `module:${modulePath}`,
  path: modulePath,
  root: modulePath.split(".")[0],
  aliasChain: [localName],
  mutationStatus: binding.mutated ? "mutated" : "stable",
  scopeId: scopeId(binding.scope),
});

const dynamicResolution = (origin) => ({
  kind: BINDING_KIND.DYNAMIC,
  origin,
  path: null,
  root: null,
  aliasChain: [],
  mutationStatus: "dynamic",
  scopeId: null,
});

const isR97Relevant = (resolution, context) => {
  if (
    resolution.kind === BINDING_KIND.RUNTIME_GLOBAL ||
    resolution.kind === BINDING_KIND.MODULE_IMPORT ||
    resolution.kind === BINDING_KIND.UNRESOLVED_GLOBAL
  ) {
    return true;
  }
  if (resolution.kind === BINDING_KIND.DYNAMIC) {
    return Boolean(resolution.root && context.knownGlobals.has(resolution.root));
  }
  return false;
};

const getStaticPropertyName = (node, context) => {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (node.computed) {
    const value = resolveStaticPrimitive(
      node.property,
      context,
      new Set(),
    );
    if (value && ["string", "number"].includes(typeof value.value)) {
      return String(value.value);
    }
  }
  return null;
};

const resolveStaticPrimitive = (node, context, resolving) => {
  if (!node || typeof node.type !== "string") {
    return null;
  }

  if (
    node.type === "Literal" &&
    (typeof node.value === "string" || typeof node.value === "number")
  ) {
    return {
      type: typeof node.value,
      value: node.value,
    };
  }

  if (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1 &&
    typeof node.quasis[0].value.cooked === "string"
  ) {
    return {
      type: "string",
      value: node.quasis[0].value.cooked,
    };
  }

  if (node.type === "Identifier") {
    const scope = context.scopeByNode.get(node);
    const binding = scope?.resolve(node.name);
    if (
      !binding ||
      binding.kind !== "local" ||
      binding.declarationKind !== "const" ||
      binding.mutated ||
      !binding.aliasNode ||
      resolving.has(binding) ||
      isUsedBeforeDeclaration(node, binding)
    ) {
      return null;
    }

    const nextResolving = new Set(resolving);
    nextResolving.add(binding);
    return resolveStaticPrimitive(
      binding.aliasNode,
      context,
      nextResolving,
    );
  }

  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = resolveStaticPrimitive(node.left, context, resolving);
    const right = resolveStaticPrimitive(node.right, context, resolving);
    if (!left || !right || left.type !== right.type) {
      return null;
    }
    return {
      type: left.type,
      value: left.value + right.value,
    };
  }

  return null;
};

const isUsedBeforeDeclaration = (node, binding) => {
  const useStart = node.range?.[0];
  const declarationEnd = binding.node?.range?.[1];
  return (
    typeof useStart === "number" &&
    typeof declarationEnd === "number" &&
    useStart < declarationEnd
  );
};

/**
 * 这个引用点的根名字，是不是代码自己在文件里写出来的全局？
 *
 * 只影响归因，不影响判定：它让报告能把「宿主未知全局」和「代码自身定义的
 * 全局」分开统计，后者靠运行时探针永远解决不了。
 */
const resolveInFileDefinition = (reference, context) => {
  const root = reference.root;
  if (typeof root !== "string" || root === "") {
    return null;
  }
  const assignment = context.implicitGlobalAssignments.get(root);
  if (!assignment) {
    return null;
  }
  return assignment.topLevel
    ? "top_level_assignment"
    : "function_body_assignment";
};

const pushFinding = ({
  node,
  reference,
  transformationKind,
  context,
}) => {
  const normalizedPath = reference.path ?? reference.root ?? "<unknown>";
  const bindingRef = createBindingRef({
    bindingRefId: idFor(
      context.filePath,
      node,
      `binding:${transformationKind}:${normalizedPath}`,
    ),
    bindingKind: reference.kind,
    bindingOrigin: reference.origin,
    scopeId: reference.scopeId,
    mutationStatus: reference.mutationStatus,
    aliasChain: reference.aliasChain,
    resolutionStatus:
      reference.kind === BINDING_KIND.DYNAMIC
        ? RESOLUTION_STATUS.DYNAMIC
        : reference.kind === BINDING_KIND.UNRESOLVED_GLOBAL
          ? RESOLUTION_STATUS.UNRESOLVED
          : RESOLUTION_STATUS.RESOLVED,
    inFileDefinition: resolveInFileDefinition(reference, context),
  });
  const runtimeEntity = createRuntimeEntity({
    entityId: normalizedPath,
    runtimeBindingKind: reference.root ?? reference.kind,
    normalizedPath,
    capabilityDomain: inferCapabilityDomain(normalizedPath),
  });
  const usageContext = buildUsageContext(node, reference, context);
  const programPointId = idFor(
    context.filePath,
    node,
    `point:${transformationKind}:${normalizedPath}`,
  );

  context.findings.push(
    Object.freeze({
      programPointId,
      programPoint: Object.freeze({
        filePath: context.filePath,
        start: node.loc?.start ?? null,
        end: node.loc?.end ?? null,
        nodeType: node.type,
      }),
      transformationKind,
      bindingRef,
      runtimeEntity,
      usageContext,
    }),
  );
};

const buildUsageContext = (node, reference, context) => {
  const record = context.recordByNode.get(node);
  const parent = record?.parent ?? null;
  const accessMode = getAccessMode(node, parent);
  const args = node.type === "CallExpression" || node.type === "NewExpression"
    ? node.arguments
    : [];
  const callbackPresence = args.some((argument) =>
    FUNCTION_NODE_TYPES.has(argument.type),
  );
  const awaited =
    parent?.type === "AwaitExpression" ||
    (parent?.type === "ChainExpression" &&
      context.recordByNode.get(parent)?.parent?.type === "AwaitExpression");
  const returnValueUsage =
    accessMode === "call" &&
    parent?.type !== "ExpressionStatement" &&
    parent?.type !== "ChainExpression";
  const resultPropertyPath =
    accessMode === "call" &&
    parent?.type === "MemberExpression" &&
    parent.object === node
      ? getStaticPropertyName(parent, context)
      : null;
  const argumentShape = classifyArguments(args, callbackPresence);
  const usageContextId = [
    `access:${accessMode}`,
    `args:${argumentShape}`,
    `callback:${callbackPresence ? 1 : 0}`,
    `return:${returnValueUsage ? 1 : 0}`,
    `await:${awaited ? 1 : 0}`,
    `result:${resultPropertyPath ?? "-"}`,
    `dynamic:${reference.kind === BINDING_KIND.DYNAMIC ? 1 : 0}`,
  ].join("|");

  return createUsageContext({
    usageContextId,
    accessMode,
    argumentShape,
    callbackPresence,
    returnValueUsage,
    awaited,
    resultPropertyPath,
    dynamicPropertyAccess: reference.kind === BINDING_KIND.DYNAMIC,
  });
};

const getAccessMode = (node, parent) => {
  if (node.type === "CallExpression" || node.type === "NewExpression") {
    return "call";
  }
  if (node.type === "UnaryExpression") {
    return "typeof";
  }
  if (node.type === "Identifier") {
    if (parent?.type === "AssignmentExpression" && parent.left === node) {
      return "assign";
    }
    return "read";
  }
  if (node.type === "MemberExpression") {
    if (parent?.type === "AssignmentExpression" && parent.left === node) {
      return "assign";
    }
    return "property_read";
  }
  if (
    parent?.type === "IfStatement" ||
    parent?.type === "ConditionalExpression" ||
    parent?.type === "WhileStatement" ||
    parent?.type === "DoWhileStatement"
  ) {
    return "branch_test";
  }
  return "unknown";
};

const classifyArguments = (args, callbackPresence) => {
  if (args.length === 0) {
    return "none";
  }
  if (callbackPresence) {
    return "callback";
  }
  if (args.every(isLiteralExpression)) {
    return "literals";
  }
  if (args.every((argument) => argument.type === "ObjectExpression")) {
    return "object";
  }
  return "unknown";
};

const isLiteralExpression = (node) =>
  node.type === "Literal" ||
  node.type === "TemplateLiteral" ||
  node.type === "ArrayExpression" ||
  (node.type === "Identifier" &&
    (node.name === "undefined" || node.name === "NaN"));

const inferCapabilityDomain = (path) => {
  const value = path.toLowerCase();
  if (
    /(request|socket|download|upload|fetch|xmlhttprequest|websocket)/.test(value)
  ) {
    return "network";
  }
  if (/(storage|database|file|filesystem)/.test(value)) {
    return "storage";
  }
  if (/(payment|pay)/.test(value)) {
    return "payment";
  }
  if (
    /(weixinjsbridge|native|bridge|permission|setting|device|bluetooth|nfc)/.test(
      value,
    )
  ) {
    return "native_bridge";
  }
  if (
    /(show|hide|navigate|redirect|switchtab|relaunch|toast|modal|alert|document|window)/.test(
      value,
    )
  ) {
    return "visible_ui";
  }
  if (/(crypto|digest|random)/.test(value)) {
    return "crypto";
  }
  if (/(timeout|interval|animationframe|immediate)/.test(value)) {
    return "timing";
  }
  if (/(require|module|exports|process|buffer)/.test(value)) {
    return "module_runtime";
  }
  return "unknown";
};

const scopeId = (scope) => {
  if (!scope) {
    return null;
  }
  const ids = [];
  let current = scope;
  while (current) {
    ids.push(current.bindings.size);
    current = current.parent;
  }
  return `scope:${ids.join(".")}`;
};

const idFor = (filePath, node, suffix) =>
  sha256(
    `${filePath}:${node.loc?.start?.line ?? 0}:${node.loc?.start?.column ?? 0}:${suffix}`,
  ).slice(0, 24);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const markSubtreeConsumed = (node, consumedNodes) => {
  if (!node || typeof node.type !== "string") {
    return;
  }
  consumedNodes.add(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((child) => markSubtreeConsumed(child, consumedNodes));
    } else if (value && typeof value.type === "string") {
      markSubtreeConsumed(value, consumedNodes);
    }
  }
};
