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

const DEFAULT_RUNTIME_GLOBALS = new Set([
  ...LANGUAGE_BUILTIN_ROOTS,
  ...HOST_GLOBAL_ROOTS,
]);

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
  const scopes = buildScopeTree(ast);
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

const buildScopeTree = (ast) => {
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
        declarePatterns(
          declarator.id,
          targetScope,
          "local",
          declarator,
          declarator.init,
          modulePath,
          node.kind,
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
    const path = object.path ? `${object.path}.${property}` : property;
    return {
      ...object,
      path,
      aliasChain: [...object.aliasChain, property],
    };
  }

  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments.length === 1 &&
    node.arguments[0].type === "Literal" &&
    typeof node.arguments[0].value === "string"
  ) {
    const modulePath = getRequiredBuiltinPath(node);
    return {
      kind: BINDING_KIND.MODULE_IMPORT,
      origin: `require:${node.arguments[0].value}`,
      path: modulePath,
      root: modulePath?.split(".")[0] ?? "require",
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
