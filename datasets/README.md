# 数据集索引

更新时间：2026-09-24

本目录同时存在语料源、当前口径评测产物和历史产物。引用数字前先确认落在哪一类。

## 语料源

| 语料 | 记录 | 实体 | 来源 | 说明 |
|---|---:|---:|---|---|
| `real-miniapp-full` | 1,200,000 | 1248 | 1572 个真实微信小程序项目，1583 个文件 | 主微信语料，2026-09-23 用当前分析器重建 |
| `real-miniapp` | 98,605 | — | 同上的早期切片 | 历史，仅用于小规模冒烟 |
| `external-node-tarball` | 22,533 | 1050 | nodejs/node 的 test/parallel、sequential、internet、pummel | tarball 抓取，900 文件 |
| `external-browser-tarball` | 13,287 | 927 | web-platform-tests/wpt 的 16 个目录 | tarball 抓取，900 文件 |
| `external-node-public` / `external-node-repos` / `external-node-local` | 1,350 / 7,421 / 2,500 | — | 早期逐文件抓取 | 已被 tarball 版本取代，但评测仍在维护 |
| `external-browser-wpt` / `external-browser-repos` / `external-browser-local` | 891 / 6,207 / 2,139 | — | 早期逐文件抓取 | 同上 |

每条语料记录除 `bindingKind` 外还带 `inFileDefinition`（`top_level_assignment` / `function_body_assignment` / `null`），表示**这个未解析的名字在被分析文件内部有没有被赋值**。它不参与判定，只决定改进方向：文件内自己赋值的名字（`wh`、`$gwx` 这一族）加运行时探针没有意义，见报告 11.7k 与 `tools/audit-implicit-globals.mjs`。

## 当前口径的评测集

当前口径 = 实体分层抽样（`--per-entity-cap 5`）+ 独立差分校验（`--independent-check`）+ 目标集包含判卷宿主。

判卷环境共四列，全部跑同一份判卷探针 `r97-oracle-probe`：**隔离 vm**（语言基线，求值参照，不算宿主）、真实 Node、真实 Edge，以及提供 `--wechat-report` 时的**真实微信**。因此环境之间的差异可归因于环境本身。`benchmark-wechat` 的判卷集含微信，差分实体从 40 涨到 **208**。

| 数据集 | 样本 | 实体 | 记录放行率 | 实体放行率 | 实测差分记录 | 实测不实折叠 |
|---|---:|---:|---:|---:|---:|---:|
| `benchmark-wechat` | 3895 | 1246 | 30.63% | 20.71% | **785** | **0** |
| `benchmark-evaluator-node-wechat`（旧口径，2026-09-23） | 3895 | 1246 | 30.71% | 20.87% | 785 | **0** |
| `benchmark-external-browser-tarball` | 2599 | 926 | 14.39% | 11.77% | 780 | **0** |
| `benchmark-external-node-tarball` | 3308 | 1049 | 13.66% | 12.68% | 553 | **0** |
| `benchmark-external-browser-repos` | 3664 | 1835 | 7.53% | 4.52% | 296 | **0** |
| `benchmark-external-browser-wpt` | 336 | 122 | 15.48% | 17.21% | 148 | **0** |
| `benchmark-stratified-v1` | 3895 | 1246 | 34.35% | 24.08% | 137 | **0** |
| `benchmark-record-weighted-v1` | 3000 | 229 | 75.23% | 78.17% | 29 | **0** |
| `benchmark-evaluator-node`（旧口径，2026-09-23） | 3895 | 1246 | 34.43% | 24.24% | 137 | **0** |
| `benchmark-external-node-repos` | 2460 | 1385 | 13.29% | 7.22% | 126 | **0** |
| `benchmark-external-node-public` | 438 | 165 | 30.82% | 27.88% | 89 | **0** |
| `benchmark-real` | 844 | 230 | 68.72% | 56.09% | 43 | **0** |
| `benchmark-real-edge` | 844 | 230 | 68.72% | 56.09% | 43 | **0** |
| `benchmark-real-full-v2`（已被 `benchmark-record-weighted-v1` 取代） | 3000 | 229 | 75.27% | 78.60% | 29 | **0** |

放行率在微信/Node/浏览器三份语料上比上一轮更低，是修复「跨环境缺省不可外推」的结果（见报告 11.7i）：那些记录原本被错误放行，现在退回 UNKNOWN。

只看放行率会漏掉一半信息，因此每份基准同时报**可判定率**（`(FOLD + PROTECT) / TOTAL`，即系统真正有足够信息判定的比例）。四份语料并排看，差异比放行率明显得多：

| 语料 | 记录放行率 | 记录可判定率 | 实体可判定率 | 读法 |
|---|---:|---:|---:|---|
| 分层（3 宿主） | 34.35% | 37.56% | 27.13% | 一半以上未决 |
| 分层 + 真实微信 | 30.63% | **48.47%** | 35.87% | 证据把可判定率抬了 11 个百分点，放行率反而略降 |
| Node 官方测试 | 13.66% | **78.54%** | 76.74% | 判得了，大部分判成不能折 —— 策略保守 |
| 浏览器 WPT | 14.39% | **30.28%** | 27.11% | 真的判不了 —— WPT 框架全局没有绑定 |

Node 与浏览器两份语料的放行率几乎相同（13.66% vs 14.39%），但一个是"保守"、一个是"能力不足"。只看放行率会把它们读成同一件事。

`benchmark-record-weighted-v1` 是当前代码重跑的自然分布（记录加权）口径，只覆盖 229 个实体；差分记录 29 条虽能提供反例，但样本仍然偏向高频实体。它回答「工程上按出现频率加权能放行多少」，**支撑安全结论应以分层口径为准**。

所有当前口径的基准目录里都有 `safety-utility.svg`（记录口径那一个除外，因为没有差分反例）。

配套评测：

| 数据集 | 作用 |
|---|---|
| `feature-ablation` | 组件消融。分层样本 3895 条 / 1248 实体 / 19 差分实体 |
| `ablation-full-v2` | 证据层消融。语言基线单独使用时会误放行 2 条 |
| `behavior-check-full-v2` | 独立行为差分。1250 实体全覆盖，实测差分 19 个 |
| `gap-analysis-full-v2` | 决策缺口分桶 |
| `mutation-benchmark` | 变异基准。5 类变异族 21 个用例，20 个断言 + 1 条已知限制 |
| `runtime-divergence` | 困难集基准（View C）。自然集 314 实体 / 154 实测差异 / 检出率 100%；人工压力用例单独统计 |
| `transformation-oracle` | **Level 2 变换 oracle**。直接比较变换前后在目标环境里的行为：20 个用例中，10 个会改变行为的变换全部被拦，放行 9 个 0 不安全，过度保护 1 个（`JSON.parse(...).a` 的属性访问维度缺失） |
| `transformation-execution-subset` | **语料规模的 Level 2 验证**。对 R97 实际放行的 1338 个折叠点做变换前后执行：386 个结果可字面量化（28.8%），**0 个行为不一致**；952 个跳过（function 755 / object 102 / null 67 / symbol 28）。新增跳过构成分析：`CALL_EVAL` 验证率 78.8%、`CONST_EVAL` 11.8%、`BRANCH_PRUNE` 0%，验证子集明确偏向调用求值。这一层也抓到并修掉了非确定性调用（`Date` / `Date.now`）被当作可折叠的缺口 |
| `annotation-sample` | **独立人工标注脚手架**。从 4 宿主主基准的 3895 条逐条结果里分层抽出 500 条（UNKNOWN 208 / FOLD 167 / PROTECT 125；CALL_EVAL 181 / CONST_EVAL 197 / BRANCH_PRUNE 122），附双人标注模板 `labels.tsv` 与 `tools/annotation-agreement.mjs`（一致率 + Cohen's kappa + 冲突清单）。**标签尚未填写**，`exactStateAccuracy` 仍只是自洽校验 |
| `host-attribution` | 宿主归属审计。356 个根节点的实测存在性，列出「只有一个宿主存在且未映射」的候选 |
| `platform-resolution` | Platform-family structural identification coverage **1570 / 1572 = 99.87%**（不是"目标识别准确率"）；其中 **354 个（22.52%）** 能从 `project.private.config.json` 拿到具体基础库版本，停在 `corroborated`（缺独立佐证）；1216 个停在 `context_unknown`。fully confirmed target = **0%**，是设计使然 |
| `target-confirmation-impact` | 目标确认的覆盖增量。三配置并排（可判定率 32.40% → 33.94% → **48.27%**），逐样本转移：UNKNOWN→PROTECT **558**、UNKNOWN→FOLD **0**，Gap Recovery Rate **21.69%** |
| `unknown-breakdown` | UNKNOWN 构成。目标已确认下：模块边界 970 / 代码自身定义的全局 571 / 其余无绑定全局 334 / 微信基础库私有全局 72 / 微信公开宿主 API 68 |
| `wechat-live` | 真实微信开发者工具探针报告（SDK 3.17.3，观测 **1238** 个实体，探测错误 0，含判卷元数据与不可测根节点清单） |
| `wechat-repeat-validation` | 同一 fixture 项目的**第二次采集**（2026-09-23 那次），与 `wechat-live` 一起供 `result-reuse-validation` 比较重复观测是否稳定。实测两次相隔约 29 小时、SDK 均为 3.17.3，**差异观测 0** |
| `wechat-worker-subenvironment` | **多子环境差异的真实项目实测**。fixture 加 4 个独立真实项目（`WeChat-MiniProgram-WebAR`、`qtimer`、`StringArtHelper`、`miniprogram-xiaoxiao-open`）各跑一遍 AppService 与 Worker 对照，另有 1 次 qtimer 重复采集：6 份报告里 12 个实体都是 **5 个不一致**（`wx`、`wx.request`、`Page`、`getApp`、`document` 在 Worker 里不存在），差异集合与环境形状完全一致。真实项目直接打开可跑率约 4/9，其余失败原因是项目编译失败或需要构建。生成方式见 `npm run wechat:worker` 与 `tools/run-worker-sweep.mjs --restart-ide` |
| `wechat-surface-consistency` | Worker 子环境证据的一致性汇总。`npm run eval:wechat-surface` 扫描全部 `worker-vs-appservice.json`，分别比对差异实体集合与 Worker 环境形状；当前 6 份报告、5 个独立项目、2 种签名均为 1 组，一致。 |
| `worker-miniapp-candidates` | GitHub 上含 Worker 的小程序候选。认证后按 `wx.createWorker` 代码搜索分页取到 **230 个去重仓库**，逐个查文件树后筛出 **30 个真·小程序且含 Worker**；下载了其中 12 个，4 个独立项目跑通探针。生成方式见 `tools/search-worker-code-paged.mjs`、`tools/filter-worker-miniapps-concurrent.mjs`、`tools/fetch-worker-miniapps.mjs` |
| `wechat-snapshot-validation` | 微信快照漂移校验。同实体集合重采比对：1240/1240 一致，漂移率 0.00%，危险方向 0 |

### 未决来源

决策对象带 `uncertaintySource`，把 UNKNOWN 拆成三层：

| 语料 | UNKNOWN | binding | runtime | behavior |
|---|---:|---:|---:|---:|
| `benchmark-stratified-v1` | 2432 | 1851 | 566 | 15 |
| `benchmark-wechat` | 2007 | 1851 | 141 | 15 |
| `benchmark-record-weighted-v1` | 714 | 702 | 11 | 1 |
| `benchmark-external-node-tarball` | 710 | 516 | 194 | 0 |
| `benchmark-external-browser-tarball` | 1812 | 1696 | 116 | 0 |

`binding` = 静态绑定没解析出来；`runtime` = 目标未确认或缺必需运行时观测；`behavior` = 契约维度缺失或证据不可折叠。三者强制动作相同，拆分只影响可解释性与改进优先级。

## 历史产物（旧口径，引用前需重跑）

**已删除**（2026-09-23 清理，释放 2.3 GB）。被取代、被标记 `DEPRECATED` 或可重建的产物一律不再保留：

```text
benchmark-real-full / benchmark-real-all-runtimes / benchmark-smoke
ablation / ablation-full
behavior-check / behavior-check-full
gap-analysis / gap-analysis-invocation / gap-analysis-full
gap-analysis-full-invocation / gap-audit-capability
smoke / smoke2
.corpus-archive（历史语料归档） / .corpus-cache（下载缓存）
```

需要旧口径的数字时按报告 §10 的对应脚本重跑；当前口径一律用上表里的数据集。

**仍在目录里但基于早期语料**（引用前先核对，结论已并入报告对应章节）：

| 数据集 | 状态 |
|---|---|
| `result-reuse-validation` | 基于全量语料聚合，未受抽样修正影响，数字待复核 |
| `framework-filter-ablation` | 待复核（报告 §11.7 的结论已按当前口径重写） |
| `constant-propagation-ablation` | 待复核（结论见报告 §11.11） |
| `external-tool-baseline` | 待复核（结论见报告 §11.10） |

`benchmark-real` 与 `benchmark-real-edge` 基于 98,605 条记录的早期切片（`real-miniapp`），已按当前口径重跑：

重建前的语料（1250 实体、Node 内建未带 `node:` 前缀、没有 `inFileDefinition` 字段）曾在 `.corpus-archive/` 下留档，已在 2026-09-23 的清理中删除。它与当前语料的差异已经记进报告 §11.7.10（判定口径差 20 条，来自 `node:` 前缀规范化）。

| 数据集 | 样本 | 实体 | 记录放行率 | 实测差分记录 | 实测不实折叠 |
|---|---:|---:|---:|---:|---:|
| `benchmark-real` | 844 | 230 | 69.31% | 3 | **0** |
| `benchmark-real-edge` | 844 | 230 | 69.31% | 3 | **0** |

## 复现命令

```bash
npm test

# 主基准（按实体分层）
npm run eval:benchmark:stratified

# 按记录加权的频率口径
npm run eval:benchmark:full

# 加真实微信证据
npm run eval:benchmark:wechat

# 外部语料
npm run dataset:fetch:node:large
npm run dataset:corpus:node:large
npm run eval:benchmark:node:large

npm run dataset:fetch:browser:large
npm run dataset:corpus:browser:large
npm run eval:benchmark:browser:large

# 配套
npm run eval:features
npm run eval:ablation:full
npm run eval:behavior:full
npm run eval:gaps:full
npm run eval:mutation
npm run eval:divergence
npm run eval:transformation-oracle
npm run eval:transformation-subset
npm run eval:host-attribution
npm run eval:platform-resolution
npm run wechat:validate
npm run eval:target-confirmation
npm run eval:unknown-breakdown
```
