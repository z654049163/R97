# 独立人工标注协议

## 标注什么

对 `sample.jsonl` 里的每个条目，判断这一处**具体 transformation** 在给定
target 下是否保持可观察行为。不要判断"R97 应该输出什么"——R97 的决策已经写在
`r97State` 字段里，但标注时必须先忽略它。

每个条目的判断序列：

1. 读 `generatedSource`：这是折叠点在求值基线里的表达式。
2. 读 `targetRuntimeStatus`：目标环境是什么（本抽样统一来自 4 宿主配置，
   target 含真实微信 AppService）。
3. 判断：把这个表达式替换成基线结果后，在 target 里执行是否产生**不同的
   可观察行为**（返回值、异常、调用是否发生、副作用）。

## 标签取值

| 标签 | 含义 |
|---|---|
| `SAFE_FOLD` | 观察不到差异，折叠保持行为 |
| `UNSAFE_FOLD` | 观察到差异，折叠会改变行为 |
| `INSUFFICIENT_EVIDENCE` | 无法在不引入额外假设的情况下判断 |

不要为了和 R97 一致而改标签；分歧本身就是结果。

## 流程

1. 两名标注者**独立**填写 `labels.tsv` 的 `label_a` / `label_b` 列。
2. 有分歧的条目进入 adjudication，填写 `adjudicated` 列。
3. 运行 `node tools/annotation-agreement.mjs --labels datasets/annotation-sample/labels.tsv`
   计算原始一致率、Cohen's kappa 与冲突清单。

## 与自洽校验的区别

`benchmark-summary.json` 里的 `exactStateAccuracy` 用 R97 自己的证据规则
重算 expected，只能说明内部一致。这份人工标注是独立 oracle，结论以它为准。
