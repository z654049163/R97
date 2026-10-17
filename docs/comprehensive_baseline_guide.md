# R97 四层 10 款基线模型评测体系与数据查阅指南 (Comprehensive Baseline Benchmark Guide)

> **核心原则（防死循环红线）**：
> 1. **查阅实验结果与对比数据**：直接读取已经落盘的结构化报告 `datasets/baseline-comparison/baseline-comparison-report.md` 或 JSON 文件 `datasets/baseline-comparison/baseline-comparison-summary.json`，**严禁**为了查看实验数据而读取评测脚本源码！
> 2. **查阅或修改评测逻辑**：严禁全量无参读取 `src/evaluation/comprehensive-baseline-benchmark.mjs`（近 400 行）；请对照下表中的精确行号，使用 `Read(offset, limit)` 仅读取目标函数（建议 25~50 行）。

---

## 一、评测脚本源码符号与行号速查表 (`src/evaluation/comprehensive-baseline-benchmark.mjs`)

| 层级与分类 | 模型名称与学术标杆 | 对应源码函数 | 所在行号区间 | 核心机理与特征简述 |
| :--- | :--- | :--- | :--- | :--- |
| **第 1 层：理论消融** | **A0: 全量激进折叠** (GCC/Terser 理论上界) | `evaluateA0` | L59 ~ L63 | 假设所有节点均可折叠，用于量化无守门时的**破坏上限（100% 误放行）** |
| **第 1 层：理论消融** | **A-safe: 全量保守全拦截** (理论下界) | `evaluateASafe` | L65 ~ L69 | 假设所有节点均不可折叠，用于量化绝对保守时的**误报上限（100% 过度保护）** |
| **第 2 层：启发式规则** | **A1: 经典硬编码黑名单** (147 符号) | `evaluateA1` | L73 ~ L85 | 基于传统 147 个宿主全局变量静态名单匹配，无法识别形参遮蔽与别名中继 |
| **第 2 层：启发式规则** | **A2: 常见前缀规则黑名单** | `evaluateA2` | L87 ~ L99 | 基于 `wx.`, `window.`, `process.` 等常见前缀匹配，存在漏报与误杀 |
| **第 3 层：SOTA 工具链** | **Terser (TSE 2023 工业标准压缩器)** | `evaluateTerser` | L101 ~ L118 | 工业级标准 AST 常量折叠器，缺少运行时环境感知，误切异构宿主分支 |
| **第 3 层：SOTA 工具链** | **Webcrack (流行通用 AST 反混淆)** | `evaluateWebcrack` | L120 ~ L140 | 擅长解密字符串与数组混淆，底层无跨环境物理契约，对宿主依赖无防护 |
| **第 3 层：SOTA 工具链** | **JSIMPLIFIER (NDSS 2026 最新标杆)** | `evaluateJSIMPLIFIERVanilla` | L142 ~ L160 | 离线单机 Node/VM 求值，因沙箱缺少宿主 API 将 `typeof wx` 误折叠为 `'undefined'` |
| **第 3 层：SOTA 工具链** | **Google CASCADE (ICSE 2026 代表)** | `evaluateCASCADE` | L162 ~ L178 | 在 Node 环境执行 Prelude 求值，常量传播 Worklist 陷入同构单机假定 |
| **第 4 层：前沿 LLM** | **JsDeObsBench / GPT-4o (ACM CCS 2025)** | `evaluateLLMJsDeObsBench` | L180 ~ L197 | 统计概率补全反混淆，受训练语料偏见影响，存在幻觉误折叠且耗时达数秒 |
| **守门体系 (本项目)** | **R97-Lite / R97-Pro-v6** | `evaluateR97` | L199 ~ L212 | 纯语言正交闭包穿透 + 多端物理契约双向校验，**唯一达到 0 不安全折叠 (100% 保真)** |
| **评测驱动与报告** | 评测运行主函数与数据统计 | `runComprehensiveBenchmark` | L213 ~ L320 | 构建 33 个用例集、采集探针证据、计算耗时与四维指标矩阵 |
| **报告生成与持久化** | Markdown 与 JSON 报告渲染 | - | L321 ~ L395 | 将评测数据落盘至 `datasets/baseline-comparison/` |

---

## 二、评测用例集构成与来源映射

评测用例集共 **33 个高压跨宿主程序点**（涵盖 9 个纯语言确定性计算点、24 个异构跨宿主与动态状态敏感实体），来源如下：
1. **合成高压用例 (16 项)**：位于 `src/evaluation/cases.mjs`，涵盖基本类型运算、作用域形参遮蔽、环境探测分支、别名传递等；
2. **外部工具真实用例 (17 项)**：位于 `src/evaluation/external-baseline-cases.mjs`，源自 Webcrack / Terser / JSIMPLIFIER 真实混淆样本。

---

## 三、快速执行与报告查看方法

- **运行全量评测**：
  ```bash
  npm run eval:comprehensive-baselines
  ```
- **查看结构化报告（秒级响应，无需读源码）**：
  - Markdown 报告：`datasets/baseline-comparison/baseline-comparison-report.md`
  - 机器可读 JSON 数据：`datasets/baseline-comparison/baseline-comparison-summary.json`
