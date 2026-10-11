# R97 八小时自主迭代任务·总报告（草稿 v0.9，周期 8 定稿）

- 任务窗口：2026-10-12 01:17 – 09:17（UTC+8）；自动化：每小时 :13 触发、共 8 次（automation-682f1b67）
- 回退基线：`c3064fd`（含任务启动时全部工作区状态；`git reset --hard c3064fd` 可整体回退，仅用户明确要求时执行）
- 本报告由周期 6 起草、周期 8 定稿；周期 7 的增量由下轮追加。

## 一、提交链（全部仅本地，绝不 push）

| 提交 | 内容 |
|---|---|
| `c3064fd` | 基线快照（含用户既有未提交工作） |
| `4936ac0` | auto-iter1：任务章程/进度日志/首轮文献 3 篇/提案 3 份 |
| `aacba6f` | auto-iter2：**P2 落地**——混淆不变性接入性能指标数据报告（npm test 252 全绿） |
| `0eaa335` | auto-iter2：文献 V8 TV（ICSE'24）、BridgeScope（RAID'17）；P1 补无人值守约束 |
| `facf6f5` | auto-iter3：**P1-M3 配置**（选项对照 obfuscator@5.9.0 类型核实+冒烟）；P3 前置测量结果 |
| `ad6fe1e` | auto-iter3：文献 小程序 bug 实证（ICSE'22）、生态测量（SIGMETRICS'21） |
| `4304b04` | auto-iter4：文献 LLM 反混淆（DIMVA'25）、混淆 vs 检测器（ISSTA'23）；拦截幻觉题名 |
| `be2c7d8` | auto-iter5：文献 SAFE-Deobs（SCAM'20）；webcrack/跨域候选过滤留痕 |
| （周期 6+） | task_report 草稿、Simulacrum 过滤留痕等 |

## 二、代码改动清单（累计 2 处，宁缺毋滥）

1. **P2（已完成闭环）**：`tools/performance-report.mjs` —— 混淆不变性产物接入自动汇总，新增报告第 14 节；产物 `R97_性能指标数据报告_2026-10-12.md` 数字与 `datasets/obfuscation-invariance/` 逐项一致；npm test 252 全绿。
2. **P1-M3（代码就绪，产物待补跑）**：`src/evaluation/obfuscation-invariance.mjs` 新增 `M3-string-array-rc4` 配置（M2 + rc4 字符串编码 + 索引位移 + 双层 function 包装器；不含 debugProtection/selfDefending）。选项名/取值域对照本地 obfuscator@5.9.0 类型定义逐项核实；混淆器级冒烟通过。**完整基准重跑需 Edge CDP → 留待用户在场；数字未验证前不得进任何报告。**
3. **未动**：决策引擎、探针、证据链路零改动；`dropAbsence`/非对称外推铁律未被触碰。

## 三、文献资产（全景录条目 16–25，全部 CrossRef/arXiv/官方页当场核验）

| # | 论文 | Venue（实证） | 对 R97 的价值 |
|---|---|---|---|
| 16 | JsDeObsBench | CCS 2025 | 混淆不变性威胁模型对标（链式变换）；"反混淆 LLM 化"引用 |
| 17 | 微信动态分析工业实践 | ASE 2020 Industry | target runtime 概念的工业背书；"为何不用纯动态分析" |
| 18 | HybriDroid | ASE 2016 | 混合应用感知谱系定位；跨语言路线反衬轻量性 |
| 19 | V8 JIT Translation Validation | ICSE 2024 | Level-2 oracle 接入 per-instance validation 脉络；跨宿主→观测等价的分界论证 |
| 20 | BridgeScope | RAID 2017 | 宿主能力暴露面谱系（HybriDroid→BridgeScope→ASE'20→R97） |
| 21 | 小程序 bug 实证 | ICSE 2022 | "小程序平台特有 bug"经验事实（83 bug 分类待读全文核对 UNVERIFIED） |
| 22 | 微信小程序生态测量 | SIGMETRICS 2021 / PACMPER 5(2) | 生态规模与宿主 API 密度的第三方量化（环境嗅探统计待核对 UNVERIFIED） |
| 23 | LLM 反混淆能力评估 | DIMVA 2025 | 与条目 16 并引，封"反混淆器变强后 R97 是否过时" |
| 24 | 混淆 vs 静态 ML 检测器 | ISSTA 2023 | "混淆 vs 静态分析鲁棒性"脉络：检测器退化 vs R97 守门安全的对照 |
| 25 | SAFE-Deobs | IEEE SCAM 2020（非 CCF-A，如实标注） | "反混淆器核心操作=常量折叠"工具证据，恰是 R97 守门的 CONST_EVAL |

**核验纪律的实证**：本任务期间共拦截 **6 处**检索元数据/描述错误——3 个错误 DOI、2 个错误 venue、1 个幻觉题名（"A Large-Scale Empirical Assessment of JavaScript Obfuscation" 不存在）、1 处主题描述漂移（Simulacrum 实为扩展指纹防御而非分析环境逃避）。全部核验事件已留痕于全景录，审稿可追溯。

## 四、写作级论点链（从文献中提炼，供论文写作取用）

1. **"混淆器—反混淆器—守门"链条**：OBsmith 测混淆器语义保真（不可信混淆器真实存在）→ SAFE-Deobs/JsDeObsBench/DIMVA 2025 证明反混淆器大量依赖常量折叠且正走向 LLM 化 → R97 证明：无论链条上下游如何演进，"求值环境 ≠ 目标环境"的折叠外推失效需要一个运行时感知守门，且该守门与反混淆质量**正交**。
2. **TV/观测等价脉络**：R97 的两级 oracle 属于 per-instance validation 传统（Pnueli/Zuck → V8 JIT TV, ICSE 2024）；跨宿主场景下形式化仿真关系不可得，退化为"观测等价"（existence/type/callability 投影 + 执行差分）——这解释了为什么 R97 报告的是经验可复现的 0 实测不安全折叠 + 置信上界（0.071%），而不是数学证明。
3. **宿主能力谱系**：HybriDroid（ASE'16，跨语言语义）→ BridgeScope（RAID'17，能力暴露面）→ 微信动态分析（ASE'20 Industry）/ bug 实证（ICSE'22）/ 生态测量（SIGMETRICS'21）→ R97（反混淆折叠决策的宿主运行时感知）：宿主感知是混合生态安全的既有主线，R97 占据的是此前无人覆盖的"反混淆/折叠决策"环节。
4. **混淆 vs 静态分析鲁棒性**：ISSTA 2023 证明混淆使静态 ML 检测器判定翻转（脆弱性）；R97 混淆不变性基准证明折叠决策迁移全部落在安全方向、0 不安全折叠（守门安全）——同一压力下的两种命运，凸显"差分实体判据 + 非对称外推铁律"的价值。

## 五、待用户在场执行清单（CDP/真实微信依赖或人工判断）

1. **P1 基准补跑**：`npm run eval:obfuscation-invariance`（M3 已就绪）→ 预期一致性低于 M2、0 不安全折叠保持 → 数字确认后更新性能报告（P2 通道已就绪，会自动带上 M3 列）。
2. **P3 实施与验证**：按 `proposals/P3` 测量结果节执行——6 个核心 API（FileReader/Image/SVGRect/Window/close/stop）加入 `HOST_RUNTIME_ROOTS` Edge 组 + `WebKitCSSMatrix` 单独决定 → 重跑 host-attribution + 主基准（--include-browser）验证 0 不安全折叠不变。
3. **M4 可行性试验**（可选）：debugProtection/selfExploding 在场小样本试验，若探针卡死则维持不加。
4. **UNVERIFIED 待核对**：条目 21 的 83-bug 分类与 R97 失败模式重合度；条目 22 的环境嗅探统计比例。
5. **收尾决策**：审核后是否合并入主线（当前全部仅本地提交，主线未受影响）；回退命令见 §0。

## 六、安全红线遵守声明

- 全程未执行 `git push`；所有提交仅在本地。未运行任何 CDP/真实微信依赖评测（host-attribution、wechat:collect、benchmark 重跑均被主动推迟）。
- 只在 `E:\读论文\R97` 内读写；未更改系统设置；未安装任何软件。
- 未触碰：`AGENTS.md` 规则、决策引擎核心、`dropAbsence` 防线、既有测试。
