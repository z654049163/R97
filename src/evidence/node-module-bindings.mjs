import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const moduleExports = {};

/**
 * CommonJS 模块作用域绑定。
 *
 * `require` / `module` / `exports` / `__dirname` / `__filename` 是**模块级绑定**，
 * 不是 `globalThis` 的属性。靠 `globalThis` 去判断它们是否存在，结果会随启动方式
 * 变化——实测 `node -e`（CJS）下 `globalThis.require` 是函数、`globalThis.module`
 * 是对象，而 ESM 脚本下这三个都是 `undefined`。
 *
 * 后果不只是数字不一致，方向还不安全：ESM 模式下 Node 侧会把 `require` 观测成
 * 「不存在」，与语言基线的「不存在」一致，于是可能放行 `require` 相关的折叠。
 *
 * 因此这里固定按「Node CommonJS 模块里存在」回答，并让决策链的 Node 探针与
 * 判卷探针共用同一份取值。
 */
export const COMMONJS_MODULE_BINDING_NAMES = Object.freeze([
  "__dirname",
  "__filename",
  "exports",
  "module",
  "require",
]);

export const createCommonJsModuleBindings = () => ({
  require: createRequire(import.meta.url),
  module: { exports: moduleExports },
  exports: moduleExports,
  __dirname: thisDir,
  __filename: thisFile,
});
