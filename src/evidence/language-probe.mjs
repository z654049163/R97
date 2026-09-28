import {
  EVIDENCE_PROVENANCE,
  SEMANTIC_DIMENSION,
} from "../constants.mjs";
import { LANGUAGE_BUILTIN_ROOTS } from "../global-roots.mjs";
import { collectNodeObservations } from "./node-probe.mjs";
import { LANGUAGE_PROFILE } from "../runtime-profiles.mjs";
import vm from "node:vm";

const LANGUAGE_ROOTS = LANGUAGE_BUILTIN_ROOTS;

/**
 * 语言基线专用的隔离 vm 全局对象。
 *
 * `globalThis` 是 ECMAScript 内建，但它的**内容取决于宿主**：在 Node realm 里
 * 展开 `globalThis` 会看到 `console`、`process` 这些宿主对象。语言探针必须把
 * `globalThis` 指到裸引擎的全局对象上，否则 `globalThis.console` 会被误判成
 * 语言内建——实测因此放行了 2 条本应保护的折叠。
 */
const createLanguageGlobal = () => {
  const context = vm.createContext(Object.create(null));
  // Node 会给 vm 上下文额外注入 console，而语言基线的定义不含任何宿主对象。
  vm.runInContext("delete globalThis.console;", context);
  return vm.runInContext("globalThis", context);
};

const LANGUAGE_GLOBAL = createLanguageGlobal();

export const collectLanguageObservations = ({
  entityDimensions,
  runtimeProfile = LANGUAGE_PROFILE,
  observedAt = new Date().toISOString(),
}) =>
  collectNodeObservations({
    entityDimensions,
    runtimeProfile,
    allowedRoots: LANGUAGE_ROOTS,
    disallowedRootsAreAbsent: true,
    rootOverrides: { globalThis: LANGUAGE_GLOBAL },
    observedAt,
  });

export const LANGUAGE_BASELINE_ROOTS = LANGUAGE_ROOTS;

export const LANGUAGE_BASELINE_DIMENSIONS = Object.freeze([
  SEMANTIC_DIMENSION.EXISTENCE,
  SEMANTIC_DIMENSION.TYPE,
  SEMANTIC_DIMENSION.CALLABILITY,
]);

export const LANGUAGE_BASELINE_PROVENANCE =
  EVIDENCE_PROVENANCE.RUNTIME_OBSERVED;
