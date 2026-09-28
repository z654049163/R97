import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, "..", "build");
mkdirSync(outputDir, { recursive: true });

const W = 2080;
const H = 1180;
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
  { lineHeight = 34, size = 20, fill = C.sub, weight = 400 } = {},
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
  } = {},
) =>
  add(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ` +
      `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"` +
      `${filter ? ` filter="${filter}"` : ""}/>`,
  );

const path = (
  d,
  { stroke = C.slate, strokeWidth = 4, marker = "arrow-slate" } = {},
) =>
  add(
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" ` +
      `marker-end="url(#${marker})"/>`,
  );

const panel = (x, y, width, height, title, subtitle, color, tint) => {
  rect(x, y, width, height, {
    fill: C.white,
    stroke: color,
    strokeWidth: 2,
    filter: "url(#soft-shadow)",
  });
  rect(x, y, width, 92, { fill: tint, rx: 16 });
  rect(x, y + 76, width, 16, { fill: tint, rx: 0 });
  text(x + 24, y + 39, title, { size: 28, weight: 700, fill: color });
  text(x + 24, y + 72, subtitle, { size: 17, fill: C.sub, family: CODE });
};

const chip = (x, y, width, label, color, fill) => {
  rect(x, y, width, 42, { fill, stroke: color, strokeWidth: 1.5, rx: 12 });
  text(x + width / 2, y + 28, label, {
    size: 18,
    weight: 700,
    fill: color,
    anchor: "middle",
  });
};

const stepCard = (index, y, question, rule, chipLabel, chipColor, chipTint) => {
  const x = 910;
  const width = 1070;
  const height = 124;
  rect(x, y, width, height, {
    fill: C.white,
    stroke: C.slate,
    strokeWidth: 1.6,
    filter: "url(#soft-shadow)",
  });
  rect(x, y, 10, height, { fill: chipColor, rx: 5 });
  text(x + 34, y + 52, `${index}  ${question}`, {
    size: 24,
    weight: 700,
    fill: C.ink,
  });
  text(x + 34, y + 92, rule, { size: 18, fill: C.sub });
  chip(x + 720, y + 38, 320, chipLabel, chipColor, chipTint);
};

add(`<?xml version="1.0" encoding="UTF-8"?>`);
add(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `role="img" aria-labelledby="title description">`,
);
add(
  `<title id="title">R97 判定思路图</title>` +
    `<desc id="description">先做 AST 与绑定解析和 required 三态判定；目标未确认时只扩展候选环境并返回 UNKNOWN，只有 confirmed 目标与 definite required 真实冲突才 PROTECT，全部证据一致才 FOLD。</desc>`,
);
add(`<defs>
  <marker id="arrow-slate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.slate}"/></marker>
  <filter id="soft-shadow" x="-8%" y="-8%" width="116%" height="120%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0F172A" flood-opacity="0.09"/></filter>
</defs>`);

rect(0, 0, W, H, { fill: C.bg, rx: 0 });
text(72, 72, "R97 判定思路图", { size: 46, weight: 700, fill: C.ink });
text(
  72,
  114,
  "先判绑定与 required，再用外部证据确认目标；只有 confirmed 目标参与硬冲突判定。",
  { size: 23, fill: C.sub },
);

panel(
  70,
  200,
  380,
  700,
  "1  输入",
  "code + external evidence",
  C.blue,
  C.blueSoft,
);
text(96, 340, "待分析对象", { size: 21, weight: 700, fill: C.blue });
lines(96, 378, ["待折叠的 JavaScript 程序点", "依赖代码块与求值表达式"], {
  lineHeight: 34,
  size: 19,
});
add(
  `<line x1="96" y1="460" x2="424" y2="460" stroke="${C.line}" stroke-width="1.2"/>`,
);
text(96, 500, "外部目标证据", { size: 21, weight: 700, fill: C.blue });
lines(
  96,
  538,
  [
    "官方项目配置 / 部署配置",
    "实际运行轨迹 / 运行时指纹",
    "绑定当前文件、入口或产物",
    "需要多来源独立佐证",
  ],
  { lineHeight: 32, size: 17 },
);
add(
  `<line x1="96" y1="690" x2="424" y2="690" stroke="${C.line}" stroke-width="1.2"/>`,
);
text(96, 730, "代码符号只产生候选", { size: 19, weight: 700, fill: C.red });
lines(
  96,
  768,
  ["wx / window / process 不能确认目标，", "只能用来扩展候选环境。"],
  { lineHeight: 30, size: 16 },
);

panel(
  490,
  200,
  380,
  700,
  "2  AST 与绑定解析",
  "scope + alias + required",
  C.blue,
  C.blueSoft,
);
text(516, 340, "遮蔽、别名与实体", { size: 21, weight: 700, fill: C.blue });
lines(
  516,
  378,
  [
    "局部 / 参数 / 导入遮蔽 → not_required",
    "未遮蔽宿主全局、模块导入 → definite",
    "动态属性 / 无法解析作用域 → possible",
    "稳定别名继承宿主属性 → 仍 definite",
    "包装函数传参，仅静态属性 → not_required",
  ],
  { lineHeight: 28, size: 14 },
);
add(
  `<line x1="516" y1="548" x2="844" y2="548" stroke="${C.line}" stroke-width="1.2"/>`,
);
text(516, 588, "required 三态", { size: 19, weight: 700, fill: C.blue });
lines(
  516,
  624,
  [
    "definite：进入目标证据判定",
    "possible / ambiguous：直接 UNKNOWN",
    "not_required：走纯计算折叠分类",
  ],
  { lineHeight: 32, size: 15 },
);
add(
  `<line x1="516" y1="748" x2="844" y2="748" stroke="${C.line}" stroke-width="1.2"/>`,
);
text(516, 788, "状态只用于分档，不用于裁决", {
  size: 17,
  weight: 700,
  fill: C.slate,
});
lines(
  516,
  824,
  ["Resolver 的六态只影响证据分档；", "判定分支只看目标是否 confirmed。"],
  { lineHeight: 26, size: 14 },
);

stepCard(
  3,
  200,
  "绑定已解析且不是动态绑定？",
  "未解析、动态属性或无法确定的绑定直接返回 UNKNOWN",
  "否 → UNKNOWN",
  C.amber,
  C.amberSoft,
);
stepCard(
  4,
  344,
  "required runtime 是 definite？",
  "possible 的常见来源已被第 3 步拦截；此处兜底，非 definite → UNKNOWN",
  "兜底 → UNKNOWN",
  C.amber,
  C.amberSoft,
);
stepCard(
  5,
  488,
  "目标运行时已经 confirmed？",
  "未确认时只用 required 扩展候选环境，不因 mismatch 硬 PROTECT",
  "未确认 → UNKNOWN",
  C.amber,
  C.amberSoft,
);
stepCard(
  6,
  632,
  "confirmed 目标与 definite required 冲突？",
  "例如目标写死 Node，代码却依赖未遮蔽的 wx 宿主能力",
  "冲突 → PROTECT",
  C.red,
  C.redSoft,
);
stepCard(
  7,
  776,
  "证据比对",
  "缺证据 / 冲突 → UNKNOWN；观测差异 → PROTECT；全部一致 → FOLD",
  "一致 → FOLD",
  C.green,
  C.greenSoft,
);

path("M 450 550 H 490", { stroke: C.blue, marker: "arrow-slate" });
path("M 870 550 H 910", { stroke: C.blue, marker: "arrow-slate" });

rect(70, 915, 380, 62, {
  fill: C.white,
  stroke: C.line,
  strokeWidth: 1.4,
  rx: 12,
});
text(96, 953, "判定顺序固定，不跳过前一步。", { size: 16, fill: C.muted });

rect(910, 915, 1070, 62, {
  fill: C.white,
  stroke: C.line,
  strokeWidth: 1.4,
  rx: 12,
});
text(
  944,
  953,
  "Resolver 六态用于证据分档与审计，不改变上面的判定分支。",
  { size: 16, fill: C.muted },
);

rect(70, 1000, 1910, 120, {
  fill: C.white,
  stroke: C.slate,
  strokeWidth: 2,
  filter: "url(#soft-shadow)",
});
text(104, 1052, "最终动作", { size: 24, weight: 700, fill: C.slate });
chip(300, 1030, 380, "FOLD → ALLOW_FOLD", C.green, C.greenSoft);
chip(710, 1030, 470, "PROTECT → BLOCK_FOLD", C.red, C.redSoft);
chip(1210, 1030, 520, "UNKNOWN → BLOCK_FOLD", C.red, C.redSoft);
text(1748, 1048, "UNKNOWN 不等于安全，", { size: 16, fill: C.muted });
text(1748, 1076, "只是证据不足。", { size: 16, fill: C.muted });

add(`</svg>`);

const svg = parts.join("\n");
writeFileSync(resolve(here, "current-project-workflow.svg"), `${svg}\n`, "utf8");
writeFileSync(
  resolve(outputDir, "export.html"),
  `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>R97 判定思路图</title>
  <style>
    @page { size: 20.8in 11.8in; margin: 0; }
    html, body { width: 20.8in; height: 11.8in; margin: 0; padding: 0; overflow: hidden; background: #F8FAFC; }
    svg { display: block; width: 20.8in; height: 11.8in; }
  </style>
</head>
<body>
${svg}
</body>
</html>
`,
  "utf8",
);
