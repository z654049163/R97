# R97 混淆不变性基准报告

生成时间：2026-10-11T14:23:28.685Z

## 实验设计

- 用 `javascript-obfuscator` 对三生态真实语料文件做两组受控混淆（`renameGlobals: false` 保证实体可跨版本配对）；
- 同一文件的原始版与混淆版各跑一遍完整判定管线（两趟判定 + 四宿主证据）；
- 实测差分实体集由本次评测现场证据读数推导（同实体任意两运行时同维观测不同）。

## 总览

| 指标 | 数值 |
|---|---:|
| 共享实体配对总数 | 4210 |
| 判定一致 | 3614 |
| 决策一致性 | 85.84% |
| 🔥 混淆版不安全折叠（FOLD ∩ 实测差分） | **0** |

## 微信小程序生产包（miniapp，抽样 39 文件，实测差分实体 140）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 39（失败 0） |
| 共享实体配对 | 1713 |
| 决策一致 | 1443（84.24%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 657； FOLD->UNKNOWN: 258； PROTECT->PROTECT: 431； PROTECT->UNKNOWN: 10； UNKNOWN->FOLD: 2； UNKNOWN->UNKNOWN: 355 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +10534； ALL_TARGETS_MATCH: -9238； CONTRACT_MISMATCH: -1653； CONTRACT_COVERAGE_MISSING: -1259； EVIDENCE_MISSING: -614

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 39（失败 0） |
| 共享实体配对 | 1647 |
| 决策一致 | 1379（83.73%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 633； FOLD->UNKNOWN: 254； PROTECT->PROTECT: 397； PROTECT->UNKNOWN: 10； UNKNOWN->FOLD: 4； UNKNOWN->UNKNOWN: 349 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +23267； ALL_TARGETS_MATCH: -9157； CONTRACT_MISMATCH: -1710； CONTRACT_COVERAGE_MISSING: -1490； EVIDENCE_MISSING: -625

## Node 真实仓库（node，抽样 39 文件，实测差分实体 19）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 39（失败 0） |
| 共享实体配对 | 201 |
| 决策一致 | 196（97.51%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 110； FOLD->UNKNOWN: 4； PROTECT->PROTECT: 44； UNKNOWN->FOLD: 1； UNKNOWN->UNKNOWN: 42 |

reason code 增量（混淆 − 原始）：CONTRACT_COVERAGE_MISSING: -183； BINDING_UNRESOLVED: -162； ALL_TARGETS_MATCH: +135； CONTRACT_MISMATCH: -50； EVIDENCE_MISSING: -2

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 39（失败 0） |
| 共享实体配对 | 190 |
| 决策一致 | 179（94.21%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 96； FOLD->UNKNOWN: 8； PROTECT->PROTECT: 49； UNKNOWN->FOLD: 3； UNKNOWN->UNKNOWN: 34 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +1223； CONTRACT_COVERAGE_MISSING: -198； ALL_TARGETS_MATCH: +135； CONTRACT_MISMATCH: -45； EVIDENCE_MISSING: -2

## 浏览器真实仓库（browser，抽样 34 文件，实测差分实体 66）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 34（失败 0） |
| 共享实体配对 | 230 |
| 决策一致 | 220（95.65%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 100； FOLD->UNKNOWN: 10； PROTECT->PROTECT: 19； UNKNOWN->UNKNOWN: 101 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: -243； ALL_TARGETS_MATCH: +88； CONTRACT_MISMATCH: -87； CONTRACT_COVERAGE_MISSING: -80； EVIDENCE_MISSING: -26

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 34（失败 0） |
| 共享实体配对 | 229 |
| 决策一致 | 197（86.03%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 102； FOLD->UNKNOWN: 4； PROTECT->PROTECT: 22； UNKNOWN->FOLD: 28； UNKNOWN->UNKNOWN: 73 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +313； ALL_TARGETS_MATCH: +165； CONTRACT_COVERAGE_MISSING: -155； CONTRACT_MISMATCH: -80； EVIDENCE_MISSING: -23

## 口径说明

- **决策一致性**：实体级判定（任一 PROTECT ➔ PROTECT，否则任一 UNKNOWN ➔ UNKNOWN，否则 FOLD）在混淆前后相同即计一致。混淆引入的**新实体**（字符串数组解码器等）不参与一致性分母，单独统计；
- **不安全折叠**：混淆版被 FOLD 的实体落在实测差分实体集上；该指标必须为 0（零差分保持）；
- 混淆把字符串字面量包进解码调用是**预期内的 FOLD➔UNKNOWN 迁移**来源：解码器是文件内定义的实体，按 code-defined-global 保守未决。
