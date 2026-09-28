# R97 决策护栏受控敏感性实验

生成时间：2026-09-18T10:40:42.271Z

受控机制实验：逐项关闭决策护栏，比较 R97 护栏与只做字段比较的宽松基线。

> 该实验用于验证护栏机制，不代表真实语料中的触发频率。环境指纹失效未加入，因为当前证据记录和决策查询还没有携带可比较的运行时环境指纹。

护栏决策：FOLD 0 / PROTECT 3 / UNKNOWN 9；
宽松基线决策：FOLD 11。
护栏阻止的不安全折叠：11；护栏自身错误 FOLD：0。

| 样例 | 护栏 | R97 | 宽松基线 | 阻断不安全折叠 | 说明 |
|---|---|---|---|---|---|
| binding-unresolved | 绑定解析门槛 | UNKNOWN (BINDING_UNRESOLVED) | FOLD | 是 | 绑定未解析 |
| target-runtime-inferred | 运行时来源门槛 | UNKNOWN (TARGET_RUNTIME_INFERRED) | FOLD | 是 | 目标运行时只来自静态推断 |
| required-runtime-missing | 必需运行时覆盖 | PROTECT (REQUIRED_RUNTIME_MISSING) | FOLD | 是 | 契约要求微信运行时，但当前比较没有覆盖微信 |
| evidence-missing | 证据存在性 | UNKNOWN (EVIDENCE_MISSING) | FOLD | 是 | 没有对应的真实运行时证据 |
| evidence-expired | 证据有效期 | UNKNOWN (EVIDENCE_EXPIRED) | FOLD | 是 | 证据超出有效期 |
| evidence-conflict | 冲突阻断 | UNKNOWN (EVIDENCE_CONFLICT) | FOLD | 是 | 同一运行时存在冲突观测 |
| evidence-not-fold-eligible | 证据来源等级 | UNKNOWN (EVIDENCE_NOT_FOLD_ELIGIBLE) | FOLD | 是 | 只有 LLM 候选，没有可授权 FOLD 的真实观测 |
| policy-version-mismatch | 策略版本有效性 | UNKNOWN (EVIDENCE_EXPIRED) | FOLD | 是 | 证据来自旧策略版本 |
| wrong-evaluator-scope | 证据作用域身份 | UNKNOWN (EVIDENCE_MISSING) | FOLD | 是 | 证据求值运行时与查询作用域不一致 |
| contract-coverage-missing | 契约覆盖完整性 | UNKNOWN (CONTRACT_COVERAGE_MISSING) | FOLD | 是 | 契约要求 return_value，但探针没有观测该维度 |
| forbidden-side-effect | 禁止副作用 | PROTECT (FORBIDDEN_SIDE_EFFECT) | FOLD | 是 | 值相同，但观测到网络副作用 |
| confirmed-contract-mismatch | 确认差异保护 | PROTECT (CONTRACT_MISMATCH) | PROTECT | 否 | 目标运行时存在明确语义差异 |

## 判断

- 绑定解析、运行时来源、必需运行时覆盖、证据存在性、有效期、冲突、来源等级、作用域身份、契约完整性和副作用限制都在受控样例中有明确阻断作用。
- 这些结果说明护栏是机制上必要的，但不说明每个护栏在真实语料中的触发频率都很高。
- 环境指纹失效没有进入当前实现，也没有真实样本支持；本轮不把它写进论文主贡献。

