# R97 运行时差异困难集（View C）

生成时间：2026-09-24T08:16:33.554Z

主基准按语料分布抽样，回答整体放行与错误放行。本表换一个问题：把已知与宿主
强相关的实体全部挑出来，逐个体检运行时差异，看 R97 有没有漏掉任何一个。

真值来自第二套探针实现（直接属性访问），与 R97 决策链用的描述符探针相互独立。
R97 的目标集包含所有被探测到的宿主，因此任何被独立探针确认为跨宿主不一致的实体
都不应被放行。

## 自然困难集（从语料派生，不人工挑选）

| 指标 | 数值 |
|---|---:|
| 困难集实体 | 314 |
| 至少两个运行时给出观测 | 314 |
| 实测跨运行时不一致 | 154 |
| 其中被 R97 阻断 | 154 |
| 漏放（差异实体被 FOLD） | 0 |
| 检出率 | 100.00% |

差异实体（前 30）：$gwx、$gwn、$gwl、wh、wh.hn、wh.rv、wh.nh、gra、grb、App、wx.request、require、getApp、Page、wx.openLocation、wx.downloadFile、wx.openDocument、wx.openBusinessView、wx.setVisualEffectOnCapture、wx.login、wx.navigateBack、wx.setNavigationBarTitle、wx.navigateToMiniProgram、wx.chooseMessageFile、wx.showModal、wx.showToast、wx.uploadFile、wx.createRewardedVideoAd、wx.showLoading、wx.hideLoading

## 人工压力用例子集（单独统计，不与自然集混合）

| 指标 | 数值 |
|---|---:|
| 困难集实体 | 12 |
| 至少两个运行时给出观测 | 12 |
| 实测跨运行时不一致 | 10 |
| 其中被 R97 阻断 | 10 |
| 漏放（差异实体被 FOLD） | 0 |
| 检出率 | 100.00% |

差异实体（前 30）：setImmediate、clearImmediate、Buffer.from、process.version、SharedArrayBuffer、wx.request、window.document、document.cookie、navigator.userAgent、console.log

## 检出率说明

- 检出率 = 被阻断的差异实体 / 实测差异实体。100% 表示独立探针发现的每一处跨宿主差异，R97 都没有放行。
- 差异判定使用所有已观测运行时的两两比较，包含语言基线、真实 Node、真实 Edge，以及（若提供报告）真实微信。
- 检出率衡量的是「R97 的观测链有没有漏掉已知差异」，不是「R97 能折叠多少」，两者互为补充。

