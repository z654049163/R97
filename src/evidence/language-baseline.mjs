import vm from "node:vm";

/**
 * 语言基线的**唯一定义**。
 *
 * 「语言基线」= 只有 ECMAScript 内建、不含任何宿主对象的执行环境。用一个
 * 隔离的 `vm` 上下文实现，自带全部内建，没有 `process`、`require`、`wx`、
 * `window`。
 *
 * 唯一的坑：Node 会往 `vm` 上下文里额外注入 `console`，而引擎侧把 `console`
 * 归在 `HOST_GLOBAL_ROOTS`（宿主对象，不是语言内建）。不删掉它，语言基线就
 * 会被污染。
 *
 * 这个清理动作曾经只写在判卷探针里（第九轮发现 `globalThis.console` 被当成
 * 语言内建、造成 2 条错误放行后补的），而 `differential-reference.mjs` 里的
 * 执行器另写了一份、没有清理——直到第十五轮 Level 2 oracle 的自检断言把这个
 * 不一致抓出来。现在两处共用本函数，避免再次漂移。
 */
export const createLanguageBaselineContext = () => {
  const context = vm.createContext(Object.create(null));
  vm.runInContext("delete globalThis.console;", context);
  return context;
};
