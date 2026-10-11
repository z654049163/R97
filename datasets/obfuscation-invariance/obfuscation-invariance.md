# R97 混淆不变性基准报告

生成时间：2026-10-11T11:29:27.349Z

## 实验设计

- 用 `javascript-obfuscator` 对三生态真实语料文件做两组受控混淆（`renameGlobals: false` 保证实体可跨版本配对）；
- 同一文件的原始版与混淆版各跑一遍完整判定管线（两趟判定 + 四宿主证据）；
- 实测差分实体集由本次评测现场证据读数推导（同实体任意两运行时同维观测不同）。

## 总览

| 指标 | 数值 |
|---|---:|
| 共享实体配对总数 | 706 |
| 判定一致 | 640 |
| 决策一致性 | 90.65% |
| 🔥 混淆版不安全折叠（FOLD ∩ 实测差分） | **0** |

## 微信小程序生产包（miniapp，抽样 15 文件，实测差分实体 60）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 241 |
| 决策一致 | 218（90.46%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 65； FOLD->UNKNOWN: 19； PROTECT->PROTECT: 106； PROTECT->UNKNOWN: 4； UNKNOWN->UNKNOWN: 47 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +533； CONTRACT_MISMATCH: -347； CONTRACT_COVERAGE_MISSING: -326； ALL_TARGETS_MATCH: -186； EVIDENCE_MISSING: -175

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 256 |
| 决策一致 | 232（90.63%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 67； FOLD->UNKNOWN: 20； PROTECT->PROTECT: 113； PROTECT->UNKNOWN: 4； UNKNOWN->UNKNOWN: 52 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +1210； CONTRACT_COVERAGE_MISSING: -376； CONTRACT_MISMATCH: -344； EVIDENCE_MISSING: -174； ALL_TARGETS_MATCH: -134

## Node 真实仓库（node，抽样 15 文件，实测差分实体 8）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 43 |
| 决策一致 | 41（95.35%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 15； FOLD->UNKNOWN: 2； PROTECT->PROTECT: 14； UNKNOWN->UNKNOWN: 12 |

reason code 增量（混淆 − 原始）：ALL_TARGETS_MATCH: +115； CONTRACT_COVERAGE_MISSING: -15； CONTRACT_MISMATCH: -14； BINDING_UNRESOLVED: +1； EVIDENCE_MISSING: -1

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 41 |
| 决策一致 | 39（95.12%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 14； FOLD->UNKNOWN: 1； PROTECT->PROTECT: 16； UNKNOWN->FOLD: 1； UNKNOWN->UNKNOWN: 9 |

reason code 增量（混淆 − 原始）：ALL_TARGETS_MATCH: +118； BINDING_UNRESOLVED: +40； CONTRACT_COVERAGE_MISSING: -19； CONTRACT_MISMATCH: -12； EVIDENCE_MISSING: -1

## 浏览器真实仓库（browser，抽样 15 文件，实测差分实体 25）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 59 |
| 决策一致 | 54（91.53%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 19； FOLD->UNKNOWN: 5； PROTECT->PROTECT: 6； UNKNOWN->UNKNOWN: 29 |

reason code 增量（混淆 − 原始）：ALL_TARGETS_MATCH: +85； CONTRACT_MISMATCH: -21； CONTRACT_COVERAGE_MISSING: -14； EVIDENCE_MISSING: -9； BINDING_UNRESOLVED: +7

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 66 |
| 决策一致 | 56（84.85%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 26； FOLD->UNKNOWN: 4； PROTECT->PROTECT: 9； UNKNOWN->FOLD: 6； UNKNOWN->UNKNOWN: 21 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +101； ALL_TARGETS_MATCH: +99； CONTRACT_COVERAGE_MISSING: -30； CONTRACT_MISMATCH: -18； EVIDENCE_MISSING: -9

## 口径说明

- **决策一致性**：实体级判定（任一 PROTECT ➔ PROTECT，否则任一 UNKNOWN ➔ UNKNOWN，否则 FOLD）在混淆前后相同即计一致。混淆引入的**新实体**（字符串数组解码器等）不参与一致性分母，单独统计；
- **不安全折叠**：混淆版被 FOLD 的实体落在实测差分实体集上；该指标必须为 0（零差分保持）；
- 混淆把字符串字面量包进解码调用是**预期内的 FOLD➔UNKNOWN 迁移**来源：解码器是文件内定义的实体，按 code-defined-global 保守未决。
