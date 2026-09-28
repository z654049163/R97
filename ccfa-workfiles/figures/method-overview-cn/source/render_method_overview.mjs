import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const W = 2100;
const H = 1240;
const FONT =
  "Times New Roman, Microsoft YaHei, Noto Sans CJK SC, SimSun, sans-serif";
const CODE = 'Consolas, "Courier New", monospace';

const C = {
  ink: "#0F172A",
  sub: "#475569",
  muted: "#64748B",
  line: "#CBD5E1",
  bg: "#F8FAFC",
  white: "#FFFFFF",
  blue: "#1D4ED8",
  blueSoft: "#DBEAFE",
  teal: "#0F766E",
  tealSoft: "#CCFBF1",
  amber: "#B45309",
  amberSoft: "#FEF3C7",
  slate: "#334155",
  slateSoft: "#E2E8F0",
  green: "#15803D",
  greenSoft: "#DCFCE7",
  red: "#B91C1C",
  redSoft: "#FEE2E2",
};

const parts = [];
const add = (value) => parts.push(value);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const text = (
  x,
  y,
  value,
  {
    size = 22,
    weight = 400,
    fill = C.ink,
    anchor = "start",
    family = FONT,
  } = {},
) =>
  add(
    `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" ` +
      `text-anchor="${anchor}" font-family="${esc(family)}">${esc(value)}</text>`,
  );

const lines = (
  x,
  y,
  values,
  { lineHeight = 34, size = 19, fill = C.sub, weight = 400 } = {},
) => {
  values.forEach((value, index) => {
    text(x, y + index * lineHeight, value, { size, fill, weight });
  });
};

const rect = (
  x,
  y,
  width,
  height,
  {
    fill = C.white,
    stroke = "none",
    strokeWidth = 1,
    rx = 16,
    filter = null,
    dash = null,
  } = {},
) =>
  add(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ` +
      `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"` +
      `${dash ? ` stroke-dasharray="${dash}"` : ""}` +
      `${filter ? ` filter="${filter}"` : ""}/>`,
  );

const path = (
  d,
  { stroke = C.slate, strokeWidth = 4, marker = "arrow-slate", dash = null } = {},
) =>
  add(
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" ` +
      `marker-end="url(#${marker})"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
  );

const panel = (x, y, width, height, title, color, tint) => {
  rect(x, y, width, height, {
    fill: C.white,
    stroke: color,
    strokeWidth: 2,
    filter: "url(#soft-shadow)",
  });
  rect(x, y, width, 70, { fill: tint, rx: 16 });
  rect(x, y + 56, width, 14, { fill: tint, rx: 0 });
  text(x + 22, y + 42, title, { size: 25, weight: 700, fill: color });
};

const chip = (x, y, width, label, color, fill, size = 18) => {
  rect(x, y, width, 40, { fill, stroke: color, strokeWidth: 1.5, rx: 12 });
  text(x + width / 2, y + 27, label, {
    size,
    weight: 700,
    fill: color,
    anchor: "middle",
  });
};

add(`<?xml version="1.0" encoding="UTF-8"?>`);
add(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `role="img" aria-labelledby="title description">`,
);
add(
  `<title id="title">R97 模型图：目标运行时感知的折叠保护</title>` +
    `<desc id="description">代码先经过 AST 与绑定解析，再进入 Target Runtime Resolver；只有 confirmed 目标才允许硬冲突判断，corroborated、declared、inferred、conflict 和 unknown 只扩展候选环境或返回 UNKNOWN，最后对折叠点执行 FOLD、PROTECT 或 UNKNOWN 决策。</desc>`,
);
add(`<defs>
  <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.blue}"/></marker>
  <marker id="arrow-slate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.slate}"/></marker>
  <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.green}"/></marker>
  <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.red}"/></marker>
  <filter id="soft-shadow" x="-8%" y="-8%" width="116%" height="120%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0F172A" flood-opacity="0.09"/></filter>
</defs>`);

rect(0, 0, W, H, { fill: C.bg, rx: 0 });
text(70, 72, "R97 模型图：目标运行时感知的折叠保护", {
  size: 44,
  weight: 700,
  fill: C.ink,
});
text(
  70,
  113,
  "先判断代码真正运行在哪里，再决定每个折叠点需要什么证据，或者是否只能保守阻断。",
  { size: 22, fill: C.sub },
);

rect(70, 148, 1960, 88, {
  fill: "#FFF7ED",
  stroke: "#F59E0B",
  strokeWidth: 2,
  rx: 14,
});
text(98, 184, "核心问题", { size: 22, weight: 700, fill: "#7C2D12" });
text(
  210,
  184,
  "反混淆器的求值环境 ≠ 代码真正的目标环境；把求值结果直接折叠，可能改坏目标环境中的程序。",
  { size: 21, fill: "#7C2D12" },
);
text(98, 219, "结论条件", { size: 20, weight: 700, fill: "#9A3412" });
text(
  210,
  219,
  "只有外部证据确认的目标，或表达式本身不依赖宿主环境时，才允许折叠。",
  { size: 19, fill: "#9A3412" },
);

panel(70, 270, 330, 720, "AST 与绑定解析", C.blue, C.blueSoft);
lines(
  96,
  380,
  [
    "输入：代码与折叠点",
    "AST 解析",
    "作用域与遮蔽",
    "别名与赋值状态",
    "局部 / 参数 / 导入",
    "运行时全局",
  ],
  { lineHeight: 39, size: 18 },
);
add(
  `<line x1="96" y1="680" x2="374" y2="680" stroke="${C.line}" stroke-width="1.2"/>`,
);
text(96, 724, "输出：唯一运行时实体", {
  size: 19,
  weight: 700,
  fill: C.blue,
});
chip(96, 810, 278, "未解析 / 动态绑定 → 阻断", C.red, C.redSoft, 16);
text(96, 892, "先判断这个 wx 到底是谁，", { size: 17, fill: C.sub });
text(96, 919, "再判断它属于哪个平台。", { size: 17, fill: C.sub });

panel(440, 270, 350, 720, "Target Runtime Resolver", C.slate, C.slateSoft);
text(466, 380, "外部证据", { size: 19, weight: 700, fill: C.slate });
text(466, 418, "来源 / 部署 / 项目结构 / 用户指定", {
  size: 16,
  fill: C.sub,
});
lines(
  466,
  474,
  [
    "confirmed",
    "外部证据满足全部硬门槛",
    "",
    "未确认（其余五态）",
    "corroborated / declared /",
    "inferred / conflict / unknown",
    "只扩展候选环境，最多 UNKNOWN",
  ],
  { lineHeight: 36, size: 16 },
);
add(
  `<line x1="466" y1="850" x2="764" y2="850" stroke="${C.line}" stroke-width="1.2"/>`,
);
text(466, 889, "只有 confirmed 才可硬 PROTECT", { size: 16, fill: C.sub });
chip(466, 925, 298, "离散状态，不用概率 confidence", C.amber, C.amberSoft, 16);

panel(830, 270, 520, 720, "路线选择", C.teal, C.tealSoft);

const routeY = [378, 578, 778];
const routeStyles = [
  [C.teal, C.tealSoft],
  [C.amber, C.amberSoft],
  [C.slate, C.slateSoft],
];
const routeData = [
  [
    "confirmed target",
    ["平台、执行表面与版本已知", "检查真实目标证据", "真实冲突或缺证据 → 阻断"],
  ],
  [
    "目标未确认",
    ["corroborated / declared / inferred", "只扩展候选环境", "证据不足 → UNKNOWN"],
  ],
  [
    "conflict / unknown",
    ["没有可用目标：只放行纯计算", "不默认成 Node，也不任选平台", "宿主依赖和动态属性阻断"],
  ],
];
routeData.forEach(([title, body], index) => {
  const y = routeY[index];
  const [color, tint] = routeStyles[index];
  rect(860, y, 460, 166, {
    fill: tint,
    stroke: color,
    strokeWidth: 1.8,
    rx: 14,
  });
  text(884, y + 42, title, { size: 22, weight: 700, fill: color });
  lines(884, y + 82, body, { lineHeight: 32, size: 17, fill: C.sub });
});

panel(1390, 270, 640, 720, "折叠点分类与决策门", C.slate, C.slateSoft);

const decisionRows = [
  ["1 + 2", "纯常量计算", "FOLD", C.green, C.greenSoft],
  ["const k = \"request\"", "已知唯一局部常量", "FOLD", C.green, C.greenSoft],
  ["wx.request(...)", "运行时依赖（required）", "目标未 confirmed → UNKNOWN", C.amber, C.amberSoft],
  ["foo() / obj[key]", "无法证明纯度和唯一性", "PROTECT / UNKNOWN", C.red, C.redSoft],
];

decisionRows.forEach(([sample, label, action, color, tint], index) => {
  const y = 382 + index * 122;
  rect(1418, y, 584, 96, {
    fill: tint,
    stroke: color,
    strokeWidth: 1.6,
    rx: 13,
  });
  text(1442, y + 38, sample, {
    size: 18,
    weight: 700,
    fill: C.ink,
    family: CODE,
  });
  text(1442, y + 73, label, { size: 18, fill: C.sub });
  text(1978, y + 55, action, {
    size: 19,
    weight: 700,
    fill: color,
    anchor: "end",
  });
});

rect(1418, 884, 584, 74, {
  fill: C.white,
  stroke: C.slate,
  strokeWidth: 1.6,
  rx: 13,
});
text(1450, 929, "FOLD → ALLOW_FOLD", {
  size: 19,
  weight: 700,
  fill: C.green,
});
text(1740, 929, "PROTECT / UNKNOWN → BLOCK_FOLD", {
  size: 17,
  weight: 700,
  fill: C.red,
});

path("M 400 628 H 440", { stroke: C.blue, marker: "arrow-blue" });
path("M 790 628 H 830", { stroke: C.slate, marker: "arrow-slate" });
path("M 1350 628 H 1390", { stroke: C.teal, marker: "arrow-slate" });

rect(440, 1030, 1590, 120, {
  fill: C.white,
  stroke: C.line,
  strokeWidth: 1.6,
  rx: 14,
});
text(466, 1072, "证据来源", { size: 21, weight: 700, fill: C.slate });
chip(605, 1048, 260, "E1  语言基线", C.blue, C.blueSoft, 17);
chip(885, 1048, 230, "E2  Node", C.blue, C.blueSoft, 17);
chip(1135, 1048, 250, "E5  浏览器", C.blue, C.blueSoft, 17);
chip(1405, 1048, 340, "E4  微信开发者工具报告", C.blue, C.blueSoft, 17);
text(
  1780,
  1074,
  "只提供可追溯事实；没有证据就阻断。",
  { size: 18, fill: C.sub },
);
text(
  466,
  1124,
  "证据必须检查来源、作用域、有效期、冲突和契约覆盖，命中缓存仍要重新进入决策门。",
  { size: 17, fill: C.muted },
);

rect(70, 1030, 330, 120, {
  fill: "#FFFBEB",
  stroke: C.amber,
  strokeWidth: 1.6,
  rx: 14,
  dash: "8 7",
});
text(96, 1073, "实验旁路", { size: 20, weight: 700, fill: C.amber });
text(96, 1110, "缓存 / ML / LLM / 外部基线", {
  size: 17,
  fill: C.sub,
  family: CODE,
});
text(96, 1137, "只优化顺序和成本，不改变安全结论。", {
  size: 17,
  fill: C.sub,
});

text(
  1050,
  1200,
  "R97 只负责运行时语义兼容性；基础变换仍需检查语法、作用域和求值顺序。",
  { size: 18, fill: C.muted, anchor: "middle" },
);

add(`</svg>`);

const svg = parts.join("\n");
writeFileSync(resolve(here, "method-overview-cn.svg"), `${svg}\n`, "utf8");
writeFileSync(
  resolve(here, "export.html"),
  `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>R97 模型图：目标运行时感知的折叠保护</title>
  <style>
    @page { size: 21in 12.4in; margin: 0; }
    html, body { width: 21in; height: 12.4in; margin: 0; padding: 0; overflow: hidden; background: #F8FAFC; }
    img, svg { display: block; width: 21in; height: 12.4in; }
  </style>
</head>
<body>
  <img src="method-overview-cn.svg" alt="R97 模型图：目标运行时感知的折叠保护">
</body>
</html>
`,
  "utf8",
);
