# Transformation Oracle（Level 2）

生成时间：2026-10-09T03:47:10.616Z

判卷（Level 1）问的是「实体观测能不能迁移」；这一层问的是
「变换前后在**目标环境**里的行为一样吗」：

```
unsafe  ⟺  Obs(P, R_t) ≠ Obs(T(P), R_t)
```

它不读 R97 的规则，因此是独立的第二条真值通道。

| 指标 | 数值 |
|---|---:|
| 用例 | 20 |
| 可执行验证 | 20 |
| R97 放行 | 10 |
| **放行中在目标环境改变行为** | **0** |
| Fold Precision（变换口径） | 100.00% |
| 已知会改变行为的变换 | 10 |
| 其中被 R97 拦住 | 10 |

## 逐例结果

| 用例 | 类别 | 目标 | R97 | 变换前 | 变换后 | 结论 |
|---|---|---|---|---|---|---|
| `window-guard-pruned-by-baseline` | cross-host-divergence | edge | BLOCK | value:{"kind":"string","value":"has-window"} | value:{"kind":"string","value":"no-window"} | 正确拦截 |
| `process-guard-pruned-by-baseline` | cross-host-divergence | node | BLOCK | value:{"kind":"string","value":"has-process"} | value:{"kind":"string","value":"no-process"} | 正确拦截 |
| `navigator-presence-pruned` | cross-host-divergence | edge | BLOCK | value:{"kind":"string","value":"has-navigator"} | value:{"kind":"string","value":"no-navigator"} | 正确拦截 |
| `buffer-presence-pruned` | cross-host-divergence | node | BLOCK | value:{"kind":"string","value":"has-buffer"} | value:{"kind":"string","value":"no-buffer"} | 正确拦截 |
| `localstorage-presence-pruned` | cross-host-divergence | edge | BLOCK | exception:SecurityError | value:{"kind":"string","value":"no-storage"} | 正确拦截 |
| `same-name-different-value` | cross-host-divergence | edge | BLOCK | value:{"kind":"string","value":"object"} | value:{"kind":"string","value":"other"} | 正确拦截 |
| `console-type-pruned` | baseline-missing-target-present | edge | BLOCK | value:{"kind":"string","value":"object"} | value:{"kind":"string","value":"undefined"} | 正确拦截 |
| `settimeout-callability-pruned` | baseline-missing-target-present | edge | BLOCK | value:{"kind":"string","value":"function"} | value:{"kind":"string","value":"undefined"} | 正确拦截 |
| `timers-shared-semantics` | baseline-missing-target-present | node | BLOCK | value:{"kind":"string","value":"function"} | value:{"kind":"string","value":"undefined"} | 正确拦截 |
| `pure-math-fold` | pure-language | edge | ALLOW | value:{"kind":"number","value":3} | value:{"kind":"number","value":3} | 正确放行 |
| `pure-string-length` | pure-language | edge | ALLOW | value:{"kind":"number","value":6} | value:{"kind":"number","value":6} | 正确放行 |
| `pure-array-is-array` | pure-language | edge | ALLOW | value:{"kind":"boolean","value":true} | value:{"kind":"boolean","value":true} | 正确放行 |
| `typeof-math-stable` | pure-language | edge | ALLOW | value:{"kind":"string","value":"object"} | value:{"kind":"string","value":"object"} | 正确放行 |
| `pure-undefined-identity` | pure-language | edge | ALLOW | value:{"kind":"boolean","value":true} | value:{"kind":"boolean","value":true} | 正确放行 |
| `pure-json-property-access` | contract-coverage | edge | ALLOW | value:{"kind":"number","value":1} | value:{"kind":"number","value":1} | 正确放行 |
| `pure-string-method-chain` | contract-coverage | edge | ALLOW | value:{"kind":"string","value":"ABC"} | value:{"kind":"string","value":"ABC"} | 正确放行 |
| `pure-const-arithmetic` | contract-coverage | edge | ALLOW | value:{"kind":"number","value":9} | value:{"kind":"number","value":9} | 正确放行 |
| `shadowed-window-local` | shadowed-binding | edge | ALLOW | value:{"kind":"string","value":"local"} | value:{"kind":"string","value":"local"} | 正确放行 |
| `parameter-shadowing-process` | shadowed-binding | edge | ALLOW | value:{"kind":"string","value":"string"} | value:{"kind":"string","value":"string"} | 正确放行 |
| `stable-alias-to-host-root` | alias | edge | BLOCK | value:{"kind":"string","value":"present"} | value:{"kind":"string","value":"missing"} | 正确拦截 |

`unsafe-allow` 才是不安全；`over-protection` 是保守方向的代价；
`unverified` 表示目标环境没能执行（例如没有可用的浏览器），单独计数不混入结论。

