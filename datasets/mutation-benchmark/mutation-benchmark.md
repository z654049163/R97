# R97 变异基准

生成时间：2026-09-23T08:53:27.524Z

用例：21（断言 20，已知限制 1），通过 20，失败 0

期望值来自项目不变量，不是从当前实现反推的。断言落在分析层：
binding kind、归一化路径、required runtime 与契约维度。

## 分族结果

| 变异族 | 用例 | 通过 | 失败 |
|---|---:|---:|---:|
| binding-shadowing | 4 | 4 | 0 |
| alias-resolution | 5 | 5 | 0 |
| dynamic-property | 3 | 3 | 0 |
| runtime-attribution | 5 | 5 | 0 |
| transformation-aware | 3 | 3 | 0 |

## 失败用例

无。

## 已知限制（不计入通过/失败）

### alias-used-before-declaration

```javascript
w.request({}); const w = wx;
```

别名解析缺少 TDZ 守卫，仍按 wx.request 展开；结果是更保守而不是更宽松。

实际观测：[{"entityId":"wx.request","bindingKind":"runtime_global","requiredRuntimeIds":["e4-wechat-real"],"requiredRuntimeStatus":"definite","requiredDimensions":["callability","existence","type"]},{"entityId":"wx","bindingKind":"runtime_global","requiredRuntimeIds":["e4-wechat-real"],"requiredRuntimeStatus":"definite","requiredDimensions":["existence","type"]}]

## 全部用例

| 变异族 | 用例 | 结果 | 源码 |
|---|---|---|---|
| binding-shadowing | shadow-local-const | 通过 | `const wx = {}; wx.request({});` |
| binding-shadowing | shadow-function-parameter | 通过 | `function f(wx) { wx.request({}); }` |
| binding-shadowing | shadow-inner-scope | 通过 | `function f() { const wx = {}; wx.request({}); }` |
| binding-shadowing | shadow-var-declaration | 通过 | `var wx; wx.request({});` |
| alias-resolution | alias-const | 通过 | `const w = wx; w.request({});` |
| alias-resolution | alias-const-chain | 通过 | `const w = wx; const v = w; v.request({});` |
| alias-resolution | alias-let-stable | 通过 | `let w = wx; w.request({});` |
| alias-resolution | alias-let-mutated | 通过 | `let w = wx; w = {}; w.request({});` |
| alias-resolution | alias-assigned-after-declaration | 通过 | `let w; w = wx; w.request({});` |
| alias-resolution | alias-used-before-declaration | 通过 | `w.request({}); const w = wx;` |
| dynamic-property | dynamic-const-key | 通过 | `const k = "request"; wx[k]({});` |
| dynamic-property | dynamic-computed-key | 通过 | `const k = getKey(); wx[k]({});` |
| dynamic-property | dynamic-inline-call-key | 通过 | `wx[getKey()]();` |
| runtime-attribution | runtime-node | 通过 | `process.version;` |
| runtime-attribution | runtime-node-buffer | 通过 | `Buffer.from("abc");` |
| runtime-attribution | runtime-browser | 通过 | `window.document;` |
| runtime-attribution | runtime-language-builtin | 通过 | `Math.max(1, 2);` |
| runtime-attribution | runtime-pure-computation | 通过 | `1 + 2;` |
| transformation-aware | transformation-call-requires-callability | 通过 | `wx.setStorageSync("a", 1);` |
| transformation-aware | transformation-branch-needs-no-callability | 通过 | `if (wx.setStorageSync) {}` |
| transformation-aware | transformation-typeof-needs-no-callability | 通过 | `typeof wx.setStorageSync;` |
