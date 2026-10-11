# A Measurement Study of WeChat Mini-Apps

- **元数据（CrossRef 按标题检索核验，2026-10-12）**：Yue Zhang, Bayan Turkistani, Allen Yuqing Yang, Chaoshun Zuo, Zhiqiang Lin（The Ohio State University）；**PACMPER Vol.5 Issue 2（SIGMETRICS 2021 研究轨）**；DOI `10.1145/3460081`；pp. 1–25。
- **文献画像**：对微信小程序生态的大规模测量：包体积、宿主 API 调用密度（每应用数百次 API 调用）、资源加载与安全隐私面。OSU Zhiqiang Lin 组——与 JsDeObsBench（CCS 2025）同组，两文构成"小程序生态测量 → LLM 反混淆评测"的谱系。
- **机理审视**：它量化了 R97 前提的生态事实：宿主 API 调用密度高、生态规模大——说明 required 实体（宿主依赖）在真实小程序中无处不在，target-runtime 感知的受益面大。其"解包大规模小程序语料"的方法论与 R97 的 1572 项目语料同型。
- **可借鉴点**：**写作引用**（Motivation：用独立第三方测量佐证生态规模与 API 密度；Related Work：小程序分析线）。若其测量含"条件 API 检查/环境嗅探"比例，可直接支撑"环境嗅探表达式占破坏性折叠 95%+"的 R97 数据的普遍性（待读全文核对）。
- **反衬点**：纯测量视角，不区分 required/target，不做决策；无技术移植件。
- **落地建议**：进文献库，写作引用；标注"环境嗅探类统计待读全文核对"。
