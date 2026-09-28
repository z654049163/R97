/**
 * Level 2 变换 oracle 的用例集。
 *
 * 与 Level 1（`differential-cases.mjs`：同一表达式在多个环境的观测差）不同，
 * 这一层问的是**变换本身**：把 P 折叠成 T(P) 之后，**在目标环境里**行为还一样吗？
 *
 *   Level 1：Obs(P, R1) ≟ Obs(P, R2)        实体能不能迁移
 *   Level 2：Obs(T(P), R_t) ≟ Obs(P, R_t)    变换在目标环境里保不保语义
 *
 * 这是唯一不依赖「实体观测可迁移」这个中间推理的验证通道。
 *
 * 每个用例四个字段：
 * - `foldPoint`：喂给 R97 的折叠点，必须**自包含**（局部绑定要写在里面，
 *   否则 R97 看到的是一个未解析的裸名字，测不到想测的东西）
 * - `source` / `folded`：变换前后的程序，两者都返回可比较的值
 * - `targetRuntime`：在哪个环境里比较行为（`node` 或 `edge`）
 *
 * `folded` 必须反映**求值基线**里会算出什么，而不是目标环境里的真实取值。
 * R97 的求值参照是裸 ECMAScript 基线（隔离 vm，没有任何宿主对象），所以
 * `typeof console` 在那里是 `"undefined"` 而不是 `"object"`——折叠器按基线
 * 求值就会把分支剪向错误一侧。把 `folded` 写成目标环境的取值会伪造出一个
 * 安全的变换，测出来的就不是 R97 要防的东西了。
 */

const EVALUATION_BASELINE = "language";

export const TRANSFORMATION_ORACLE_CASES = Object.freeze([
  // ── A 组：求值基线缺宿主能力 → 剪枝方向错误 → 目标环境行为改变 ──────────
  {
    caseId: "window-guard-pruned-by-baseline",
    category: "cross-host-divergence",
    description:
      "求值基线里 typeof window 为 'undefined'，折叠器剪掉活分支；Edge 目标里该分支是活的",
    foldPoint: "if (typeof window !== 'undefined') {}",
    source:
      '(function(){ var r = "unset"; if (typeof window !== "undefined") { r = "has-window"; } else { r = "no-window"; } return r; })()',
    folded: '(function(){ var r = "unset"; r = "no-window"; return r; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "process-guard-pruned-by-baseline",
    category: "cross-host-divergence",
    description:
      "求值基线里 typeof process 为 'undefined'，剪枝后 Node 目标行为改变",
    foldPoint: "if (typeof process !== 'undefined') {}",
    source:
      '(function(){ var r = "unset"; if (typeof process !== "undefined") { r = "has-process"; } else { r = "no-process"; } return r; })()',
    folded: '(function(){ var r = "unset"; r = "no-process"; return r; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "node",
  },
  {
    caseId: "navigator-presence-pruned",
    category: "cross-host-divergence",
    description: "navigator 只存在于浏览器宿主，基线里缺失导致 Edge 目标行为改变",
    foldPoint: "if (typeof navigator !== 'undefined') {}",
    source:
      '(function(){ var r = "unset"; if (typeof navigator !== "undefined") { r = "has-navigator"; } else { r = "no-navigator"; } return r; })()',
    folded: '(function(){ var r = "unset"; r = "no-navigator"; return r; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "buffer-presence-pruned",
    category: "cross-host-divergence",
    description: "Buffer 只存在于 Node，基线里缺失导致 Node 目标行为改变",
    foldPoint: "if (typeof Buffer !== 'undefined') {}",
    source:
      '(function(){ var r = "unset"; if (typeof Buffer !== "undefined") { r = "has-buffer"; } else { r = "no-buffer"; } return r; })()',
    folded: '(function(){ var r = "unset"; r = "no-buffer"; return r; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "node",
  },
  {
    caseId: "localstorage-presence-pruned",
    category: "cross-host-divergence",
    description: "localStorage 只存在于浏览器宿主",
    foldPoint: "if (typeof localStorage !== 'undefined') {}",
    source:
      '(function(){ var r = "unset"; if (typeof localStorage !== "undefined") { r = "has-storage"; } else { r = "no-storage"; } return r; })()',
    folded: '(function(){ var r = "unset"; r = "no-storage"; return r; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "same-name-different-value",
    category: "cross-host-divergence",
    description: "同一个名字在基线与目标里语义不同：navigator 在基线里缺失、Edge 里是对象",
    foldPoint: "typeof navigator",
    source:
      '(function(){ try { return typeof navigator === "object" ? "object" : "other"; } catch (e) { return "threw:" + e.name; } })()',
    folded: '(function(){ return "other"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "console-type-pruned",
    category: "baseline-missing-target-present",
    description:
      "console 在 Node 与 Edge 都是对象，但求值基线里没有它——据基线剪枝会把目标端行为改掉",
    foldPoint: "typeof console",
    source: '(function(){ return typeof console; })()',
    folded: '(function(){ return "undefined"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "settimeout-callability-pruned",
    category: "baseline-missing-target-present",
    description: "setTimeout 在两个宿主里都可调用，但基线里不存在",
    foldPoint: "typeof setTimeout",
    source: '(function(){ return typeof setTimeout; })()',
    folded: '(function(){ return "undefined"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "timers-shared-semantics",
    category: "baseline-missing-target-present",
    description: "clearInterval 在两边宿主都可调用，基线里同样不存在",
    foldPoint: "typeof clearInterval",
    source: '(function(){ return typeof clearInterval; })()',
    folded: '(function(){ return "undefined"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "node",
  },

  // ── B 组：纯语言变换（oracle 应确认安全，不得一律报不安全）────────────
  {
    caseId: "pure-math-fold",
    category: "pure-language",
    description: "纯语言运算，任何目标环境下折叠都保语义",
    foldPoint: "Math.max(1, 2, 3)",
    source: "(function(){ return Math.max(1, 2, 3); })()",
    folded: "(function(){ return 3; })()",
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "pure-string-length",
    category: "pure-language",
    description: "字符串长度是语言语义，与宿主无关",
    foldPoint: '"abcdef".length',
    source: '(function(){ return "abcdef".length; })()',
    folded: "(function(){ return 6; })()",
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "pure-array-is-array",
    category: "pure-language",
    description: "Array.isArray 是语言内建",
    foldPoint: "Array.isArray([1, 2, 3])",
    source: "(function(){ return Array.isArray([1, 2, 3]); })()",
    folded: "(function(){ return true; })()",
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "typeof-math-stable",
    category: "pure-language",
    description: "typeof Math 在任何 ECMAScript 宿主里都是 object",
    foldPoint: "typeof Math",
    source: "(function(){ return typeof Math; })()",
    folded: '(function(){ return "object"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "pure-undefined-identity",
    category: "pure-language",
    description: "undefined 的语言语义跨宿主一致",
    foldPoint: "undefined === void 0",
    source: "(function(){ return undefined === void 0; })()",
    folded: "(function(){ return true; })()",
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },

  // ── C 组：纯语言但契约维度覆盖不全 —— 已知的过度保护面 ─────────────────
  {
    caseId: "pure-json-property-access",
    category: "contract-coverage",
    description:
      "纯语言表达式，但折叠点带属性访问，需要的可观察维度现有契约没有声明——考察是否被误拦",
    foldPoint: 'JSON.parse(\'{"a":1}\').a',
    source: '(function(){ return JSON.parse(\'{"a":1}\').a; })()',
    folded: "(function(){ return 1; })()",
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "pure-string-method-chain",
    category: "contract-coverage",
    description: "纯语言方法链，考察属性访问是否同样触发契约覆盖不足",
    foldPoint: '"  abc  ".trim().toUpperCase()',
    source: '(function(){ return "  abc  ".trim().toUpperCase(); })()',
    folded: '(function(){ return "ABC"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "pure-const-arithmetic",
    category: "contract-coverage",
    description: "无属性访问的纯算术，作为对照组",
    foldPoint: "(1 + 2) * 3",
    source: "(function(){ return (1 + 2) * 3; })()",
    folded: "(function(){ return 9; })()",
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },

  // ── D 组：被遮蔽 / 局部化的名字（折叠点必须自包含才测得到局部性）──────
  {
    caseId: "shadowed-window-local",
    category: "shadowed-binding",
    description: "window 被局部变量遮蔽，取值与宿主无关，折叠应保语义",
    foldPoint:
      '(function(){ var window = { kind: "local" }; return window.kind; })()',
    source:
      '(function(){ var window = { kind: "local" }; return window.kind; })()',
    folded: '(function(){ return "local"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "parameter-shadowing-process",
    category: "shadowed-binding",
    description: "process 作为函数参数传入，是局部绑定",
    foldPoint: '(function(process){ return typeof process; })("injected")',
    source:
      '(function(process){ return typeof process; })("injected")',
    folded: '(function(process){ return "string"; })("injected")',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
  {
    caseId: "stable-alias-to-host-root",
    category: "alias",
    description: "别名指向宿主根：值本身随宿主变化，折叠别名取值不安全",
    foldPoint:
      '(function(){ var nav = typeof navigator === "undefined" ? "missing" : "present"; return nav; })()',
    source:
      '(function(){ var nav = typeof navigator === "undefined" ? "missing" : "present"; return nav; })()',
    folded: '(function(){ return "missing"; })()',
    evaluatorRuntime: EVALUATION_BASELINE,
    targetRuntime: "edge",
  },
]);
