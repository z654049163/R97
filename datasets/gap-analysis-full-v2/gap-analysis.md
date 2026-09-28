# R97 决策缺口分析

生成时间：2026-09-23T10:36:46.794Z

评测样本：3895

## 决策分桶

| 分桶 | 数量 | 含义 |
|---|---:|---|
| 安全折叠 | 1341 | 证据完整且跨运行时一致 |
| 契约不匹配 | 121 | 观测到真实差异，已保护 |
| 运行时覆盖缺口 | 582 | 缺的维度现有探针能观测，换更强运行时即可补 |
| 证据协议缺口 | 0 | 缺的维度现有探针不产出，换运行时也没用 |
| 绑定未解析 | 881 | 文件内确实没有绑定的全局名，探针无法解决 |
| 模块边界 | 970 | 已正确解析为模块导入；跨模块依赖解析在技术路线 §9 的冻结清单里 |
| 其他 | 0 | 其余原因 |

## 补微信探针能带来什么

| 作用 | 样本数 |
|---|---:|
| 验证已放行的折叠是否在真实微信上成立 | 1341 |
| 补齐可见维度后升级为可判定 | 582 |
| 仍被证据协议缺口挡住，需先补维度生产器 | 0 |
| 不受运行时探针影响，需要改进静态绑定 | 881 |
| 跨模块依赖解析（§9 冻结） | 970 |

## 证据协议缺口涉及的维度

| 维度 | 样本数 |
|---|---:|

## 绑定未解析的主要根符号

| 根符号 | 样本数 |
|---|---:|
| wh | 20 |
| __subContextEngine__ | 15 |
| nv_navigator | 15 |
| PHCNTRUST | 15 |
| __wxConfig | 14 |
| t | 12 |
| tt | 11 |
| define | 10 |
| nv_Array | 10 |
| nv_window | 9 |
| app | 8 |
| res | 7 |
| CryptoJS | 6 |
| my | 6 |
| PHCrypJS | 6 |

## 模块边界的主要根符号

| 根符号 | 样本数 |
|---|---:|
| e | 185 |
| t | 142 |
| o | 66 |
| CryptoJS | 65 |
| n | 62 |
| r | 53 |
| a | 44 |
| s | 35 |
| aesjs | 22 |
| i | 20 |
| cloud | 17 |
| m | 11 |
| c | 10 |
| h | 7 |
| api | 6 |

## 覆盖缺口的实体

| 实体 | 样本数 |
|---|---:|
| App | 5 |
| getApp | 5 |
| getCurrentPages | 5 |
| Page | 5 |
| RegExp.$1 | 5 |
| RegExp.$1.length | 5 |
| wx | 5 |
| wx.__first__canvas | 5 |
| wx.__webpack_require_UNI_MP_PLUGIN__ | 5 |
| wx.authorize | 5 |
| wx.BaaS | 5 |
| wx.BaaS.TableObject | 5 |
| wx.canIUse | 5 |
| wx.canvasToTempFilePath | 5 |
| wx.checkSession | 5 |
| wx.closeBluetoothAdapter | 5 |
| wx.cloud | 5 |
| wx.cloud.callFunction | 5 |
| wx.cloud.database | 5 |
| wx.cloud.init | 5 |

