import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSource } from "../src/analyzer.mjs";
import { analyzeAndDecide } from "../src/pipeline.mjs";
import {
  BINDING_KIND,
  KNOWLEDGE_STATE,
  REASON_CODE,
} from "../src/constants.mjs";
import { RUNTIME_IDS } from "../src/runtime-profiles.mjs";
import { isNonDeterministicCall } from "../src/contract-builder.mjs";

/**
 * OBsmith (OOPSLA '26 / PACMPL) 对标压力与边界测试套件。
 *
 * 验证 R97 在面对 OBsmith 揭示的 11 类工业级混淆/重写缺陷（JS-Confuser 与
 * Obfuscator.IO 经典缺陷，包括作用域越界、反射元数据破坏、异常静默抑制、
 * 动态 eval、非确定性调用及复杂语法边界）时的安全性与守门有效性。
 */

test("OBsmith Bug Class 1 [反射元数据]: 访问实例构造函数名属于动态属性，不被错误折叠", () => {
  const code = `
    class PaymentService {}
    const instance = new PaymentService();
    const serviceName = instance.constructor.name;
  `;
  const result = analyzeSource({ source: code, filePath: "obsmith/class1.js" });
  assert.ok(Array.isArray(result.findings));
  // 实例的动态属性不应被误判为可安全折叠的宿主全局 API
  const foldedDecisions = analyzeAndDecide({
    source: code,
    filePath: "obsmith/class1.js",
    targetRuntimeIds: [RUNTIME_IDS.NODE],
  });
  // 任何针对类反射元数据的访问均不授权 FOLD
  for (const decision of foldedDecisions.decisions) {
    assert.notEqual(decision.decision.knowledgeState, KNOWLEDGE_STATE.FOLD);
  }
});

test("OBsmith Bug Class 2 [反射与动态调用]: 动态 eval 调用自动降级，阻断静态折叠", () => {
  const code = `
    const result = eval("var sensitiveToken = 42; sensitiveToken;");
  `;
  const result = analyzeSource({ source: code, filePath: "obsmith/class2.js" });
  const evalFinding = result.findings.find(
    (f) => f.runtimeEntity.entityId === "eval",
  );
  assert.ok(evalFinding, "应捕获 eval 程序点");

  const decisionResult = analyzeAndDecide({
    source: code,
    filePath: "obsmith/class2.js",
    targetRuntimeIds: [RUNTIME_IDS.NODE],
  });
  // eval 绝不授权 FOLD
  for (const decision of decisionResult.decisions) {
    assert.notEqual(decision.decision.knowledgeState, KNOWLEDGE_STATE.FOLD);
  }
});

test("OBsmith Bug Class 3 [异常抑制缺陷]: 引用未声明标识符不能被静默折叠为 undefined，确保 catch 正常触发", () => {
  // OBsmith 揭示的严重 Bug：混淆器将未定义变量替换为 undefined，导致原代码本该抛出 ReferenceError 的行为被静默吞掉
  const code = `
    try {
      const val = undeclaredExternalIdentifier;
    } catch (e) {
      handleFallback();
    }
  `;
  const result = analyzeSource({ source: code, filePath: "obsmith/class3.js" });
  const finding = result.findings.find(
    (f) => f.runtimeEntity.entityId === "undeclaredExternalIdentifier",
  );
  assert.ok(finding, "应捕获未声明外部标识符");
  assert.equal(
    finding.bindingRef.bindingKind,
    BINDING_KIND.UNRESOLVED_GLOBAL,
    "未声明标识符应为 UNRESOLVED_GLOBAL",
  );

  const decisionResult = analyzeAndDecide({
    source: code,
    filePath: "obsmith/class3.js",
    targetRuntimeIds: [RUNTIME_IDS.NODE],
  });
  // 未声明标识符严禁 FOLD，必须守住 catch 块
  for (const decision of decisionResult.decisions) {
    assert.equal(decision.decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
    assert.ok(
      decision.decision.reasonCodes.includes(REASON_CODE.BINDING_UNRESOLVED),
    );
  }
});

test("OBsmith Bug Class 4 [作用域越界]: 块级作用域变量在块外访问被识别为未解析，严禁折叠", () => {
  const code = `
    {
      let blockScopedVar = "secret";
    }
    const leaked = blockScopedVar;
  `;
  const result = analyzeSource({ source: code, filePath: "obsmith/class4.js" });
  const finding = result.findings.find(
    (f) => f.runtimeEntity.entityId === "blockScopedVar",
  );
  assert.ok(finding);
  assert.equal(finding.bindingRef.bindingKind, BINDING_KIND.UNRESOLVED_GLOBAL);

  const decisionResult = analyzeAndDecide({
    source: code,
    filePath: "obsmith/class4.js",
    targetRuntimeIds: [RUNTIME_IDS.NODE],
  });
  for (const decision of decisionResult.decisions) {
    assert.equal(decision.decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  }
});

test("OBsmith Bug Class 5 [控制流篡改防护]: 宿主环境嗅探分支在目标未确认时严格保护，杜绝死分支误剪", () => {
  // 核心事故模型：在 Node 环境下求值 typeof wx 为 'undefined'，若折叠则导致微信环境中真实分支丢失
  const code = `
    if (typeof wx !== "undefined" && wx.request) {
      wx.request({ url: "https://api.example.com" });
    } else {
      fallbackBrowserRequest();
    }
  `;
  const decisionResult = analyzeAndDecide({
    source: code,
    filePath: "obsmith/class5.js",
    evaluatorRuntimeId: RUNTIME_IDS.NODE, // 求值环境是 Node
    // 未提供外部已确认目标（默认为 inferred 或未确认）
  });
  // 严禁将 typeof wx 误判为 FOLD（否则分支被剪）
  for (const decision of decisionResult.decisions) {
    assert.notEqual(decision.decision.knowledgeState, KNOWLEDGE_STATE.FOLD);
  }
});

test("OBsmith Bug Class 6 [类型篡改防护]: 对可能为 undefined 的外部属性链访问不授权折叠", () => {
  const code = `
    const user = getExternalUser();
    const role = user.profile.role;
  `;
  const result = analyzeSource({ source: code, filePath: "obsmith/class6.js" });
  assert.ok(Array.isArray(result.findings));

  const decisionResult = analyzeAndDecide({
    source: code,
    filePath: "obsmith/class6.js",
    targetRuntimeIds: [RUNTIME_IDS.NODE],
  });
  for (const d of decisionResult.decisions) {
    assert.notEqual(d.decision.knowledgeState, KNOWLEDGE_STATE.FOLD);
  }
});

test("OBsmith Bug Class 7 [极端语法边界]: 带括号的异步函数除法运算不引发解析器崩溃", () => {
  const code = `
    const val = (async function () { }) / 1;
  `;
  assert.doesNotThrow(() => {
    const result = analyzeSource({ source: code, filePath: "obsmith/class7.js" });
    assert.ok(Array.isArray(result.findings));
  });
});

test("OBsmith Bug Class 8 [极端语法边界]: 类静态块中函数声明不引发作用域分析器崩溃", () => {
  const code = `
    class StaticBlockScopeTest {
      static {
        function innerHelper() { return 1; }
        innerHelper();
      }
    }
  `;
  assert.doesNotThrow(() => {
    const result = analyzeSource({ source: code, filePath: "obsmith/class8.js" });
    assert.ok(Array.isArray(result.findings));
  });
});

test("OBsmith Bug Class 9 [极端语法边界]: 立即执行类表达式与逻辑非运算符组合正常处理", () => {
  const code = `
    const flag = !(class {}());
  `;
  assert.doesNotThrow(() => {
    const result = analyzeSource({ source: code, filePath: "obsmith/class9.js" });
    assert.ok(Array.isArray(result.findings));
  });
});

test("OBsmith Bug Class 10 [动态类型解引用]: 动态计算键的属性访问保持 dynamic 绑定，不授权折叠", () => {
  const code = `
    const key = getDynamicKey();
    const service = wx[key];
  `;
  const result = analyzeSource({ source: code, filePath: "obsmith/class10.js" });
  const dynamicFinding = result.findings.find(
    (f) => f.bindingRef.bindingKind === BINDING_KIND.DYNAMIC,
  );
  assert.ok(dynamicFinding, "动态键访问必须识别为 dynamic 绑定");

  const decisionResult = analyzeAndDecide({
    source: code,
    filePath: "obsmith/class10.js",
    targetRuntimeIds: [RUNTIME_IDS.NODE],
  });
  for (const d of decisionResult.decisions) {
    assert.equal(d.decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  }
});

test("OBsmith Bug Class 11 [非确定性内建拦截]: 核心语言内建 Date.now / Math.random 强制拦截折叠", () => {
  const languageCalls = [
    "Date.now()",
    "Math.random()",
  ];

  for (const callExpr of languageCalls) {
    const code = `const val = ${callExpr};`;
    const result = analyzeSource({ source: code, filePath: "obsmith/class11.js" });
    const callFinding = result.findings.find(
      (f) => f.transformationKind === "CALL_EVAL",
    );
    assert.ok(callFinding, `必须捕获调用点: ${callExpr}`);
    assert.ok(
      isNonDeterministicCall(callFinding),
      `必须识别为非确定性语言调用: ${callExpr}`,
    );

    const decisionResult = analyzeAndDecide({
      source: code,
      filePath: "obsmith/class11.js",
      targetRuntimeIds: [RUNTIME_IDS.NODE],
    });
    // 非确定性调用绝对不能放行折叠
    for (const d of decisionResult.decisions) {
      assert.notEqual(
        d.decision.knowledgeState,
        KNOWLEDGE_STATE.FOLD,
        `非确定性调用 ${callExpr} 绝对不能授权 FOLD`,
      );
    }
  }
});
