/**
 * R97-Pro 跨模块整体依赖穿透分析器 (Bundle Pro Whole-Program Analyzer)。
 *
 * 目标：在不破坏单文件隔离的前提下，穿透模块之间 `require("a") -> require("b") -> wx.request` 的
 * 中继引用与导出链，解决以往 27% 因跨模块封装落入 UNKNOWN 的盲区。
 */

import {
  extractModuleExports,
  resolveBundleRequest,
  isRequireCall,
  unwrapInteropRequire,
} from "./bundle-modules.mjs";
import { BINDING_KIND } from "./constants.mjs";
import { HOST_GLOBAL_ROOTS, LANGUAGE_BUILTIN_ROOTS } from "./global-roots.mjs";

const HOST_GLOBAL_SET = new Set(HOST_GLOBAL_ROOTS);
const LANGUAGE_BUILTIN_SET = new Set(LANGUAGE_BUILTIN_ROOTS);
const MAX_PRO_RESOLUTION_DEPTH = 16;

/** bundle 模块系统自己的符号：出现在导出表达式里只能判未知。 */
const BUNDLE_SYSTEM_SYMBOLS = new Set([
  "define",
  "require",
  "module",
  "exports",
  "definePlugin",
  "requirePlugin",
]);

/**
 * 构建跨模块依赖关系与符号导出图。
 */
export class BundleDependencyGraph {
  constructor(bundleModulesMap) {
    this.modules = bundleModulesMap; // Map<normalizedPath, entry>
    this.exportCache = new Map();
  }

  getExports(modulePath) {
    if (this.exportCache.has(modulePath)) {
      return this.exportCache.get(modulePath);
    }
    const entry = this.modules.get(modulePath);
    if (!entry) {
      return null;
    }
    const exports = extractModuleExports(entry.factoryNode);
    this.exportCache.set(modulePath, exports);
    return exports;
  }

  /**
   * 穿透追踪目标模块的导出属性。
   */
  resolveExportDeep(
    modulePath,
    exportName,
    context,
    visited = new Set(),
    depth = 0,
  ) {
    if (depth > MAX_PRO_RESOLUTION_DEPTH) {
      return { kind: "unknown", reason: "depth_limit" };
    }
    // visited 按「当前解析栈」使用：进入时加入、返回时回溯删除。
    // 若只加不删，同一模块在兄弟子树里被第二次引用（typeof 同时被
    // toPrimitive 与 toPropertyKey 依赖）会被误报为环形依赖。
    const stateKey = `${modulePath}#${exportName}`;
    if (visited.has(stateKey)) {
      return { kind: "unknown", reason: "circular_dependency" };
    }
    visited.add(stateKey);
    try {
      return this.resolveExportDeepInner(
        modulePath,
        exportName,
        context,
        visited,
        depth,
      );
    } finally {
      visited.delete(stateKey);
    }
  }

  /** 穿透追踪目标模块的导出属性（实现体，环检测由入口包装负责）。 */
  resolveExportDeepInner(
    modulePath,
    exportName,
    context,
    visited,
    depth,
  ) {

    const exports = this.getExports(modulePath);
    if (!exports || exports.dynamic) {
      return { kind: "unknown", reason: "dynamic_or_missing_exports" };
    }

    let valueNode =
      exports.named.get(exportName) ??
      (exportName === "default" ? exports.defaultExport : null);

    if (!valueNode && exports.defaultExport) {
      if (exports.defaultExport.type === "ObjectExpression") {
        for (const prop of exports.defaultExport.properties) {
          if (
            prop.type === "Property" &&
            !prop.computed &&
            prop.key.name === exportName
          ) {
            valueNode = prop.value;
            break;
          }
        }
      }
    }

    if (!valueNode) {
      return { kind: "unknown", reason: "export_not_found" };
    }

    // 检查 valueNode 是否直接引用了其他模块的 require 属性调用
    // 例如 `var r = require("x"); exports.call = r.net;`
    if (
      valueNode.type === "MemberExpression" &&
      !valueNode.computed &&
      valueNode.object.type === "Identifier"
    ) {
      const parentScope = context.scopeByNode.get(valueNode);
      const binding = parentScope?.resolve(valueNode.object.name);
      if (binding && binding.bundleModulePath) {
        const nextModule = binding.bundleModulePath;
        const nextProp = valueNode.property.name;
        return this.resolveExportDeep(
          nextModule,
          nextProp,
          context,
          visited,
          depth + 1,
        );
      }
    }

    // 直接赋值别名，如 `exports.doCalc = c.calc;`
    if (valueNode.type === "Identifier") {
      const parentScope = context.scopeByNode.get(valueNode);
      const binding = parentScope?.resolve(valueNode.name);
      if (binding?.bundleModulePath) {
        return this.resolveExportDeep(
          binding.bundleModulePath,
          "default",
          context,
          visited,
          depth + 1,
        );
      }
      if (binding?.aliasNode && binding.aliasNode.type === "MemberExpression") {
        const objName = binding.aliasNode.object?.name;
        const propName = binding.aliasNode.property?.name;
        const objBinding = parentScope?.resolve(objName);
        if (objBinding?.bundleModulePath && propName) {
          return this.resolveExportDeep(
            objBinding.bundleModulePath,
            propName,
            context,
            visited,
            depth + 1,
          );
        }
      }
      if (HOST_GLOBAL_SET.has(valueNode.name)) {
        return { kind: "host", root: valueNode.name, path: valueNode.name };
      }
      if (LANGUAGE_BUILTIN_SET.has(valueNode.name)) {
        return { kind: "pure" };
      }
    }

    // 函数字面量、对象字面量与其他表达式统一走保守来源扫描：
    // 函数体可能引用宿主（wx.request）或无法解析的名字，不能无条件判 pure，
    // 否则带宿主依赖的导出会被误标为纯语言并在调用点上错误授权折叠。
    return this.scanExpression(valueNode, context, visited, depth);
  }

  /**
   * 保守扫描导出表达式里的宿主来源。三态：
   *   pure    全是语言内建 / 函数局部绑定，且嵌套模块链整条可证明为纯
   *   host    最终引用到宿主全局（返回根名字与路径）
   *   unknown 无法确定（外部依赖、无法解析的名字、动态写法、深度超限）
   *
   * 与 analyzer 的单模块版本相比，Pro 版额外支持：
   *   1. 嵌套 require 的整链递归（`var h = require("./h")` 直接追默认导出）；
   *   2. `r.net` 形式的模块属性深穿透（按属性名精确递归，而非笼统判未知）；
   *   3. 形参与 arguments 直接跳过（函数局部绑定，不触发函数体复扫）。
   */
  scanExpression(node, context, visited, depth) {
    let verdict = { kind: "pure" };
    const seen = new Set();
    const apply = (result) => {
      if (result.kind === "host" || result.kind === "unknown") {
        verdict = result;
      }
    };
    const visit = (current, currentDepth) => {
      if (!current || typeof current.type !== "string") return;
      if (verdict.kind !== "pure") return;
      if (currentDepth > MAX_PRO_RESOLUTION_DEPTH) {
        verdict = { kind: "unknown", reason: "depth_limit" };
        return;
      }
      if (current.type === "Identifier") {
        if (BUNDLE_SYSTEM_SYMBOLS.has(current.name)) {
          if (current.name !== "define") {
            verdict = {
              kind: "unknown",
              reason: `bundle_symbol:${current.name}`,
            };
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
          verdict = {
            kind: "unknown",
            reason: `unresolved_global:${current.name}`,
          };
          return;
        }
        if (seen.has(binding)) return;
        seen.add(binding);
        if (binding.kind === "parameter" || current.name === "arguments") {
          return;
        }
        if (binding.bundleModulePath) {
          apply(
            this.resolveExportDeep(
              binding.bundleModulePath,
              "default",
              context,
              visited,
              depth + 1,
            ),
          );
          return;
        }
        if (binding.modulePath) {
          // 外部依赖（Node 内建、wx-server-sdk 等）不属于包内模块链，
          // v1 不做语义推导，保守判未知。
          verdict = {
            kind: "unknown",
            reason: `external_module:${binding.modulePath}`,
          };
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
        verdict = {
          kind: "unknown",
          reason: `binding_kind:${binding.kind}:${current.name}`,
        };
        return;
      }
      if (isRequireCall(current)) {
        verdict = { kind: "unknown", reason: "nested_require" };
        return;
      }
      if (current.type === "MemberExpression") {
        // `module.exports` 的写入目标只是包内导出记账，不是宿主引用。
        // Babel 助手（typeof 等）会在函数体内写 `module.exports=_typeof=...`，
        // 若把目标里的 `module` 判成包系统符号，整条助手链会被误断。
        // 赋值右侧仍由赋值语句的遍历单独扫描，不会漏掉真实来源。
        if (
          !current.computed &&
          current.object?.type === "Identifier" &&
          current.object.name === "module" &&
          current.property?.type === "Identifier" &&
          current.property.name === "exports"
        ) {
          return;
        }
        // `r.net`：对象是包内模块引用且属性名静态可知时，按属性名精确深穿透。
        if (!current.computed && current.object?.type === "Identifier") {
          const scope = context.scopeByNode.get(current.object);
          const binding = scope?.resolve(current.object.name);
          if (binding?.bundleModulePath && current.property?.type === "Identifier") {
            apply(
              this.resolveExportDeep(
                binding.bundleModulePath,
                current.property.name,
                context,
                visited,
                depth + 1,
              ),
            );
            return;
          }
        }
        visit(current.object, currentDepth);
        if (current.computed) {
          visit(current.property, currentDepth);
        }
        return;
      }
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
  }
}
