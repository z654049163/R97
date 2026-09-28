# R97 独立行为差分校验

生成时间：2026-09-24T07:25:28.937Z

参与校验的运行时实体：1248

浏览器：Edg/150.0.4078.83

## 观测覆盖

| 运行时 | 生成观测的实体数 |
|---|---:|
| 语言基线 E1 | 1248 |
| Node E2 | 1248 |
| Edge E5 | 1248 |

## 判定分布

| 状态 | 数量 |
|---|---:|
| FOLD | 300 |
| PROTECT | 38 |
| UNKNOWN | 910 |

## 独立校验指标

| 指标 | 数值 | 含义 |
|---|---:|---|
| FOLD 可靠性 | 100.00% | 允许折叠的实体中，Node 与 Edge 实际执行观测一致的比例 |
| 一致实体上的折叠覆盖 | 24.83% | Node 与 Edge 本就一致的实体中，被安全放行的比例 |
| 跨宿主一致率 | 96.79% | 全部实体中 Node 与 Edge 观测一致的实体比例 |
| 探针一致率 | 98.80% | 描述符探针与直接访问探针结果一致的比例 |

## 保护判定来源

| 来源 | 数量 | 含义 |
|---|---:|---|
| 跨宿主真实差异 | 27 | Node 与 Edge 实际执行结果不同，保护有直接证据 |
| 仅语言基线差异 | 11 | Node 与 Edge 一致，但求值基线不含该宿主全局，属于保守保护 |

真实差分实体数：40

## 保守保护实体（Node 与 Edge 一致）

- node:fs.writeFileSync
- node:assert.strictEqual
- node:path.resolve
- node:fs.readFileSync
- node:path.join
- node:fs.readdir
- node:fs.stat
- node:fs.open
- node:fs.readFile
- node:fs.close
- node:fs.writeFile

## 两套探针实现不一致

- RegExp.$1（node 一致=false，edge 一致=false）
- RegExp.$2（node 一致=false，edge 一致=false）
- RegExp.$1.length（node 一致=false，edge 一致=false）
- node:fs.writeFileSync（node 一致=false，edge 一致=true）
- node:assert.strictEqual（node 一致=false，edge 一致=true）
- node:path.resolve（node 一致=false，edge 一致=true）
- node:fs.readFileSync（node 一致=false，edge 一致=true）
- node:path.join（node 一致=false，edge 一致=true）
- node:fs.readdir（node 一致=false，edge 一致=true）
- node:fs.stat（node 一致=false，edge 一致=true）

