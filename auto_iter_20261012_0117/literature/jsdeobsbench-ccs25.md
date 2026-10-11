# JsDeObsBench: Measuring and Benchmarking LLMs for JavaScript Deobfuscation

- **元数据（CrossRef + arXiv 双通道核验，2026-10-12）**：Guoqiang Chen, Xin Jin, Zhiqiang Lin（The Ohio State University）；**ACM CCS 2025**；DOI `10.1145/3719027.3744871`；arXiv:2506.20170（2025-06-25 提交）。
- **文献画像**：首个专门评测 LLM 做 JS 反混淆能力的基准。用 `javascript-obfuscator` 链式组合至多 7 种变换生成 3.6 万+ 可执行验证的混淆样本（含恶意样本），覆盖恶意性检测、程序恢复、漏洞发现三类任务。结论：GPT-4o 等在真实混淆代码上挣扎，传统工具 webcrack 在部分任务上反而满分。
- **机理审视**：与 R97 第三十二轮 obfuscation-invariance 用的是**同一个混淆器**（javascript-obfuscator），但其威胁模型是"链式至多 7 变换"，而 R97 目前只有 M1（字符串数组化）与 M2（+控制流平坦化 0.7+死代码 0.3）两档。它还确立了"执行可验证（execution-verifiable）"这一评测金标准——R97 的 Level-2 transformation oracle 正是同一路线。
- **可借鉴点**：
  1. **写作引用**（related work / threat model）：下游反混淆器正在 LLM 化，但无论反混淆器多强，"求值环境 ≠ 目标环境"的外推失效不会被反混淆本身解决——R97 的运行时守门与反混淆质量正交，这是论文定位的有力支撑；
  2. **基准扩展候选（提案 P1）**：把 obfuscation-invariance 的 M1/M2 扩展为链式变换（3–7 变换组合），与 CCS 2025 的威胁模型对齐，堵住"混淆档位太少"的审稿质疑；
  3. 其"链式变换 + 执行验证"协议可作为 R97 混淆不变性基准扩样时的方法论参照。
- **反衬点**：它测反混淆恢复质量，R97 测折叠决策安全——互补而非竞争；它没有跨运行时维度（求值与验证同环境），恰是 R97 的立论空白。
- **落地建议**：立即进文献库（写作引用）；P1 提案进 proposals/ 待实施验证。风险：链式变换会显著拉长混淆耗时（需 worker 超时保护，第三十二轮已有机制）。
