# R97 `src/analyzer.mjs` 模块符号与行号导航地图 (Symbol Map)

> **核心原则**：`src/analyzer.mjs` 属于超长核心文件（约 1770+ 行）。
> **严禁在会话中无参全量 Read**，否则将向上下文注入 20,000+ tokens，极易引发上下文压缩（Context Compaction）、失忆以及 Loop Guard 拦截死循环！
> **操作规范**：请先查阅本表定位行号，或使用 `grep -n` 精准检索后，搭配 `Read(offset, limit)` 仅读取目标窗口（通常 40~80 行）。

---

## 模块功能分区与行号对照表

| 序号 | 逻辑域 (Functional Domain) | 行号区间 (Approx. Line) | 核心函数 / 结构体 / 符号 | 职责说明 |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **入口与顶层配置** | L1 ~ L129 | `DEFAULT_RUNTIME_GLOBALS`<br>`analyzeSource`<br>`extractRuntimeGlobalNames` | 分析器总入口，协调 AST 解析、作用域构建、Finding 收集与去重排序 |
| **2** | **AST 解析与导入识别** | L130 ~ L200 | `parseSource`<br>`getRequiredBuiltinPath`<br>`bundleModulePathForRequire`<br>`getImportModulePath` | 容错 AST 解析（支持 module/script、JSX、TS 注解）与 require/import 路径规范化 |
| **3** | **作用域与绑定系统** | L201 ~ L585 | `class Scope`<br>`buildScopeTree`<br>`declarePatterns`<br>`recordImplicitGlobalAssignment` | 词法作用域树构建、变量声明提升、shadowing 判定、变量重赋值与隐式全局赋值追踪 |
| **4** | **AST 遍历与收集骨架** | L586 ~ L781 | `collectFindings`<br>`walkChildren`<br>`isBindingTargetIdentifier`<br>`findPrimaryRuntimeReference` | AST 自顶向下遍历，识别潜在宿主引用点、过滤声明左值、独立标识符使用筛选 |
| **5** | **Bundle 导出跨模块分析** | L782 ~ L1041 | `bundleExportsFor`<br>`analyzeExportProvenance`<br>`resolveBundleExport` | 穿透分析 CommonJS/ES6 模块导出链（支持 Webpack/Babel 编译桩透明穿透与别名回溯） |
| **6** | **表达式路径解析器** | L1042 ~ L1412 | `resolveExpressionPath`<br>`moduleResolution`<br>`isR97Relevant`<br>`getStaticPropertyName` | 核心路径解析：将 AST 成员表达式链递归归一化为点分标识符路径（如 `globalThis.Math.max`） |
| **7** | **静态常量求值器** | L1413 ~ L1542 | `resolveStaticPrimitive`<br>`isUsedBeforeDeclaration`<br>`resolveInFileDefinition` | 安全静态求值：有限常量传播、常量折叠、模板字面量、只读常量数组索引取值等 |
| **8** | **Finding 构造与上下文** | L1543 ~ L1771 | `pushFinding`<br>`buildUsageContext`<br>`getAccessMode`<br>`classifyArguments`<br>`inferCapabilityDomain` | 构造规范化 Finding 数据结构，推断调用模式（call/read/write）、参数字面量特征与能力域 |

---

## 典型维护场景速查与局部读取范例

### 场景 A：增强或排查常量折叠 / 静态求值逻辑（如数组、字符串拼接）
- **目标行区间**：L1410 ~ L1510
- **推荐工具调用**：
  ```json
  { "file_path": ".../src/analyzer.mjs", "offset": 1410, "limit": 70 }
  ```

### 场景 B：排查属性访问链或全局别名解析（如 `window`, `globalThis`, 变量别名追踪）
- **目标行区间**：L1040 ~ L1180
- **推荐工具调用**：
  ```json
  { "file_path": ".../src/analyzer.mjs", "offset": 1040, "limit": 80 }
  ```

### 场景 C：排查作用域遮蔽、参数遮蔽或未声明隐式全局
- **目标行区间**：L200 ~ L360
- **推荐工具调用**：
  ```json
  { "file_path": ".../src/analyzer.mjs", "offset": 200, "limit": 80 }
  ```

### 场景 D：排查 Webpack / Babel 导出的穿透反解
- **目标行区间**：L810 ~ L950
- **推荐工具调用**：
  ```json
  { "file_path": ".../src/analyzer.mjs", "offset": 810, "limit": 80 }
  ```
