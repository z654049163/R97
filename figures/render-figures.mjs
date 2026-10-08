/**
 * 生成组会用图：
 *   R97-framework.svg       整体框架（静态侧 / 外部侧 / 决策 / 判卷验证）
 *   R97-decision-flow.svg   判定流程（八步优先级 + 三个出口）
 *
 * 数字取自 R97_项目完整报告_2026-09-24.md（2026-09-24 深夜重跑的当前口径）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const FONT = "'Microsoft YaHei','Segoe UI',Arial,sans-serif";

const C = {
  ink: "#0F172A",
  muted: "#475569",
  faint: "#64748B",
  line: "#CBD5E1",
  blue: "#1D4ED8",
  blueBg: "#EFF6FF",
  blueBorder: "#93C5FD",
  orange: "#C2410C",
  orangeBg: "#FFF7ED",
  orangeBorder: "#FDBA74",
  purple: "#6D28D9",
  purpleBg: "#F5F3FF",
  purpleBorder: "#C4B5FD",
  green: "#15803D",
  greenBg: "#F0FDF4",
  greenBorder: "#86EFAC",
  red: "#B91C1C",
  redBg: "#FEF2F2",
  redBorder: "#FCA5A5",
  gray: "#475569",
  grayBg: "#F8FAFC",
  grayBorder: "#CBD5E1",
  teal: "#0F766E",
  tealBg: "#F0FDFA",
  tealBorder: "#5EEAD4",
  // 模型图（R97-model.svg）专用：状态强度梯度与三值输出配色
  foldGreen: "#3FA34D",
  amber: "#D97706",
  tealSolid: "#0F9E8E",
  tealSoft: "#CCFBF1",
  skySoft: "#E0F2FE",
  skyBorder: "#7DD3FC",
  skyDeep: "#075985",
  redSoft: "#FEE2E2",
  slateSoft: "#F1F5F9",
  requiredStrong: "#3F4A5A",
  bandBlue: "#EAF2FB",
  bandBlueBorder: "#BFD7EE",
  bandGray: "#F4F6F8",
  bandGrayBorder: "#D8DEE6",
};

const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const text = ({
  x,
  y,
  content,
  size = 15,
  weight = 400,
  fill = C.ink,
  anchor = "start",
}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(content)}</text>`;

const lines = ({
  x,
  y,
  content,
  size = 15,
  weight = 400,
  fill = C.ink,
  anchor = "start",
  lineHeight = 22,
}) =>
  content
    .map((line, index) =>
      text({
        x,
        y: y + index * lineHeight,
        content: line,
        size,
        weight,
        fill,
        anchor,
      }),
    )
    .join("\n");

const box = ({
  x,
  y,
  w,
  h,
  fill = "#FFFFFF",
  stroke = C.line,
  rx = 8,
  sw = 1.5,
  dash = null,
}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${
    dash ? ` stroke-dasharray="${dash}"` : ""
  }/>`;

const arrow = ({ x1, y1, x2, y2, color = C.gray, width = 2, dash = null }) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" marker-end="url(#arrow-${color.replace("#", "")})"${
    dash ? ` stroke-dasharray="${dash}"` : ""
  }/>`;

const pathArrow = ({ d, color = C.gray, width = 2, dash = null }) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" marker-end="url(#arrow-${color.replace("#", "")})"${
    dash ? ` stroke-dasharray="${dash}"` : ""
  }/>`;

const markerDefs = () =>
  [...new Set(Object.values(C))]
    .map(
      (color) =>
        `<marker id="arrow-${color.replace("#", "")}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`,
    )
    .join("\n");

const svg = ({ width, height, title, desc, body }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
<title id="title">${esc(title)}</title>
<desc id="description">${esc(desc)}</desc>
<defs>
${markerDefs()}
<filter id="shadow" x="-6%" y="-6%" width="112%" height="116%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.07"/></filter>
</defs>
<rect width="${width}" height="${height}" fill="#FFFFFF"/>
${body}
</svg>
`;

const frameworkSvg = () => {
  const parts = [];

  parts.push(
    text({
      x: 60,
      y: 58,
      content: "R97：目标运行时感知的反混淆折叠保护",
      size: 34,
      weight: 700,
    }),
    text({
      x: 60,
      y: 92,
      content:
        "代码依赖什么（required）× 实际运行在哪（target）→ 三值决策 → 独立判卷验证",
      size: 17,
      fill: C.muted,
    }),
  );

  // 输入层
  parts.push(
    box({ x: 60, y: 116, w: 1800, h: 78, fill: C.grayBg, stroke: C.grayBorder }),
    text({
      x: 92,
      y: 150,
      content: "输入：反混淆器候选折叠点",
      size: 20,
      weight: 600,
    }),
    text({
      x: 92,
      y: 178,
      content:
        "常量求值 / 分支剪枝 / 调用求值 / 死代码删除　·　分析单位：单文件 AST",
      size: 15,
      fill: C.muted,
    }),
    text({
      x: 1828,
      y: 166,
      content: "跨模块依赖、函数返回值形状 → UNKNOWN",
      size: 15,
      fill: C.faint,
      anchor: "end",
    }),
  );

  parts.push(
    arrow({ x1: 490, y1: 194, x2: 490, y2: 220, color: C.blue }),
    arrow({ x1: 1430, y1: 194, x2: 1430, y2: 220, color: C.orange }),
  );

  // 静态侧
  parts.push(
    box({
      x: 60,
      y: 220,
      w: 860,
      h: 332,
      fill: C.blueBg,
      stroke: C.blueBorder,
    }),
    text({
      x: 90,
      y: 258,
      content: "静态侧 · required runtime：代码依赖什么",
      size: 19,
      weight: 700,
      fill: C.blue,
    }),
    box({ x: 90, y: 280, w: 240, h: 100 }),
    text({ x: 110, y: 318, content: "AST 与绑定解析", size: 17, weight: 600 }),
    lines({
      x: 110,
      y: 344,
      content: ["作用域 · 别名", "局部 / 参数 / 导入遮蔽"],
      size: 14,
      fill: C.muted,
      lineHeight: 22,
    }),
    box({ x: 350, y: 280, w: 240, h: 100 }),
    text({ x: 370, y: 318, content: "运行时实体识别", size: 17, weight: 600 }),
    lines({
      x: 370,
      y: 344,
      content: ["wx · window · process", "模块导入 → definite"],
      size: 14,
      fill: C.muted,
      lineHeight: 22,
    }),
    box({ x: 610, y: 280, w: 280, h: 100 }),
    text({ x: 630, y: 318, content: "required 三态", size: 17, weight: 600 }),
    text({
      x: 630,
      y: 348,
      content: "definite / possible / not_required",
      size: 14,
      fill: C.muted,
    }),
    box({
      x: 90,
      y: 402,
      w: 800,
      h: 126,
      fill: "#FFFFFF",
      stroke: C.blueBorder,
    }),
    lines({
      x: 112,
      y: 434,
      content: [
        "遮蔽：局部变量、函数参数、导入变量 → not_required",
        "别名：const w = wx → 继承宿主属性，仍是 definite",
        "动态：无法解析的作用域 / 动态属性 → possible",
      ],
      size: 15,
      fill: C.muted,
      lineHeight: 32,
    }),
  );

  // 外部侧
  parts.push(
    box({
      x: 1000,
      y: 220,
      w: 860,
      h: 332,
      fill: C.orangeBg,
      stroke: C.orangeBorder,
    }),
    text({
      x: 1030,
      y: 258,
      content: "外部侧 · target runtime：实际运行在哪",
      size: 19,
      weight: 700,
      fill: C.orange,
    }),
    box({ x: 1030, y: 280, w: 240, h: 100 }),
    text({ x: 1050, y: 318, content: "外部证据", size: 17, weight: 600 }),
    lines({
      x: 1050,
      y: 344,
      content: ["官方项目配置 · 部署配置", "运行轨迹 · 运行时指纹"],
      size: 14,
      fill: C.muted,
      lineHeight: 22,
    }),
    box({ x: 1290, y: 280, w: 240, h: 100 }),
    text({
      x: 1310,
      y: 314,
      content: "Target Runtime",
      size: 17,
      weight: 600,
    }),
    text({ x: 1310, y: 336, content: "Resolver", size: 17, weight: 600 }),
    text({
      x: 1310,
      y: 360,
      content: "族 · 表面 · 版本 · 作用域",
      size: 14,
      fill: C.muted,
    }),
    box({ x: 1550, y: 280, w: 280, h: 100 }),
    text({ x: 1570, y: 314, content: "目标状态（七态）", size: 17, weight: 600 }),
    lines({
      x: 1570,
      y: 340,
      content: [
        "confirmed / corroborated / declared",
        "inferred / context_unknown / conflict / unknown",
      ],
      size: 13,
      fill: C.muted,
      lineHeight: 22,
    }),
    box({
      x: 1030,
      y: 402,
      w: 800,
      h: 126,
      fill: "#FFFFFF",
      stroke: C.orangeBorder,
    }),
    lines({
      x: 1052,
      y: 434,
      content: [
        "代码里出现 wx 只产生候选，不能确认目标",
        "禁止循环论证：代码 → 推断目标 → 目标反过来验证代码",
        "confirmed 需要 ≥2 条独立、权威、绑定当前产物的证据",
      ],
      size: 15,
      fill: C.muted,
      lineHeight: 32,
    }),
  );

  // 汇聚到决策层
  parts.push(
    pathArrow({ d: "M 490 552 V 566 H 940 V 578", color: C.blue, width: 2.5 }),
    pathArrow({
      d: "M 1430 552 V 566 H 980 V 578",
      color: C.orange,
      width: 2.5,
    }),
  );

  // 决策层
  parts.push(
    box({
      x: 260,
      y: 580,
      w: 1400,
      h: 148,
      fill: C.purpleBg,
      stroke: C.purpleBorder,
    }),
    text({
      x: 290,
      y: 618,
      content: "决策引擎 · 证据门：顺序固定，不跳步",
      size: 19,
      weight: 700,
      fill: C.purple,
    }),
  );
  const steps = ["绑定解析", "契约覆盖", "required 三态", "target 状态", "证据比对", "三值输出"];
  steps.forEach((step, index) => {
    const x = 290 + index * 205;
    parts.push(
      box({ x, y: 636, w: 188, h: 54, fill: "#FFFFFF", stroke: C.purpleBorder }),
      text({
        x: x + 94,
        y: 670,
        content: step,
        size: 16,
        weight: 600,
        anchor: "middle",
      }),
    );
    if (index < steps.length - 1) {
      parts.push(
        arrow({ x1: x + 188, y1: 663, x2: x + 203, y2: 663, color: C.purple }),
      );
    }
  });
  parts.push(
    text({
      x: 290,
      y: 716,
      content:
        "只有 confirmed target + definite required + 真实冲突 → 硬 PROTECT；弱来源目标不硬保护",
      size: 15,
      fill: C.purple,
    }),
  );

  // 出口
  parts.push(
    pathArrow({ d: "M 960 728 V 744 H 480 V 762", color: C.gray }),
    pathArrow({ d: "M 960 728 V 762", color: C.gray }),
    pathArrow({ d: "M 960 728 V 744 H 1440 V 762", color: C.gray }),
    box({ x: 300, y: 762, w: 360, h: 92, fill: C.greenBg, stroke: C.greenBorder }),
    text({ x: 480, y: 800, content: "FOLD", size: 26, weight: 700, fill: C.green, anchor: "middle" }),
    text({ x: 480, y: 830, content: "ALLOW_FOLD", size: 16, fill: C.green, anchor: "middle" }),
    box({ x: 780, y: 762, w: 360, h: 92, fill: C.redBg, stroke: C.redBorder }),
    text({ x: 960, y: 800, content: "PROTECT", size: 26, weight: 700, fill: C.red, anchor: "middle" }),
    text({ x: 960, y: 830, content: "BLOCK_FOLD", size: 16, fill: C.red, anchor: "middle" }),
    box({ x: 1260, y: 762, w: 360, h: 92, fill: C.grayBg, stroke: C.grayBorder }),
    text({ x: 1440, y: 800, content: "UNKNOWN", size: 26, weight: 700, fill: C.gray, anchor: "middle" }),
    text({ x: 1440, y: 830, content: "BLOCK_FOLD（未知 ≠ 安全）", size: 16, fill: C.gray, anchor: "middle" }),
  );

  // 判卷层
  parts.push(
    box({
      x: 60,
      y: 878,
      w: 1800,
      h: 178,
      fill: C.tealBg,
      stroke: C.tealBorder,
    }),
    text({
      x: 90,
      y: 916,
      content: "独立判卷与验证层（不参与决策，只提供外部真值与回归）",
      size: 19,
      weight: 700,
      fill: C.teal,
    }),
  );
  const checks = [
    ["判卷探针", "一份实现跑四环境：语言 vm · Node · Edge · 微信 AppService"],
    ["实测差分真值", "208 实体 / 785 记录（含真实微信）"],
    ["变换执行验证", "386 条可执行 / 0 条行为不一致"],
    ["稳定性与变异", "微信重复观测差异 0 / 变异 20 断言全过"],
  ];
  checks.forEach(([title, detail], index) => {
    const x = 90 + index * 440;
    parts.push(
      box({ x, y: 932, w: 410, h: 66, fill: "#FFFFFF", stroke: C.tealBorder }),
      text({ x: x + 20, y: 958, content: title, size: 16, weight: 600 }),
      text({ x: x + 20, y: 982, content: detail, size: 13, fill: C.muted }),
    );
  });
  parts.push(
    box({ x: 90, y: 1012, w: 1740, h: 32, fill: "#FFFFFF", stroke: C.tealBorder }),
    text({
      x: 960,
      y: 1034,
      content:
        "3895 条实体分层样本：FOLD 1193（30.63%）· PROTECT 695 · UNKNOWN 2007；R97 放行落在实测差分上：0",
      size: 15,
      weight: 600,
      fill: C.teal,
      anchor: "middle",
    }),
  );

  return svg({
    width: 1920,
    height: 1080,
    title: "R97 整体框架",
    desc: "静态侧 required 分析、外部侧 target 解析、三值决策与独立判卷验证层的整体结构。",
    body: parts.join("\n"),
  });
};

const decisionSvg = () => {
  const parts = [];
  const stepX = 120;
  const stepW = 420;
  const unknownX = 620;
  const unknownW = 420;
  const protectX = 1120;
  const protectW = 420;

  parts.push(
    text({
      x: 60,
      y: 56,
      content: "R97 判定流程：顺序固定，弱目标不能提前硬保护",
      size: 32,
      weight: 700,
    }),
    text({
      x: 60,
      y: 88,
      content:
        "每一步先看“否”分支；UNKNOWN 和 PROTECT 的强制动作都是 BLOCK_FOLD",
      size: 16,
      fill: C.muted,
    }),
    box({
      x: 60,
      y: 106,
      w: 1560,
      h: 48,
      fill: C.purpleBg,
      stroke: C.purpleBorder,
    }),
    text({
      x: 840,
      y: 136,
      content:
        "①—③ 前置证据门　|　④ 早于 ⑤：target 未确认只做候选扩展　|　只有 confirmed + definite + 真实冲突才硬 PROTECT",
      size: 16,
      weight: 600,
      fill: C.purple,
      anchor: "middle",
    }),
  );

  const startY = 245;
  const gap = 88;
  const stepH = 60;
  const steps = [
    {
      n: "①",
      label: "绑定已解析且非动态？",
      yes: "是 ↓",
      no: ["绑定未解析 / 动态属性", "→ UNKNOWN"],
    },
    {
      n: "②",
      label: "契约覆盖完整？",
      yes: "是 ↓",
      no: ["契约缺可观察维度", "→ UNKNOWN"],
    },
    {
      n: "③",
      label: "required 是 definite？",
      yes: "是 ↓",
      no: ["possible / 模糊", "→ UNKNOWN"],
    },
    {
      n: "④",
      label: "target 达到 confirmed？",
      yes: "是 ↓",
      no: ["弱来源只扩展候选", "→ UNKNOWN（不硬保护）"],
    },
    {
      n: "⑤",
      label: "confirmed 与 definite required 冲突？",
      yes: null,
      no: ["无冲突 ↓", ""],
      protect: ["硬冲突", "→ PROTECT"],
    },
    {
      n: "⑥",
      label: "证据完整、有效、无冲突？",
      yes: "是 ↓",
      no: ["缺证据 / 过期 / 冲突", "→ UNKNOWN"],
    },
    {
      n: "⑦",
      label: "存在禁止副作用或已观测差异？",
      yes: null,
      no: ["无差异 ↓", ""],
      protect: ["副作用 / 语义不一致", "→ PROTECT"],
    },
    {
      n: "⑧",
      label: "全部目标观测一致？",
      yes: "是 ↓",
      no: ["仍有一致性缺口", "→ UNKNOWN"],
    },
  ];

  // 起始节点
  parts.push(
    box({ x: stepX, y: startY - 76, w: stepW, h: 56, fill: C.grayBg, stroke: C.grayBorder }),
    text({
      x: stepX + stepW / 2,
      y: startY - 41,
      content: "候选折叠点（已解析为独立表达式）",
      size: 17,
      weight: 600,
      anchor: "middle",
    }),
    arrow({ x1: stepX + stepW / 2, y1: startY - 20, x2: stepX + stepW / 2, y2: startY - 2 }),
  );

  steps.forEach((step, index) => {
    const y = startY + index * gap;
    const stepColor =
      step.n === "⑤" || step.n === "⑦" ? C.red : step.n === "⑧" ? C.green : C.blue;
    parts.push(
      box({
        x: stepX,
        y,
        w: stepW,
        h: stepH,
        fill: "#FFFFFF",
        stroke: stepColor,
        sw: 2,
      }),
      text({ x: stepX + 18, y: y + 26, content: step.n, size: 18, weight: 700, fill: stepColor }),
      text({
        x: stepX + 48,
        y: y + 37,
        content: step.label,
        size: 16,
        weight: 600,
      }),
    );

    if (step.protect) {
      parts.push(
        arrow({
          x1: stepX + stepW,
          y1: y + stepH / 2,
          x2: protectX,
          y2: y + stepH / 2,
          color: C.red,
          width: 2.5,
        }),
        box({
          x: protectX,
          y,
          w: protectW,
          h: stepH,
          fill: C.redBg,
          stroke: C.redBorder,
        }),
        text({ x: protectX + 20, y: y + 25, content: step.protect[0], size: 16, weight: 700, fill: C.red }),
        text({ x: protectX + 20, y: y + 47, content: step.protect[1], size: 15, fill: C.red }),
        text({
          x: stepX + stepW + 12,
          y: y + stepH / 2 - 8,
          content: "是",
          size: 14,
          weight: 700,
          fill: C.red,
        }),
      );
    } else {
      parts.push(
        arrow({
          x1: stepX + stepW,
          y1: y + stepH / 2,
          x2: unknownX,
          y2: y + stepH / 2,
          color: C.gray,
          width: 2,
        }),
        box({
          x: unknownX,
          y,
          w: unknownW,
          h: stepH,
          fill: C.grayBg,
          stroke: C.grayBorder,
        }),
        text({ x: unknownX + 20, y: y + 25, content: step.no[0], size: 15, weight: 600, fill: C.gray }),
        text({ x: unknownX + 20, y: y + 47, content: step.no[1] || "→ UNKNOWN", size: 15, fill: C.gray }),
        text({
          x: stepX + stepW + 12,
          y: y + stepH / 2 - 8,
          content: "否",
          size: 14,
          weight: 700,
          fill: C.gray,
        }),
      );
    }

    if (index < steps.length - 1) {
      parts.push(
        arrow({
          x1: stepX + stepW / 2,
          y1: y + stepH,
          x2: stepX + stepW / 2,
          y2: y + gap + 1,
          color: stepColor,
          width: 2,
        }),
        text({
          x: stepX + stepW / 2 + 10,
          y: y + stepH + 24,
          content: step.protect ? "否" : "是",
          size: 13,
          weight: 700,
          fill: step.protect ? C.gray : stepColor,
        }),
      );
    }
  });

  const exitY = startY + steps.length * gap + 8;
  parts.push(
    arrow({
      x1: stepX + stepW / 2,
      y1: startY + (steps.length - 1) * gap + stepH,
      x2: stepX + stepW / 2,
      y2: exitY - 2,
      color: C.green,
      width: 2.5,
    }),
    text({
      x: stepX + stepW / 2 + 10,
      y: exitY - 12,
      content: "是",
      size: 13,
      weight: 700,
      fill: C.green,
    }),
    box({ x: stepX, y: exitY, w: stepW, h: 72, fill: C.greenBg, stroke: C.greenBorder }),
    text({
      x: stepX + stepW / 2,
      y: exitY + 34,
      content: "FOLD → ALLOW_FOLD",
      size: 22,
      weight: 700,
      fill: C.green,
      anchor: "middle",
    }),
    text({
      x: stepX + stepW / 2,
      y: exitY + 58,
      content: "所有目标观测一致",
      size: 14,
      fill: C.green,
      anchor: "middle",
    }),
    box({ x: protectX, y: exitY, w: protectW, h: 72, fill: C.redBg, stroke: C.redBorder }),
    text({
      x: protectX + protectW / 2,
      y: exitY + 34,
      content: "PROTECT → BLOCK_FOLD",
      size: 22,
      weight: 700,
      fill: C.red,
      anchor: "middle",
    }),
    text({
      x: protectX + protectW / 2,
      y: exitY + 58,
      content: "真实冲突 / 禁止副作用 / 已观测差异",
      size: 14,
      fill: C.red,
      anchor: "middle",
    }),
    box({ x: unknownX, y: exitY, w: unknownW, h: 72, fill: C.grayBg, stroke: C.grayBorder }),
    text({
      x: unknownX + unknownW / 2,
      y: exitY + 34,
      content: "UNKNOWN → BLOCK_FOLD",
      size: 22,
      weight: 700,
      fill: C.gray,
      anchor: "middle",
    }),
    text({
      x: unknownX + unknownW / 2,
      y: exitY + 58,
      content: "证据不足时宁可折叠失败，也不放行",
      size: 14,
      fill: C.gray,
      anchor: "middle",
    }),
  );

  return svg({
    width: 1680,
    height: 1060,
    title: "R97 判定流程",
    desc: "八步判定优先级：绑定、契约、required 三态、target confirmed、硬冲突、证据、副作用、全一致。",
    body: parts.join("\n"),
  });
};

const modelSvg = () => {
  const W = 1780;
  const H = 1250;
  const parts = [];

  const plain = ({ x1, y1, x2, y2, color = C.ink, width = 2, dash = null }) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

  const stepBox = ({ x, y, w, h, content, size = 17, fill = "#FFFFFF", stroke = C.blueBorder }) => [
    box({ x, y, w, h, fill, stroke, rx: 8 }),
    text({ x: x + w / 2, y: y + h / 2 + 6, content, size, weight: 600, anchor: "middle" }),
  ];

  const stateRow = ({ x, y, w, h, name, token, fill, stroke, color, dash = null }) => [
    box({ x, y, w, h, fill, stroke, rx: 7, sw: 1.4, dash }),
    text({ x: x + 18, y: y + h / 2 + 5, content: name, size: 14.5, weight: 600, fill: color }),
    text({
      x: x + w - 18,
      y: y + h / 2 + 5,
      content: token,
      size: 12.5,
      fill: color,
      anchor: "end",
    }),
  ];

  parts.push(
    text({
      x: 980,
      y: 62,
      content: "R97：目标运行时感知的三值折叠判定模型",
      size: 34,
      weight: 700,
      anchor: "middle",
    }),
  );

  // 左侧留白条 + 禁止循环论证
  parts.push(
    box({ x: 30, y: 96, w: 150, h: 1118, fill: "#FFFFFF", stroke: "#E2E8F0", rx: 12, dash: "6 6" }),
    `<circle cx="105" cy="590" r="44" fill="none" stroke="#DC2626" stroke-width="9"/>`,
    `<line x1="74" y1="559" x2="136" y2="621" stroke="#DC2626" stroke-width="9"/>`,
    text({
      x: 105,
      y: 668,
      content: "禁止循环论证",
      size: 15,
      weight: 700,
      fill: C.red,
      anchor: "middle",
    }),
    text({
      x: 105,
      y: 692,
      content: "代码出现 wx",
      size: 12,
      fill: C.faint,
      anchor: "middle",
    }),
    text({
      x: 105,
      y: 710,
      content: "≠ 目标已确认",
      size: 12,
      fill: C.faint,
      anchor: "middle",
    }),
  );

  // 第一条横带：代码侧
  parts.push(
    box({ x: 210, y: 96, w: 1540, h: 320, fill: C.bandBlue, stroke: C.bandBlueBorder, rx: 12 }),
    text({ x: 240, y: 132, content: "代码侧（内部证据）", size: 19, weight: 700, fill: C.blue }),
    ...stepBox({ x: 250, y: 225, w: 190, h: 70, content: "混淆后的 JS" }),
    ...stepBox({ x: 470, y: 225, w: 200, h: 70, content: "AST 与绑定解析" }),
    ...stepBox({ x: 700, y: 225, w: 200, h: 70, content: "运行时实体识别" }),
    arrow({ x1: 442, y1: 260, x2: 466, y2: 260, color: C.blue }),
    arrow({ x1: 672, y1: 260, x2: 696, y2: 260, color: C.blue }),
    arrow({ x1: 902, y1: 260, x2: 984, y2: 260, color: C.blue }),
    box({ x: 990, y: 152, w: 470, h: 216, fill: "#FFFFFF", stroke: C.blueBorder, rx: 10 }),
    text({ x: 1014, y: 184, content: "必需运行时 required", size: 17, weight: 700 }),
    ...stateRow({
      x: 1010,
      y: 196,
      w: 430,
      h: 38,
      name: "确定依赖",
      token: "definite",
      fill: C.requiredStrong,
      stroke: C.requiredStrong,
      color: "#FFFFFF",
    }),
    ...stateRow({
      x: 1010,
      y: 240,
      w: 430,
      h: 38,
      name: "可能依赖",
      token: "possible",
      fill: "#FFFFFF",
      stroke: "#64748B",
      color: C.ink,
      dash: "7 5",
    }),
    ...stateRow({
      x: 1010,
      y: 284,
      w: 430,
      h: 38,
      name: "歧义依赖",
      token: "ambiguous",
      fill: C.slateSoft,
      stroke: "#94A3B8",
      color: C.ink,
      dash: "2 4",
    }),
    ...stateRow({
      x: 1010,
      y: 328,
      w: 430,
      h: 38,
      name: "不依赖",
      token: "not_required",
      fill: "#FFFFFF",
      stroke: C.bandBlueBorder,
      color: C.faint,
    }),
    text({
      x: 250,
      y: 350,
      content: "注：not_required = 未检出宿主依赖（派生状态）",
      size: 13,
      fill: C.faint,
    }),
    text({
      x: 250,
      y: 374,
      content: "possible / ambiguous 均不足以授权折叠，只能进入候选比较",
      size: 13,
      fill: C.faint,
    }),
  );

  // 第二条横带：判定核心
  parts.push(
    box({ x: 210, y: 440, w: 1540, h: 300, fill: "#FFFFFF", stroke: C.line, rx: 12 }),
    text({ x: 240, y: 476, content: "判定核心", size: 19, weight: 700 }),
    box({ x: 560, y: 565, w: 380, h: 74, fill: C.grayBg, stroke: C.grayBorder, rx: 8 }),
    text({ x: 580, y: 598, content: "语义契约 semantic contract", size: 16, weight: 700 }),
    text({ x: 580, y: 624, content: "由绑定解析与运行时实体识别产出", size: 13, fill: C.muted }),
    arrow({ x1: 940, y1: 602, x2: 984, y2: 602, color: C.gray }),
    box({ x: 990, y: 490, w: 470, h: 220, fill: "#F8FBFF", stroke: C.blueBorder, rx: 10, sw: 2 }),
    text({ x: 1014, y: 526, content: "判定函数 D", size: 20, weight: 700 }),
    text({
      x: 1014,
      y: 560,
      content: "D(必需, 目标, 契约) → { FOLD, PROTECT, UNKNOWN }",
      size: 16,
    }),
    text({ x: 1014, y: 586, content: "总函数 · 默认输出 UNKNOWN", size: 13, fill: C.muted }),
  );

  const bullets = [
    "已确认目标 + 确定依赖 + 真实冲突 → PROTECT",
    "全部目标契约一致且证据可折叠 → FOLD",
    "目标未确认或证据不足 → UNKNOWN",
  ];
  bullets.forEach((line, index) => {
    const baseline = 614 + index * 28;
    parts.push(
      box({ x: 1014, y: baseline - 11, w: 10, h: 10, fill: "#94A3B8", stroke: "#94A3B8", rx: 2, sw: 0 }),
      text({ x: 1032, y: baseline, content: line, size: 14 }),
    );
  });

  const outputs = [
    { label: "FOLD 折叠", y: 500, fill: C.foldGreen },
    { label: "PROTECT 保护", y: 575, fill: C.red },
    { label: "UNKNOWN 未决", y: 650, fill: C.amber },
  ];
  outputs.forEach((item) => {
    parts.push(
      box({ x: 1500, y: item.y, w: 240, h: 60, fill: item.fill, stroke: item.fill, rx: 8 }),
      text({
        x: 1620,
        y: item.y + 38,
        content: item.label,
        size: 19,
        weight: 700,
        fill: "#FFFFFF",
        anchor: "middle",
      }),
    );
  });

  parts.push(
    plain({ x1: 1460, y1: 605, x2: 1480, y2: 605 }),
    plain({ x1: 1480, y1: 530, x2: 1480, y2: 680 }),
    arrow({ x1: 1480, y1: 530, x2: 1496, y2: 530, color: C.ink }),
    arrow({ x1: 1480, y1: 605, x2: 1496, y2: 605, color: C.ink }),
    arrow({ x1: 1480, y1: 680, x2: 1496, y2: 680, color: C.ink }),
    text({
      x: 1470,
      y: 726,
      content: "三值输出互斥，未知不是安全",
      size: 12.5,
      fill: C.faint,
      anchor: "end",
    }),
    arrow({ x1: 1225, y1: 368, x2: 1225, y2: 486, color: C.blue, width: 2.5 }),
    arrow({ x1: 1225, y1: 806, x2: 1225, y2: 714, color: C.orange, width: 2.5 }),
  );

  // 第三条横带：证据侧
  parts.push(
    box({ x: 210, y: 764, w: 1540, h: 360, fill: C.bandGray, stroke: C.bandGrayBorder, rx: 12 }),
    text({ x: 240, y: 800, content: "证据侧（外部证据）", size: 19, weight: 700, fill: C.orange }),
    ...stepBox({ x: 250, y: 910, w: 190, h: 70, content: "项目与部署配置", size: 15 }),
    ...stepBox({ x: 470, y: 910, w: 220, h: 70, content: "运行轨迹与运行时指纹", size: 15 }),
    ...stepBox({ x: 720, y: 910, w: 210, h: 70, content: "目标运行时解析器", size: 15 }),
    arrow({ x1: 442, y1: 945, x2: 466, y2: 945, color: C.orange }),
    arrow({ x1: 692, y1: 945, x2: 716, y2: 945, color: C.orange }),
    arrow({ x1: 932, y1: 945, x2: 984, y2: 945, color: C.orange }),
    box({ x: 990, y: 800, w: 470, h: 296, fill: "#FFFFFF", stroke: C.orangeBorder, rx: 10 }),
    text({ x: 1014, y: 832, content: "目标运行时 target（七态）", size: 17, weight: 700 }),
  );

  const targetStates = [
    ["已确认", "confirmed", C.tealSolid, C.tealSolid, "#FFFFFF"],
    ["已佐证", "corroborated", C.tealSoft, C.tealBorder, C.teal],
    ["平台已知", "context_unknown", C.skySoft, C.skyBorder, C.skyDeep],
    ["仅声明", "declared", "#FFFFFF", C.line, C.muted],
    ["推断", "inferred", "#FFFFFF", "#94A3B8", C.muted],
    ["冲突", "conflict", C.redSoft, C.redBorder, C.red],
    ["未知", "unknown", C.slateSoft, C.line, C.faint],
  ];
  targetStates.forEach(([name, token, fill, stroke, color], index) => {
    parts.push(
      ...stateRow({
        x: 1010,
        y: 842 + index * 36,
        w: 430,
        h: 34,
        name,
        token,
        fill,
        stroke,
        color,
        dash: token === "inferred" ? "7 5" : null,
      }),
    );
  });
  parts.push(
    text({
      x: 1010,
      y: 1116,
      content: "只有 confirmed 有资格触发硬冲突 PROTECT；declared / inferred 只产生候选",
      size: 12.5,
      fill: C.faint,
    }),
  );

  // 安全不变量
  parts.push(
    box({ x: 210, y: 1148, w: 1540, h: 66, fill: C.bandBlue, stroke: C.bandBlueBorder, rx: 10 }),
    text({ x: 240, y: 1190, content: "安全不变量", size: 17, weight: 700, fill: C.blue }),
    plain({ x1: 705, y1: 1166, x2: 705, y2: 1196, color: C.bandBlueBorder }),
    plain({ x1: 1175, y1: 1166, x2: 1175, y2: 1196, color: C.bandBlueBorder }),
    text({ x: 545, y: 1190, content: "必需 ≠ 目标", size: 16, anchor: "middle" }),
    text({ x: 940, y: 1190, content: "弱来源不授权折叠", size: 16, anchor: "middle" }),
    text({ x: 1445, y: 1190, content: "默认目标 unknown", size: 16, anchor: "middle" }),
  );

  return svg({
    width: W,
    height: H,
    title: "R97 三值折叠判定模型",
    desc: "代码侧 required 三态、证据侧 target 七态、判定函数 D 的三值输出与安全不变量。",
    body: parts.join("\n"),
  });
};

const outputDir = path.resolve("figures");
mkdirSync(outputDir, { recursive: true });
writeFileSync(
  path.join(outputDir, "R97-framework.svg"),
  frameworkSvg(),
  "utf8",
);
writeFileSync(
  path.join(outputDir, "R97-decision-flow.svg"),
  decisionSvg(),
  "utf8",
);
writeFileSync(path.join(outputDir, "R97-model.svg"), modelSvg(), "utf8");
console.log(
  "已生成 figures/R97-framework.svg、figures/R97-decision-flow.svg 与 figures/R97-model.svg",
);
