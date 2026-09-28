# R97 项目指令

本目录是 R97：目标运行时感知的反混淆折叠保护工具。开始任何任务前：

1. 先读 `项目记忆与交接.md`，它记录当前状态、已定案决策、已知漂移、未完成项和历史对话索引。
2. 再按任务需要读技术基准 `技术路线消融与组件取舍.md` 和 `实验报告_实现与性能测试.md`。
3. 历史讨论细节查 `决策记录_v4_六项已定案.md`、`论文支撑与可借鉴技术分析.md`、`扩展论文检索与技术支撑.md`、`数据来源与外部语料扩充.md`。

必须遵守的核心不变量：

- `required runtime`（代码依赖什么宿主能力）与 `target runtime`（代码实际部署或运行的环境）严格分离。
- target 只能来自被分析代码之外的外部证据；代码里出现 `wx` 只产生 required，不能用来确认 target。
- 只有 `confirmed target + definite required + 真实冲突` 才硬 `PROTECT`；`declared`、`inferred`、`experiment_config` 不能授权 `FOLD`，也不能单独触发硬 `PROTECT`。
- 纯 JavaScript、局部变量、被遮蔽的宿主 API 不加入 required；稳定别名可以继承宿主属性。
- 不引入完整数据流分析、过程间分析或大型 API 知识库，保持 v1 简洁。

修改代码后运行 `npm test`（当前 111 项通过）。
