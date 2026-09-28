/**
 * 讲清楚「第一步：绑定是否解析、是否动态」的最小对照表。
 *
 * 直接调用 analyzeAndDecide，打印每个例子的：
 *   bindingKind / resolutionStatus / aliasChain / requiredStatus / 决策状态
 *
 * 用法：node tools/demo-binding.mjs
 */
import { analyzeAndDecide } from "../src/pipeline.mjs";

const cases = [
  {
    name: "① 未遮蔽的宿主全局",
    source: "wx.request({ url: 'https://example.invalid' });",
  },
  {
    name: "② 局部变量遮蔽 wx",
    source: [
      "const wx = { request() {} };",
      "wx.request({ url: 'local' });",
    ].join("\n"),
  },
  {
    name: "③ 函数参数遮蔽 wx",
    source: [
      "function send(wx) {",
      "  wx.request({ url: 'local' });",
      "}",
    ].join("\n"),
  },
  {
    name: "④ 稳定别名继承宿主属性",
    source: ["const w = wx;", "w.request({ url: 'https://example.invalid' });"].join(
      "\n",
    ),
  },
  {
    name: "⑤ 常量属性名（有限常量传播）",
    source: ["const key = 'request';", "wx[key]({ url: 'x' });"].join("\n"),
  },
  {
    name: "⑥ 真动态属性访问",
    source: ["const key = getKey();", "wx[key]({});"].join("\n"),
  },
  {
    name: "⑦ 纯计算",
    source: "1 + 2;",
  },
  {
    name: "⑧ 别名被重新赋值",
    source: ["let w = wx;", "w = {};", "w.request({});"].join("\n"),
  },
];

for (const item of cases) {
  const result = analyzeAndDecide({
    source: item.source,
    filePath: "demo.js",
    targetRuntimeIds: [],
    targetRuntimeSource: "unknown",
  });
  console.log(`\n${item.name}`);
  console.log(`  源码: ${item.source.replaceAll("\n", " ⏎ ")}`);
  if (result.decisions.length === 0) {
    console.log("  → 没有产生运行时实体判定（纯语言表达式）");
    continue;
  }
  for (const decision of result.decisions) {
    const scope = decision.semanticContract.validityScope;
    console.log(
      [
        `  → 实体 ${decision.runtimeEntity.entityId}`,
        `binding=${decision.bindingRef.bindingKind}`,
        `resolution=${decision.bindingRef.resolutionStatus}`,
        `alias=[${decision.bindingRef.aliasChain.join(" → ")}]`,
        `requiredStatus=${scope.requiredRuntimeStatus ?? "null"}`,
        `决策=${decision.decision.knowledgeState}`,
      ].join("  "),
    );
  }
}
