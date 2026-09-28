# R97 独立差分执行参考

生成时间：2026-09-24T07:24:30.709Z

## 判定口径

- `REFERENCE_ALLOW_FOLD`：所有必需运行时都成功执行，且归一化行为一致。
- `REFERENCE_BLOCK_FOLD`：至少一个必需运行时与其它运行时行为不同。
- `REFERENCE_UNVERIFIED`：有副作用、缺少必需运行时或无法安全执行。

该结果只证明受控表达式在有限运行时样本上一致，不等同于对所有输入、
版本和环境组合的数学证明。

## 汇总

| 参考状态 | 数量 |
|---|---:|
| REFERENCE_ALLOW_FOLD | 7 |
| REFERENCE_BLOCK_FOLD | 6 |
| REFERENCE_UNVERIFIED | 3 |

## 与 R97 结果对比

| 指标 | 数量 |
|---|---:|
| 可比较案例 | 13 |
| 双方都允许折叠 | 6 |
| 双方都阻断折叠 | 6 |
| 参考允许但 R97 阻断 | 1 |
| 参考阻断但 R97 允许 | 0 |
| 参考无法核验 | 3 |

## 逐案例

| 案例 | 独立参考 | R97 状态 / 动作 | 说明 |
|---|---|---|---|
| language-object-keys | REFERENCE_ALLOW_FOLD | FOLD / ALLOW_FOLD | All required runtime observations are equivalent. |
| language-array-is-array | REFERENCE_ALLOW_FOLD | FOLD / ALLOW_FOLD | All required runtime observations are equivalent. |
| language-json-parse | REFERENCE_ALLOW_FOLD | FOLD / ALLOW_FOLD | All required runtime observations are equivalent. |
| language-math-max | REFERENCE_ALLOW_FOLD | FOLD / ALLOW_FOLD | All required runtime observations are equivalent. |
| language-string-normalize | REFERENCE_ALLOW_FOLD | UNKNOWN / BLOCK_FOLD | All required runtime observations are equivalent. |
| language-json-parse-error | REFERENCE_ALLOW_FOLD | FOLD / ALLOW_FOLD | All required runtime observations are equivalent. |
| language-missing-property | REFERENCE_ALLOW_FOLD | FOLD / ALLOW_FOLD | All required runtime observations are equivalent. |
| node-process-version | REFERENCE_BLOCK_FOLD | PROTECT / BLOCK_FOLD | Runtime observations differ: node |
| node-buffer-hex | REFERENCE_BLOCK_FOLD | PROTECT / BLOCK_FOLD | Runtime observations differ: node |
| browser-window-document | REFERENCE_BLOCK_FOLD | PROTECT / BLOCK_FOLD | Runtime observations differ: edge |
| browser-local-storage | REFERENCE_BLOCK_FOLD | PROTECT / BLOCK_FOLD | Runtime observations differ: edge |
| browser-navigator-user-agent | REFERENCE_BLOCK_FOLD | PROTECT / BLOCK_FOLD | Runtime observations differ: node, edge |
| host-timer-type | REFERENCE_BLOCK_FOLD | PROTECT / BLOCK_FOLD | Runtime observations differ: node, edge |
| unverified-network-fetch | REFERENCE_UNVERIFIED | PROTECT / BLOCK_FOLD | 存在网络副作用，受控差分器不会执行该表达式 |
| unverified-wechat-request | REFERENCE_UNVERIFIED | PROTECT / BLOCK_FOLD | 缺少可执行的真实微信运行时，不能伪造微信调用结果 |
| unverified-dynamic-property | REFERENCE_UNVERIFIED | UNKNOWN/FOLD / BLOCK_FOLD | 动态属性无法在执行前确定目标，可能触发任意宿主 API |
