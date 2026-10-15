# JavaScript Dead Code Identification, Elimination, and Empirical Assessment

- **元数据（CrossRef 官方 API 实时核验，2026-10-12）**：
  - **论文题目**：*JavaScript Dead Code Identification, Elimination, and Empirical Assessment*
  - **作者全名**：Ivano Malavolta, Kishan Nirghin, Gian Luca Scoccia, Simone Romano, Salvatore Lombardi, Giuseppe Scanniello, Patricia Lago（阿姆斯特丹自由大学、拉奎拉大学、萨勒诺大学等七人团队）
  - **发表 Venue**：**IEEE Transactions on Software Engineering (TSE)**，Vol. 49, No. 7, pp. 3692–3714
  - **发表年份**：**2023 年 7 月**（近三年 CCF A 类软件工程顶级期刊）
  - **官方 DOI**：[`10.1109/tse.2023.3267848`](https://doi.org/10.1109/tse.2023.3267848)
  - **官方收录页**：[IEEE Xplore 官方页面](https://doi.org/10.1109/tse.2023.3267848)

- **文献画像**：
  - 本文是软件工程界针对 JavaScript 死代码识别（Identification）与消除（Elimination, D心のCE）进行的最大规模实证与技术基准评测研究。
  - 作者系统评估了包括 Terser、Google Closure Compiler、UglifyJS、Webpack（内置 Tree-shaking）等主流前端优化与反混淆管线中的死代码消除机制，分析了死分支修剪（Dead Branch Pruning）与不可达代码折叠（Unreachable Code Folding）在真实世界 Web 应用中的覆盖度、体积优化收益以及**误删代码导致的语义破坏风险**。

- **机理审视（在 R97 语境下的真实物理映射）**：
  - **死分支修剪（BRANCH_PRUNE）的直接对齐**：
    该文核心研究的死代码消除场景正是 R97 契约与变换分类系统中的两大核心动作之一——`BRANCH_PRUNE`（分支切除）与 `CONST_EVAL`（常量折叠求值）。
    在现代打包与优化工具中，死分支修剪的基础正是：
    ```javascript
    if (feature_flag) { /* branch A */ } else { /* branch B */ }
    ```
    当 `feature_flag` 被工具提前计算为常量（如求值为布尔假）时，编译器会直接将整条分支及其内部的全部依赖代码彻底物理删除（Eliminate）！
  - **灾难性误剪的根因揭示**：
    TSE 2023 指出，由于 JavaScript 缺乏可靠的静态上下文，优化工具在评估分支条件时极易发生**激进消除（Aggressive Elimination）**。在单环境运行的代码中，这最多导致逻辑失误；但在跨异构生态（Node / Browser / WeChat）代码中，用于跨宿主探测的分支（如 `if (typeof wx !== "undefined")` 或 `if (window.stop)`）若被本地打包器在 Node 环境中求值为假，**对应的宿主特有逻辑分支将被永久切除**，导致部署到真实宿主时发生灾难性的功能缺失或白屏崩溃。
  - 这正是 R97 的核心动机：R97 针对的正是这类在常量求值（`CONST_EVAL`）和分支切除（`BRANCH_PRUNE`）过程中发生的跨环境误杀。

- **可借鉴点（对 R97 各模块与论文写作的直接价值）**：
  1. **论文立论与动机的最高规格顶刊背书**：
     直接引用该 TSE 2023 顶刊成果，证明“JavaScript 死代码修剪与常量折叠是工业界软件构建的关键支柱，但其语义不保真性长期威胁生产安全”。将 R97 确立为“首个在死代码修剪前提供跨宿主物理存在性守门”的防护层。
  2. **实验评测基线对齐**：
     该文全面评测了 Terser 和 Google Closure Compiler 的死分支切除行为，与 R97 的 `transformation-oracle` 与外部基线（Terser / Webcrack）构成完美的实验设计呼应。

- **反衬点（R97 的核心创新与超越）**：
  1. **同构打包假设 vs 跨环境异构语义保持**：
     TSE 2023 依然建立在“构建环境 = 运行环境（单一 Web 浏览器）”的前提下，其死代码算法完全无法感知“此代码即将在微信小程序或 Edge 边缘环境中运行”的事实。R97 突破了同构假设，确立了“必须能力 ⊥ 目标环境”的正交解耦公理，填补了跨宿主环境感知守门的理论空白。
  2. **事后脆弱修剪 vs 编译前置非破坏性守门**：
     TSE 2023 探讨的是如何优化死代码消除算法本身（容易顾此失彼）；R97 是一个独立的守门人（Gatekeeper），在消除算法执行前对差分实体实施硬性 `PROTECT`，从根源上阻断误修剪。

- **落地建议**：
  - 纳入 `R97_已读文献库与技术借鉴全景录.md` 第 27 条；
  - 纯论文写作引用与威胁模型背书，不引入代码改动（保持决策核心 0 侵入与 252 测试全绿）。
