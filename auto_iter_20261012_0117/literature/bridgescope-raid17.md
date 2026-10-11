# Precisely and Scalably Vetting JavaScript Bridge in Android Hybrid Apps (BridgeScope)

- **元数据（CrossRef 双通道核验，2026-10-12；注意：检索给出的"ASE 2018"是错的，CrossRef 实证为 RAID 2017）**：Guangliang Yang, Abner Mendoza, Jialong Zhang, Guofei Gu（Texas A&M）；**RAID 2017**（LNCS，Research in Attacks, Intrusions, and Defenses）；DOI `10.1007/978-3-319-66332-6_7`；pp. 143–166。
- **文献画像**：BridgeScope：对 Android 混合应用中 WebView 的 JavaScript bridge 做精确且可扩展的安全审查——静态分析 web 代码能触达哪些被 `addJavascriptInterface` 暴露的原生能力，检测暴露面漏洞。
- **机理审视**：核心对象是"宿主能力暴露面"——web 侧代码依赖哪些原生能力、原生侧暴露了什么。这与 R97 的 `required`（代码依赖哪些宿主能力）是同族概念，只是边界不同：BridgeScope 的边界是 JS↔Java 语言桥，R97 的边界是同语言不同宿主（Node/浏览器/微信）。它支撑了"宿主边界建模是混合生态安全的普遍前提"这一论点。
- **可借鉴点**：**写作引用**（Related Work 谱系）：HybriDroid（ASE'16，跨语言语义）→ BridgeScope（RAID'17，宿主能力暴露面）→ 微信动态分析工业实践（ASE'20，小程序生态）→ R97（反混淆折叠决策的宿主运行时感知）。这条谱系说明宿主感知不是 R97 发明的新需求，而是混合生态安全的既有主线，R97 补的是此前无人占据的位置：反混淆/折叠决策环节。
- **反衬点**：跨语言 taint 分析接近 v1 禁区，无技术移植件；引用保持一条 related work 句子的分量，避免过度引用。
- **落地建议**：进文献库，仅作写作引用；不产生代码改动。
