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
