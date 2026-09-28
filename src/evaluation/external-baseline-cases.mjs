export const EXTERNAL_BASELINE_CASES = Object.freeze([
  {
    caseId: "tool-safe-object-keys",
    category: "language",
    source: "Object.keys({ value: 1 });",
    rationale: "标准语言内建，可在三端稳定执行",
  },
  {
    caseId: "tool-safe-array-is-array",
    category: "language",
    source: "Array.isArray([1, 2, 3]);",
    rationale: "标准语言内建，可在三端稳定执行",
  },
  {
    caseId: "tool-safe-math-max",
    category: "language",
    source: "Math.max(1, 2, 3);",
    rationale: "纯数值计算，Terser 通常会进行常量折叠",
  },
  {
    caseId: "tool-safe-json-parse",
    category: "language",
    source: "JSON.parse('{\"value\":1}');",
    rationale: "标准语言内建，可在三端稳定执行",
  },
  {
    caseId: "tool-node-process-version",
    category: "node",
    source: "process.version;",
    rationale: "process 只存在于 Node，浏览器和语言基线不应折叠",
  },
  {
    caseId: "tool-node-buffer-hex",
    category: "node",
    source: "Buffer.from(\"abc\").toString(\"hex\");",
    rationale: "Buffer 只存在于 Node，是跨运行时差异案例",
  },
  {
    caseId: "tool-browser-window-document",
    category: "browser",
    source: "window.document;",
    rationale: "window/document 只存在于浏览器",
  },
  {
    caseId: "tool-browser-navigator-user-agent",
    category: "browser",
    source: "navigator.userAgent;",
    rationale: "导航器标识随宿主变化，不应跨运行时折叠",
  },
  {
    caseId: "tool-host-timer-type",
    category: "host_global",
    source: "typeof setTimeout;",
    rationale: "定时器不是 ECMAScript 语言基线的一部分",
  },
  {
    caseId: "tool-terser-guarded-process",
    category: "terser",
    source: "typeof process !== \"undefined\" ? process.version : null;",
    rationale: "环境判断代码用于观察压缩器是否保留跨运行时保护",
  },
  {
    caseId: "tool-terser-guarded-window",
    category: "terser",
    source: "typeof window !== \"undefined\" ? window.document : null;",
    rationale: "环境判断代码用于观察压缩器是否保留跨运行时保护",
  },
  {
    caseId: "tool-webcrack-safe-math",
    category: "webcrack",
    source:
      "var arr = [\"Math\", \"max\"]; globalThis[arr[0]][arr[1]](1, 2, 3);",
    rationale: "Webcrack 可恢复字符串数组中的标准语言 API",
  },
  {
    caseId: "tool-webcrack-node-process",
    category: "webcrack",
    source:
      "var arr = [\"process\", \"version\"]; globalThis[arr[0]][arr[1]];",
    rationale: "Webcrack 可恢复字符串数组中的 Node API",
  },
  {
    caseId: "tool-webcrack-browser-window",
    category: "webcrack",
    source:
      "var arr = [\"window\", \"document\"]; globalThis[arr[0]][arr[1]];",
    rationale: "Webcrack 可恢复字符串数组中的浏览器 API",
  },
  {
    caseId: "tool-unverified-network-fetch",
    category: "side_effect",
    source: "fetch(\"https://example.invalid\");",
    executionPolicy: "do-not-execute",
    unverifiedReason: "存在网络副作用，受控差分器不会执行该表达式",
    rationale: "用于观察工具是否会在缺少行为证据时直接接受变换",
  },
  {
    caseId: "tool-unverified-wechat-request",
    category: "wechat",
    source:
      "wx.request({ url: \"https://example.invalid\" });",
    requiredRuntimes: ["language", "node", "edge", "wechat"],
    executionPolicy: "do-not-execute",
    unverifiedReason: "缺少可执行的真实微信运行时，不能伪造微信调用结果",
    rationale: "用于观察工具是否会错误接受微信宿主 API",
  },
  {
    caseId: "tool-unverified-dynamic-property",
    category: "dynamic",
    source: "globalThis[globalThis.__r97_key__]();",
    executionPolicy: "do-not-execute",
    unverifiedReason: "动态属性无法在执行前确定目标，可能触发任意宿主 API",
    rationale: "用于观察工具是否会把动态调用当作可安全折叠代码",
  },
]);
