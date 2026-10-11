# Translation Validation for JIT Compiler in the V8 JavaScript Engine

- **元数据（CrossRef 按标题检索核验，2026-10-12；检索暗示"IEEE 期刊"有误，实为 ACM ICSE '24）**：Seungwan Kwon, Jaeseong Kwon, Wooseok Kang, Juneyoung Lee, Kihong Heo；**ICSE 2024**；DOI `10.1145/3597503.3639189`；pp. 1–12。
- **文献画像**：对 V8 JIT 编译器做 translation validation（TV）：不验证编译器整体，而是对**每一次具体编译实例**检查源程序与优化后程序语义一致，把验证问题从"证明变换器正确"降为"检查单次变换结果"。
- **机理审视**：TV 的奠基思想（Pnueli/Zuck 等）是"验证一次具体翻译 ≪ 验证整个编译器"。R97 的 Level-2 transformation oracle（`Obs(T(P), R_t) ≟ Obs(P, R_t)` 逐折叠点检查）与它是**同一结构**：都是 per-instance validation。关键差异在维度：TV 的源与目标在同一运行时（V8 内部），仿真关系/形式化证明可用；R97 的求值基线与目标环境是**不同宿主**，形式化等价在跨宿主下无法建立，只能降级为"观测等价"（existence/type/callability 投影 + 执行差分）——这正是 R97 的贡献空白所在。
- **可借鉴点**：**写作引用**（方法定位）：把 R97 的两级 oracle 接入 TV 学术脉络——"逐实例验证而非验证变换器"有 20 年传统（Pnueli/Zuck → V8 JIT TV）；同时用"TV 在同运行时内成立、跨宿主退化为观测等价"一句讲清 R97 与 TV 的分界，回应"为何不做形式化证明"的审稿质疑（R97 报告的是经验可复现的 0 实测不安全折叠 + 置信上界，不是数学证明，这与项目既有口径声明一致）。
- **反衬点**：其校验器技术（IR 映射与符号化检查）接近 v1 禁区（重型分析），坚决不引入；且它没有跨运行时维度。
- **落地建议**：进文献库，仅作写作引用与定位；不产生代码改动。
