# R97 observation_projection 受控敏感性实验

生成时间：2026-09-18T10:40:42.648Z

受控机制实验：只检验 observation_projection 在无关维度差异出现时能否避免过度保护。

> 该实验使用人工观测，不代表真实语料上的频率或收益；真实探针当前仅稳定产出 existence/type/callability。

样例数：7。投影决策：FOLD 3 / PROTECT 4；
全维度决策：FOLD 0 / PROTECT 7。
投影避免的过度保护：3；投影造成的错误 FOLD：0。

| 样例 | 投影 | 全维度比较 | 投影避免过度保护 | 说明 |
|---|---|---|---|---|
| ignored-callback-differs | FOLD | PROTECT | 是 | 回调未参与变换，但两个运行时的 callback_behavior 不同 |
| ignored-return-differs | FOLD | PROTECT | 是 | 返回值没有被使用，但两个运行时的 return_value 不同 |
| not-awaited-async-differs | FOLD | PROTECT | 是 | 调用没有被 await，但两个运行时的 async_behavior 不同 |
| callback-is-used | PROTECT | PROTECT | 否 | 回调参与变换，callback_behavior 不同 |
| return-value-is-used | PROTECT | PROTECT | 否 | 返回值参与变换，return_value 不同 |
| awaited-async-differs | PROTECT | PROTECT | 否 | 调用被 await，async_behavior 不同 |
| existence-differs | PROTECT | PROTECT | 否 | 实体存在性不同 |

## 判断

- 受控样例说明：只有在“无关维度存在差异”时，投影才会产生可观察收益。
- 现有真实语料的关闭投影结果改变数为 0，因为当前探针只稳定产出存在性、类型和可调用性。
- 因此当前证据支持把投影保留为契约设计，但不支持把它写成已经由真实数据证明有效的主贡献。

