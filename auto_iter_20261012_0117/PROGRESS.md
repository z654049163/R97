# R97 八小时自主迭代任务·进度日志

- 启动：2026-10-12 01:17（UTC+8）；截止：2026-10-12 09:17（UTC+8）
- 基线快照：`c3064fd9f70f40eb40ef04b33f0e310933f7b8d5`（仅本地，不推送）
- 基线测试：`npm test` 252 通过 / 0 失败（2026-10-12 01:24 实测）
- 章程：见同目录 `TASK_PLAN.md`（安全红线、三问过滤器、文献核验铁律、周期表）

---

## 周期 1（2026-10-12 01:17–02:0x，本会话执行）

- [x] 创建任务文件夹 `auto_iter_20261012_0117/`（literature/、proposals/）
- [x] 建立基线快照提交 `c3064fd`（含用户既有未提交工作，仅本地）
- [x] `npm test` 基线确认：252 全绿
- [x] 写入 TASK_PLAN.md 章程与本日志
- [x] 首轮文献检索（6 方向：JS 反混淆/小程序分析/混合应用桥/LLM 反混淆/混淆度量/环境指纹逃避）
- [x] 三件套核验并新增 3 篇论文（全部 CrossRef/arXiv 双通道当场核验）：
  - JsDeObsBench（CCS 2025, 10.1145/3719027.3744871）——混淆不变性威胁模型对标与写作引用
  - 微信动态分析工业实践（ASE 2020 Industry, 10.1145/3324884.3421842）——写作引用
  - HybriDroid（ASE 2016, 10.1145/2970276.2970368）——写作引用
  - **核验教训实证**：检索引擎给出的 3 个 DOI 有 2 个是错的（3324884.3416638→ChemTest；2970276.2970336→history slicing 论文），全部靠 CrossRef 按标题检索纠正——"当场核验"铁律有效
- [x] 文献笔记 3 份：`literature/{jsdeobsbench-ccs25, wechat-dynamic-analysis-ase20, hybridroid-ase16}.md`
- [x] 提案 3 份（只论证，本轮不实施）：
  - `proposals/P1-混淆不变性扩展为链式变换.md`（中等工作量，对标 CCS 2025 威胁模型，评测-only）
  - `proposals/P2-混淆不变性接入性能指标自动汇总.md`（**首选实施项**，第三十二轮遗留 TODO，风险最低）
  - `proposals/P3-浏览器宿主根集合扩展.md`（需先跑 host-attribution 实测，硬性前置门槛已写入）
- [x] 新条目按标准格式追加 `R97_已读文献库与技术借鉴全景录.md`（新增第四节，条目 13–15，目录索引已同步）
- [x] 设置自动化任务（每小时 :13 触发，共 8 次：02:13–09:13，截止 09:17 由章程兜底）

### 周期 2+ 建议

1. 首选实施 P2（最低风险、官方遗留 TODO）；随后按周期表推进 P1（小样本先试 debugProtection 可行性）与 P3（先测量后决定）。
2. 后续检索方向补充：混淆不变性/语义等价的形式化（translation validation 在 JS 的应用）、LLM 混淆（LLM-generated obfuscation 对混淆不变性基准的新威胁）、BridgeScope/小程序漏洞类顶会近作。
3. 所有真实微信/Edge 依赖的评测在无人值守时不跑（章程 §7）。

---

## 周期 2（2026-10-12 02:13–02:4x，自动化触发执行）

### 实施：P2 已落地（本周期唯一代码改动）

- `tools/performance-report.mjs` 四处修改：读取 `datasets/obfuscation-invariance/obfuscation-invariance.json`、并入 `performance-metrics.json`、新增"## 14. 混淆不变性基准"章节（总计 + 分生态分配置表 + 跨决策迁移/UNKNOWN→FOLD 汇总 + 来源与重生成命令）、§11 数据来源表补该产物行；产物缺失时输出缺失提示与重生成命令（不伪造数字）。
- 验证：生成 `R97_性能指标数据报告_2026-10-12.md`，新章节数字与第三十二轮产物逐项一致（4210 配对 / 85.84% / 不安全折叠 0 / PROTECT↔FOLD 迁移 0 / UNKNOWN→FOLD 38）；`npm test` 252 全绿。
- 提交：`aacba6f`（auto-iter2: 混淆不变性结果接入性能指标数据报告自动汇总）。

### 文献：新增 2 篇（CrossRef 当场核验，检索引擎给的 venue 又错了 2 处）

- **Translation Validation for JIT Compiler in the V8 JavaScript Engine**——实为 **ICSE 2024**（10.1145/3597503.3639189，Kwon/Kwon/Kang/Lee/Heo），检索暗示"IEEE 期刊"有误。写作定位：R97 Level-2 oracle 与 TV 同属 per-instance validation 传统；跨宿主使形式化等价退化为观测等价，正是 R97 空白。
- **BridgeScope**——实为 **RAID 2017**（10.1007/978-3-319-66332-6_7，Yang/Mendoza/Zhang/Gu，pp.143–166），检索给的"ASE 2018"是错的。写作定位：宿主能力暴露面谱系（HybriDroid→BridgeScope→ASE'20 微信→R97）。
- **过滤掉 1 个候选**："On Obfuscating JavaScript Code Using LLMs"（Chalmers）查实为硕士论文，权威性不足，按三问不进文献库。
- 全景录新增条目 16、17（第四节内），笔记见 `literature/{v8-translation-validation-icse24, bridgescope-raid17}.md`。

### 提案状态更新

- P2：**已完成并提交**。
- P1：补充"无人值守执行约束"——其完整验证依赖 Edge CDP，无人值守周期只允许代码改动 + npm test + 非 CDP 依赖的小样本试跑；完整重跑与数字更新留给用户在场时，未验证的数字不得进报告。
- P3：未动（需 host-attribution 实测，留周期 3+）。

### 周期 3+ 建议

1. 周期主题：宿主运行时与混合应用方向检索（补充 BridgeScope 已覆盖部分）；可评估 P3 前置测量 `npm run eval:host-attribution`（纯本地、无 CDP 依赖，可无人值守跑）。
2. P1 的 M3/M4 代码扩展可做，但按无人值守约束执行：只改代码 + npm test，不重跑完整基准、不写数字进报告。
3. 检索方向补充：小程序 API 演进/基础库版本画像相关近作（对应 22.52% 版本画像缺口）；semantic patch derivation / 折叠安全性相关 PL 论文。

---

## 周期 3（2026-10-12 03:13–03:5x，自动化触发执行）

### P3 前置测量分析（代码不动，符合硬性门槛第 5 条）

- `host-attribution-report.mjs` 第 60 行确认调用 `collectBrowserObservations`（Edge CDP）→ **无人值守不可重跑**，改用既有产物（356 根 / 17 候选，2026-09-23）做分类：
  - 微信侧 10 个：**全部不加**（第十五轮证伪：`wh`/`$gwx` 等为 wcc 编译产物文件内自赋值；`define`/`f`/`requireOnce` 应用自带；`__wxConfig` 强归属曾致 295 条错误放行）；
  - Edge 侧 7 个（`FileReader`/`Image`/`SVGRect`/`Window`/`close`/`stop`/`WebKitCSSMatrix`）：实测仅 Edge 存在且全部为平台能力；建议实施集合 6 个核心规范 API + `WebKitCSSMatrix` 单独决定；
  - 预期方向：UNKNOWN→PROTECT 的精度收益，不应产生新 FOLD；验证需 host-attribution + 主基准重跑（均依赖 CDP）→ **留待用户在场**。
- 全部分类、规范归属与验证门槛已写入 `proposals/P3-浏览器宿主根集合扩展.md` 的"测量结果"节。

### P1 受约束代码扩展（M3 配置）

- `src/evaluation/obfuscation-invariance.mjs` 新增 `M3-string-array-rc4`（M2 + rc4 字符串编码 + 索引位移 + 2 层 function 包装器；不含 debugProtection/selfDefending）。
- 选项名与取值域逐项对照本地 javascript-obfuscator@5.9.0 类型定义核实（`'rc4'`/`'function'` 均合法）；混淆器级冒烟通过（54ms 出码、`renameGlobals:false` 生效）；`npm test` 252 全绿。
- **完整基准重跑待用户在场**（Edge CDP 依赖）；数字未验证前不得进任何报告。M4（debugProtection）未加，可行性需在场试验。
- 提交：`facf6f5`。

### 文献：新增 2 篇（CrossRef 当场核验）

- **Characterizing and Detecting Bugs in WeChat Mini-Programs**——**ICSE 2022**（10.1145/3510003.3510114，中科院+腾讯 11 人，pp.363–375）。首个小程序 bug 实证研究，与 ASE 2020 工业实践互补的 Motivation 引证。
- **A Measurement Study of WeChat Mini-Apps**——**SIGMETRICS 2021 / PACMPER 5(2)**（10.1145/3460081，OSU Zhiqiang Lin 组，pp.1–25）。生态规模与 API 调用密度的第三方量化，与 JsDeObsBench 同组成谱系。
- 两篇"待读全文核对"点已用 UNVERIFIED 显式标注（83 bug 分类与环境嗅探统计）。全景录条目 18、19，笔记见 `literature/`。

### 评测注意事项更新（本周期发现）

- `npm run eval:host-attribution` **并非纯本地**（含 Edge CDP），已修正周期 2 的假设；无人值守期间任何依赖 CDP 的评测一律不跑。

## 周期 4（2026-10-12 04:13–04:3x，自动化触发执行）

### 文献：新增 2 篇（CrossRef 当场核验）+ 1 个幻觉题名拦截

- **Exploring the Potential of LLMs for Code Deobfuscation**——**DIMVA 2025**（10.1007/978-3-031-97620-9_15，CISPA+CEA List 九人，pp.267–286）。与 JsDeObsBench 并引，封住"反混淆器 LLM 化后 R97 是否过时"的质疑。检索给的作者名单不完整，CrossRef 实证 9 人。
- **An Empirical Study on the Effects of Obfuscation on Static ML-based Malicious JavaScript Detectors**——**ISSTA 2023**（10.1145/3597926.3598146，华科六人，pp.1420–1432）。"混淆 vs 静态分析鲁棒性"脉络：检测器退化是脆弱性证据，R97 的 0 不安全折叠是第一个守门安全结论。
- **拦截幻觉题名**："A Large-Scale Empirical Assessment of JavaScript Obfuscation" 经专门检索确认不存在（易与 Hammad/Garcia/Malek ICSE 2018 Android 测量研究混淆），未收录；已在全景录核验事件中记录。
- 全景录条目 20、21 + 核验事件；笔记见 `literature/{llm-deobfuscation-dimva25, obfuscation-vs-ml-detectors-issta23}.md`。

### 代码面：本周期无实施（按"宁可不改"原则）

- P3 被 CDP 验证门槛挡住（无人值守不可重跑 host-attribution/主基准）；无其他过三问的候选。周期 1–4 累计代码改动仅 P2（已落地）与 P1-M3 配置（待在场补跑基准），符合"正向收益、宁缺毋滥"要求。

### 周期 5+ 建议

1. 周期主题：防护与折叠策略相关（protection、bundling、capability 分析）或补洞周期——按章程周期表推进。
2. 文献面：候选还有 Herrera "Optimizing Away JavaScript Obfuscation"（arXiv:2009.09170，非顶会，三问评估后再定）与 Hammad ICSE 2018 Android 混淆测量（potency/cost 方法论，跨域类比慎引）。
3. 周期 8 收尾：task_report.md 汇总全部提交、文献、提案与"待用户在场执行"清单（P1 基准补跑、P3 验证、83-bug 分类核对）。

---

## 周期 5（2026-10-12 05:13–05:3x，自动化触发执行）

### 文献：新增 1 篇 + 一批候选被过滤（过滤记录全部留痕于全景录）

- **收录**：Optimizing Away JavaScript Obfuscation / SAFE-Deobs——**IEEE SCAM 2020**（10.1109/scam51674.2020.00029，pp.215–220，arXiv:2009.09170 双通道核实；venue 为工作会议、如实标注非 CCF-A）。价值：其核心操作正是 R97 守门的 CONST_EVAL，作为"反混淆器内部大量使用常量折叠"的工具证据，补全"混淆器—反混淆器—守门"链条引用面。条目 22。
- **过滤（三问/核验未过，未收录）**：
  - webcrack：社区工具，无同行评审论文；
  - "Understanding and Detecting Minification Bugs in JavaScript Minifiers" 与 "Minifying Bug Detection via LLM-based Test Generation"（检索称 ISSTA 2024）：CrossRef 查无，疑幻觉题名；
  - Hammad/Garcia/Malek ICSE 2018（Android 混淆测量）：跨域类比弱于已有 ISSTA 2023 条目。
- 笔记见 `literature/safe-deobs-scam20.md`。

### 代码面：本周期无实施

- 无新过三问的候选；P2/P1-M3 状态不变。任务启动以来代码改动仍为 2 处（均有验证背书），符合"正向收益、宁缺毋滥"。

### 周期 6–7 建议

1. 周期 6 按周期表是"已知边界实施"——但 P3 验证被 CDP 挡住、其他候选未过三问：预计为**纯检索+提案巩固**周期；可把前五个周期文献中浮现的写作级论点（混淆器—反混淆器—守门链条、TV 脉络、宿主能力谱系）整理进 task_report.md 草稿。
2. 若发现新的可无人值守验证的代码项（纯本地、有测试覆盖），仍按"小步+测试门禁"执行。
3. 周期 8 收尾：task_report.md 定稿（含"待用户在场执行"清单）。

---

## 周期 6（2026-10-12 06:13–06:3x，自动化触发执行）

### 威胁模型方向检索：1 个候选核验后被过滤（描述漂移拦截，第 6 处）

- **Unleash the Simulacrum**（USENIX Security 2022，Soroush Karami 等，UIC）——官方页核实其实际主题为**浏览器扩展指纹的防御**（"Shifting Browser Realities for Robust Extension-Fingerprinting Prevention"），与周期 1 检索摘要的描述（"evasion-resilient browser honeybags / 分析环境对 JS 指纹的韧性"）**存在主题漂移**。经三问评估：与 R97 的"黑灰产反沙箱逃逸"威胁模型契合度不足，**不收录**，已在全景录核验事件留痕。
- 本周期无新收录论文：现有条目 13–22 已覆盖写作所需的主要脉络，宁缺毋滥。

### task_report.md 草稿完成（周期 8 定稿的底稿）

- 新增 `auto_iter_20261012_0117/task_report.md`：提交链、代码改动清单与验证状态、文献资产表（条目 13–22 + 6 处核验拦截实证）、**四条写作级论点链**（混淆器—反混淆器—守门链条 / TV 观测等价脉络 / 宿主能力谱系 / 混淆 vs 静态鲁棒性）、**待用户在场执行清单**（P1 补跑、P3 实施验证、M4 试验、UNVERIFIED 核对）、安全红线遵守声明。

### 结构修复：PROGRESS.md 章节顺序

- 发现并修复前几轮追加编辑造成的章节错位（周期 5 记录被插到周期 4 之前、"周期 5+ 建议"重复两次）；现已恢复为周期 1→2→3→4→5→6 的时序结构。内容无丢失，仅顺序整理。

### 代码面：本周期无实施（正确行为）

- 无新过三问候选；任务启动以来代码改动仍为 2 处（均有验证背书）。

### 周期 7 建议

1. 文档质量收口：全景录目录索引与条目 13–22 的链接一致性核对、proposals 与 literature 交叉引用核对；低风险、纯任务文件夹与全景录目录层面。
2. 若出现新的可无人值守验证代码项再实施；否则维持零改动。
3. 周期 8：task_report.md 定稿 + 最终核对（提交链、测试状态、无未提交残留、删 LOCK）。
