# R97 混淆不变性基准报告

生成时间：2026-10-12T07:43:42.231Z

## 实验设计

- 用 `javascript-obfuscator` 对三生态真实语料文件做两组受控混淆（`renameGlobals: false` 保证实体可跨版本配对）；
- 同一文件的原始版与混淆版各跑一遍完整判定管线（两趟判定 + 四宿主证据）；
- 实测差分实体集由本次评测现场证据读数推导（同实体任意两运行时同维观测不同）。

## 总览

| 指标 | 数值 |
|---|---:|
| 共享实体配对总数 | 1963 |
| 判定一致 | 1702 |
| 决策一致性 | 86.70% |
| 🔥 混淆版不安全折叠（FOLD ∩ 实测差分） | **0** |

## 微信小程序生产包（miniapp，抽样 15 文件，实测差分实体 88）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 484 |
| 决策一致 | 412（85.12%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 186； FOLD->UNKNOWN: 67； PROTECT->PROTECT: 118； PROTECT->UNKNOWN: 5； UNKNOWN->UNKNOWN: 108 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +2668； ALL_TARGETS_MATCH: -2308； CONTRACT_MISMATCH: -442； CONTRACT_COVERAGE_MISSING: -256； EVIDENCE_MISSING: -149

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 466 |
| 决策一致 | 386（82.83%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 167； FOLD->UNKNOWN: 75； PROTECT->PROTECT: 107； PROTECT->UNKNOWN: 5； UNKNOWN->UNKNOWN: 112 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +5981； ALL_TARGETS_MATCH: -2330； CONTRACT_MISMATCH: -447； CONTRACT_COVERAGE_MISSING: -286； EVIDENCE_MISSING: -148

### 链式混淆：+字符串RC4编码+索引位移+包装器（M3-string-array-rc4）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 477 |
| 决策一致 | 401（84.07%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 181； FOLD->UNKNOWN: 69； PROTECT->PROTECT: 106； PROTECT->UNKNOWN: 5； UNKNOWN->FOLD: 2； UNKNOWN->UNKNOWN: 114 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +5488； ALL_TARGETS_MATCH: -2214； CONTRACT_MISMATCH: -448； CONTRACT_COVERAGE_MISSING: -293； EVIDENCE_MISSING: -145

## Node 真实仓库（node，抽样 15 文件，实测差分实体 11）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 107 |
| 决策一致 | 103（96.26%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 61； FOLD->UNKNOWN: 4； PROTECT->PROTECT: 21； UNKNOWN->UNKNOWN: 21 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: -116； CONTRACT_COVERAGE_MISSING: -73； CONTRACT_MISMATCH: -18； ALL_TARGETS_MATCH: -7

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 103 |
| 决策一致 | 98（95.15%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 62； FOLD->UNKNOWN: 4； PROTECT->PROTECT: 18； UNKNOWN->FOLD: 1； UNKNOWN->UNKNOWN: 18 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +708； CONTRACT_COVERAGE_MISSING: -95； CONTRACT_MISMATCH: -21； ALL_TARGETS_MATCH: +1

### 链式混淆：+字符串RC4编码+索引位移+包装器（M3-string-array-rc4）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 15（失败 0） |
| 共享实体配对 | 93 |
| 决策一致 | 89（95.70%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 57； FOLD->UNKNOWN: 3； PROTECT->PROTECT: 16； UNKNOWN->FOLD: 1； UNKNOWN->UNKNOWN: 16 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +702； CONTRACT_COVERAGE_MISSING: -97； ALL_TARGETS_MATCH: +79； CONTRACT_MISMATCH: -23

## 浏览器真实仓库（browser，抽样 12 文件，实测差分实体 34）

### 轻混淆：字符串数组化（M1-string-array）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 12（失败 0） |
| 共享实体配对 | 79 |
| 决策一致 | 74（93.67%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 41； FOLD->UNKNOWN: 5； PROTECT->PROTECT: 4； UNKNOWN->UNKNOWN: 29 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: -146； CONTRACT_MISMATCH: -46； CONTRACT_COVERAGE_MISSING: -33； ALL_TARGETS_MATCH: +16； EVIDENCE_MISSING: -2

### 重混淆：+控制流平坦化+死代码注入（M2-control-flow）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 12（失败 0） |
| 共享实体配对 | 76 |
| 决策一致 | 67（88.16%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 42； FOLD->UNKNOWN: 1； PROTECT->PROTECT: 5； UNKNOWN->FOLD: 8； UNKNOWN->UNKNOWN: 20 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +138； CONTRACT_COVERAGE_MISSING: -56； CONTRACT_MISMATCH: -45； ALL_TARGETS_MATCH: +35； EVIDENCE_MISSING: -2

### 链式混淆：+字符串RC4编码+索引位移+包装器（M3-string-array-rc4）

| 指标 | 数值 |
|---|---:|
| 对比文件数（混淆失败另计） | 12（失败 0） |
| 共享实体配对 | 78 |
| 决策一致 | 72（92.31%） |
| 不安全折叠 | 0 |
| 判定迁移 | FOLD->FOLD: 39； FOLD->UNKNOWN: 3； PROTECT->PROTECT: 6； UNKNOWN->FOLD: 3； UNKNOWN->UNKNOWN: 27 |

reason code 增量（混淆 − 原始）：BINDING_UNRESOLVED: +158； ALL_TARGETS_MATCH: +106； CONTRACT_COVERAGE_MISSING: -53； CONTRACT_MISMATCH: -44； EVIDENCE_MISSING: -2

## 口径说明

- **决策一致性**：实体级判定（任一 PROTECT ➔ PROTECT，否则任一 UNKNOWN ➔ UNKNOWN，否则 FOLD）在混淆前后相同即计一致。混淆引入的**新实体**（字符串数组解码器等）不参与一致性分母，单独统计；
- **不安全折叠**：混淆版被 FOLD 的实体落在实测差分实体集上；该指标必须为 0（零差分保持）；
- 混淆把字符串字面量包进解码调用是**预期内的 FOLD➔UNKNOWN 迁移**来源：解码器是文件内定义的实体，按 code-defined-global 保守未决。
