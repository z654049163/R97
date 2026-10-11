# Optimizing Away JavaScript Obfuscation (SAFE-Deobs)

- **元数据（arXiv 页面 + CrossRef 双通道核验，2026-10-12）**：Adrian Herrera（独立作者）；**IEEE SCAM 2020**（20th International Working Conference on Source Code Analysis and Manipulation——**工作会议，非 CCF-A**，引用时如实标注）；DOI `10.1109/scam51674.2020.00029`；pp. 215–220；arXiv:2009.09170。
- **文献画像**：SAFE-Deobs：用编译器理论的静态分析（常量传播/折叠等）自动反混淆恶意 JS，帮助分析者快速理解脚本意图；真实恶意样本案例研究验证实用性。
- **机理审视**：它的核心操作是常量折叠/传播——**正是 R97 守门的 CONST_EVAL 变换**。这条工具链证据说明：反混淆器产出的"常量"普遍来自跨环境敏感的折叠操作，而折叠正确性此前默认"环境一致"，R97 恰好补上这一门。
- **可借鉴点**：**写作引用**（Related Work 反混淆工具线）：作为"反混淆器内部大量使用常量折叠"的工具证据，与 OBsmith（混淆器侧测试）、JsDeObsBench/DIMVA（LLM 反混淆）共同覆盖"混淆器—反混淆器—守门"链条的各环节。
- **反衬点**：单运行时假设（与 OBsmith 同一局限，正好反衬 R97 跨环境立论）；venue 分量一般，只作辅助引用。
- **落地建议**：进文献库（基石/工具类），如实标注 venue 等级；不产生代码改动。
