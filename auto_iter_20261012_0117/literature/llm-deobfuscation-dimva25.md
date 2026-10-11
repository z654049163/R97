# Exploring the Potential of LLMs for Code Deobfuscation

- **元数据（CrossRef 按标题检索核验，2026-10-12；检索给的作者名单不完整，CrossRef 实证为 9 人）**：David Beste, Grégoire Menguy, Hossein Hajipour, Mario Fritz, Antonio Emanuele Cinà, Sébastien Bardin, Thorsten Holz, Thorsten Eisenhofer, Lea Schönherr（CISPA + CEA List）；**DIMVA 2025**（LNCS）；DOI `10.1007/978-3-031-97620-9_15`；pp. 267–286。
- **文献画像**：首个系统评估 LLM 做代码反混淆能力与局限的研究之一（CISPA/CEA List 多机构合作），与 JsDeObsBench（CCS 2025，条目 16）共同构成"LLM 反混淆"实证双支柱。
- **机理审视**：与 JsDeObsBench 同一威胁模型方向：下游反混淆器正在 LLM 化。R97 的守门位置在反混淆之后——无论反混淆器是规则引擎还是 LLM，"求值环境 ≠ 目标环境"的外推失效不因其变强而消失；反混淆质量只影响 R97 输入的干净程度，不影响折叠决策需要的环境事实。
- **可借鉴点**：**写作引用**（Related Work / Threat Model）：与 JsDeObsBench 并引，一句"反混淆能力演进（含 LLM 化）不改变 target-runtime 感知需求"即可封住"反混淆器会变强，R97 会不会过时"的质疑；多机构顶会背书增强该论断的权威性。
- **反衬点**：无跨运行时维度；LLM 不进入 R97 决策链（v1 禁区），仅作威胁模型背景。
- **落地建议**：进文献库，写作引用；不产生代码改动。
