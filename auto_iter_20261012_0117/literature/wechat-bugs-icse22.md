# Characterizing and Detecting Bugs in WeChat Mini-Programs

- **元数据（CrossRef 按标题检索核验，2026-10-12）**：Tao Wang, Qingxin Xu, Xiaoning Chang, Wensheng Dou, Jiaxin Zhu, Jun Wei, Tao Huang（中国科学院大学）+ Jinhui Xie, Yuetang Deng, Jianbo Yang, Jiaheng Yang（腾讯）；**ICSE 2022**；DOI `10.1145/3510003.3510114`；pp. 363–375。
- **文献画像**：首个微信小程序 bug 实证研究：83 个真实 bug 的根因、影响与修复分析，并构建检测工具。腾讯联合署名，工业可信度高。
- **机理审视**：它确立"小程序存在平台特有语义与 bug 类型"这一经验事实——与 R97 的核心事故模型（`if (wx)` 在非微信环境被错误折叠）同属"宿主语义差异导致缺陷"的家族。待读全文核对：83 个 bug 的分类中是否含环境/条件 API 检查类——若有，是 R97 Motivation 的直接引证。
- **可借鉴点**：**写作引用**（Motivation/Related Work）：与 ASE 2020 工业实践互补——一个讲"怎么动态分析"，一个讲"bug 长什么样"；共同支撑"小程序生态需要宿主感知工具"的前提。
- **反衬点**：其检测工具面向运行时 bug，不做反混淆与折叠决策；无技术移植件。
- **落地建议**：进文献库，写作引用；标注"83 bug 分类与 R97 失败模式的重合度待读全文核对"。
