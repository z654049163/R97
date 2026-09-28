import { builtinModules } from "node:module";

export const NODE_BUILTIN_MODULES = Object.freeze(
  [...new Set(builtinModules.map((name) => name.replace(/^node:/u, "")))].sort(),
);

export const NODE_BUILTIN_ROOTS = Object.freeze(
  [
    ...new Set(
      NODE_BUILTIN_MODULES.map((name) => `node:${name.split("/")[0]}`),
    ),
  ].sort(),
);

const NODE_BUILTIN_MODULE_SET = new Set(NODE_BUILTIN_MODULES);
const NODE_BUILTIN_ROOT_SET = new Set(NODE_BUILTIN_ROOTS);

export const isNodeBuiltinModule = (specifier) =>
  typeof specifier === "string" &&
  NODE_BUILTIN_MODULE_SET.has(specifier.replace(/^node:/u, ""));

export const isNodeBuiltinRoot = (root) =>
  typeof root === "string" && NODE_BUILTIN_ROOT_SET.has(root);

export const normalizeNodeBuiltinSpecifier = (specifier) => {
  if (!isNodeBuiltinModule(specifier)) {
    return null;
  }
  return `node:${specifier.replace(/^node:/u, "").replaceAll("/", ".")}`;
};

export const nodeBuiltinRequestFromRoot = (root) =>
  isNodeBuiltinRoot(root) ? root.slice("node:".length) : null;
