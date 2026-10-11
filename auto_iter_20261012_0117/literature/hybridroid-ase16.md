# HybriDroid: Static Analysis Framework for Android Hybrid Applications

- **元数据（CrossRef 按标题检索核验，2026-10-12；注意：搜索结果曾给出错误 DOI 10.1145/2970276.2970336，实际解析为 Yi Li 等的 history slicing 论文，已弃用）**：Sungho Lee（KAIST）, Julian Dolby（IBM Research）, Sukyoung Ryu（KAIST）；**ASE 2016**；DOI `10.1145/2970276.2970368`；pp. 250–261。
- **文献画像**：首个面向 Android 混合应用（HTML5 + 原生）的静态分析框架。核心贡献是先厘清 Java/JS 经 WebView 桥（addJavascriptInterface 等）的互操作语义，再做跨语言分析。
- **机理审视**：它证明了"跨边界语义必须先显式建模才能做分析"——与 R97"宿主能力与纯语言内建必须正交分离"是同一哲学在不同场景的实例。但它的边界是**语言间桥**（Java↔JS），R97 的边界是**同语言不同宿主**（JS on Node vs JS on WeChat）；它的跨语言互操作语义建模不适用于 R97。
- **可借鉴点**：**写作引用**（Related Work 定位）：R97 之于"宿主运行时感知"，如同 HybriDroid 之于"混合应用感知"；且 R97 单语言、无跨语言分析负担，更轻量。可用于反驳"这不过是又一个大而全分析框架"的误解。
- **反衬点**：HybriDroid 走的是完整跨语言静态分析路线（重），接近 R97 v1 禁区（过程间分析）。坚决不引入其分析方法，只作定位参照。
- **落地建议**：进文献库，仅作写作引用；不产生代码改动。
