# 数据集清单与入库策略

更新时间：2026-09-29

## 为什么大语料不入库

GitHub 对**单个文件**有 100 MB 硬限制，超过会被服务端直接拒绝推送。本项目的
主语料 `real-miniapp-full/real-miniapp-candidates.jsonl` 是 **1.24 GB**，
即使换用 Git LFS 也不可行——免费额度只有 1 GB 存储，装不下这一个文件。

所以仓库采用「代码 + 产物入库、语料源本地保留」的策略：

| 类别 | 是否入库 | 原因 |
|---|---|---|
| 评测产物（report / summary / results） | 入库 | 体积 KB–MB 级，是论文所有数字的直接来源，可独立复核 |
| 采集与重建脚本 | 入库 | `tools/fetch-*.mjs`、`npm run dataset:corpus*`，语料可重放 |
| 语料源（原始 jsonl、下载的第三方项目） | 不入库 | 1.4 GB，超过 GitHub 单文件限制；且有第三方许可证问题 |

**"完整"的定义不是把 GB 级二进制塞进 git**，而是：拿到仓库后能重建出同样的语料、
跑出同样的数字。评测产物（`benchmark-results.jsonl`、各 `*-summary.json`）都已入库，
所以每个论文数字都能在仓库里直接核对。

## 语料源（本地，可重建）

| 数据集 | 大小 | 内容 | 重建方式 |
|---|---:|---|---|
| `real-miniapp-full` | 1.24 GB | 120 万程序点 / 1248 实体 / 1519 项目 | `npm run dataset:corpus:full` |
| `real-miniapp` | 94 MB | 早期 98,605 条切片 | `npm run dataset:corpus` |
| `external-node-tarball` | 22.5 MB | Node 官方测试 900 文件 / 22,533 程序点 | `npm run dataset:fetch:node:large` → `dataset:corpus:node:large` |
| `external-browser-tarball` | 13.6 MB | WPT 900 文件 / 13,287 程序点 | `npm run dataset:fetch:browser:large` → `dataset:corpus:browser:large` |
| `public-node-sample` / `public-wpt-sample` | 约 1 MB | 小规模冒烟语料 | `npm run dataset:fetch:node` / `dataset:fetch:wpt` |
| `worker-miniapp-projects` | 44 MB | 12 个含 Worker 的第三方小程序 | `tools/fetch-worker-miniapps.mjs`（注意各自许可证） |

原始微信小程序语料来自本地采集目录，不属于本仓库，也不随仓库分发。

## 评测产物（已入库）

| 数据集 | 内容 | 论文用途 |
|---|---|---|
| `benchmark-stratified-v1` | 3 宿主主基准，3895 样本 / 1246 实体 | 主结果（长尾覆盖口径） |
| `benchmark-wechat` | 4 宿主主基准（+真实微信 AppService） | 主结果（完整证据口径） |
| `benchmark-record-weighted-v1` | 自然分布（记录加权） | 工程 utility |
| `benchmark-external-node-tarball` / `-browser-tarball` | Node / WPT 外部语料 | 跨语料外部验证 |
| `benchmark-external-*-repos` / `-public` / `-wpt` | 公开仓库与小样本语料 | 扩展验证 |
| `platform-resolution` | Platform-family 结构识别覆盖率 | 目标解析章节 |
| `unknown-breakdown` | UNKNOWN 五桶构成 | 未决分析章节 |
| `target-confirmation-impact` | 目标确认的覆盖增量 | 目标解析章节 |
| `mutation-benchmark` | 5 类变异族 21 用例 | 鲁棒性 |
| `runtime-divergence` | 困难集（自然 314 实体 + 人工 12 用例） | 检出率 |
| `transformation-oracle` / `transformation-execution-subset` | 变换层验证 | 安全声明的第二层证据 |
| `annotation-sample` | 500 条分层样本 + 双人标注模板 + kappa 脚本 | 独立人工 oracle（标签待填） |
| `wechat-live` / `wechat-repeat-validation` / `wechat-snapshot-validation` | 真实微信观测与重复性/漂移校验 | 判卷真值来源 |
| `wechat-worker-subenvironment` / `wechat-surface-consistency` | Worker 子环境实测 | 子环境 case study |
| `host-attribution` | 宿主归属审计 | 归属正确性 |
| `result-reuse-validation` | 重复性与缓存边界 | 稳定性 |

## 复现路径

完整复现需要两步：

1. **重建语料**：准备原始小程序包目录（本地采集，不入库），按上表命令重建 jsonl。
2. **跑评测**：`npm run eval:benchmark:stratified` 等命令，产物写入对应 `datasets/` 目录。

只想核对论文数字的话不需要第 1 步——仓库里的 `benchmark-results.jsonl` 已经包含
每一条样本的实体、变换类型、绑定类型、期望状态与实际判定，可以直接统计。
