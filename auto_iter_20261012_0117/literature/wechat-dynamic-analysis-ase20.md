# Industry Practice of JavaScript Dynamic Analysis on WeChat Mini-Programs

- **元数据（CrossRef 按标题检索核验，2026-10-12；注意：搜索结果曾给出错误 DOI 10.1145/3324884.3416638，实际解析为 ChemTest，已弃用）**：Yi Liu, Jinhui Xie, Jianbo Yang, Shiyu Guo, Yuetang Deng（腾讯）、Shuqing Li, Yechang Wu, Yepang Liu（南科大）；**ASE 2020 Industry Track**；DOI `10.1145/3324884.3421842`；pp. 1189–1193。
- **文献画像**：腾讯工业实践报告：把学术界的 Jalangi 动态分析框架扩展后用于微信小程序缺陷诊断，说明小程序生态大到值得工业级动态分析投入。
- **机理审视**：它证明了两件 R97 关心的事：①微信小程序是"运行在微信自定义宿主上的 JavaScript"，与标准 Web/Node 环境存在真实差异（R97 的 target runtime 概念的工业佐证）；②纯动态分析在大规模小程序生态有成本与触达限制（要跑起来才能分析）。但它的用途是缺陷诊断，不是反混淆后的折叠安全。
- **可借鉴点**：**写作引用**（Motivation / Related Work）：用腾讯自己的工业实践佐证"小程序是独立运行时生态"，比 R97 自述更有说服力；并回答"为什么不用纯动态分析解决一切"——动态分析需要真实宿主执行，成本高、覆盖慢，且不能静态给出折叠决策。
- **反衬点**：技术层面无可移植件（Jalangi 动态插桩路线与 R97 的非破坏性只读探针是两个方向；R97 明确不执行被分析代码）。引用时避免被审稿人问"为什么不用 Jalangi"——答案是：折叠决策需要的是环境事实（existence/type/callability 投影），不是执行轨迹，且探针红线禁止副作用执行。
- **落地建议**：进文献库，仅作写作引用；不产生代码改动。
