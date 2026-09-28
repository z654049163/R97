import { RUNTIME_IDS } from "./runtime-profiles.mjs";

/**
 * 平台族 → 可执行表面。
 *
 * `context_unknown` 需要它：当外部证据只确认了平台族、没确认执行表面时，
 * 候选运行时就是该族的全部表面——「代码可能跑在其中任何一个」。
 *
 * 这份枚举按各平台的规范定义，不是按语料里见过什么：
 *
 * - 微信小程序：业务 JS 跑在 AppService；Worker 是同一份 JS 的受限执行面。
 *   WebView 跑的是渲染层（WXS），不是业务包，因此不在业务代码的候选集里。
 * - 浏览器：Window 与各类 Worker 是不同的全局环境。
 * - Node：主线程与 worker_threads 是不同的全局环境。
 *
 * 实测语料分两段：
 *
 * - 1572 个已解包的小程序项目里没有一个含 `workers/` 目录，这批语料的执行
 *   表面可以确定为 AppService；
 * - GitHub 代码搜索筛出 30 个真·小程序且含 Worker 的仓库，其中 4 个独立项目
 *   （加 1 次重复采集）跑通了 Worker 探针，差异实体集合与 fixture 完全一致。
 *
 * Worker 证据目前只用于一致性审计（`eval:wechat-surface`），不直接外推成
 * 「Worker 里所有宿主 API 都不存在」——探针只覆盖 12 个实体，跨环境「不存在」
 * 不可外推这条约束仍然成立。
 */
export const PLATFORM_FAMILIES = Object.freeze({
  wechat: Object.freeze(["appservice", "worker"]),
  browser: Object.freeze(["window", "worker", "service-worker"]),
  node: Object.freeze(["main", "worker-thread"]),
});

/** 可作为比较目标的运行时 → 平台族。语言基线是求值参照，不在其中。 */
export const PLATFORM_FAMILY_BY_RUNTIME_ID = Object.freeze({
  [RUNTIME_IDS.WECHAT]: "wechat",
  [RUNTIME_IDS.EDGE]: "browser",
  [RUNTIME_IDS.NODE]: "node",
});

export const surfacesForFamily = (family) =>
  PLATFORM_FAMILIES[family] ?? [];

export const familyForRuntimeId = (runtimeId) =>
  PLATFORM_FAMILY_BY_RUNTIME_ID[runtimeId] ?? null;

export const isKnownPlatformFamily = (family) =>
  Object.hasOwn(PLATFORM_FAMILIES, family);
