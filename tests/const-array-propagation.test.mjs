import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAndDecide } from "../src/pipeline.mjs";
import { buildEvidenceRecords } from "../src/evidence/evidence-builder.mjs";
import { collectLanguageObservations } from "../src/evidence/language-probe.mjs";
import { collectNodeObservations } from "../src/evidence/node-probe.mjs";
import { RUNTIME_IDS } from "../src/runtime-profiles.mjs";
import { TARGET_RUNTIME_SOURCE } from "../src/constants.mjs";

const VALID_FROM = "2026-09-17T00:00:00.000Z";
const VALID_UNTIL = "2026-10-17T00:00:00.000Z";

test("只读常量数组索引取值传播支持 globalThis 属性安全规范化与物证闭环放行", () => {
  const code = 'var arr = ["Math", "max"]; globalThis[arr[0]][arr[1]](1, 2, 3);';
  
  // 1. 静态解析与实体提取验证
  const initial = analyzeAndDecide({
    source: code,
    filePath: "const-array-propagation.js",
    targetRuntimeIds: [RUNTIME_IDS.LANGUAGE, RUNTIME_IDS.NODE],
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    policyVersion: "policy-evidence",
    asOf: "2026-09-17T12:00:00.000Z",
    analysisMode: "pro",
  });

  assert.equal(initial.findingCount, 2);
  assert.equal(initial.decisions.length, 2);
  const normalizedPaths = initial.decisions.map(d => d.runtimeEntity.normalizedPath);
  assert.ok(normalizedPaths.includes("globalThis.Math"));
  assert.ok(normalizedPaths.includes("globalThis.Math.max"));
  // 严格遵守 R97 不变量：未有权威外部物证前，保持安全的 UNKNOWN 状态
  assert.ok(initial.decisions.every(d => d.decision.knowledgeState === "UNKNOWN"));

  // 2. 收集 E1/E2 物证并执行闭环决策
  const entityDimensions = Object.fromEntries(
    initial.decisions.map((plan) => [
      plan.runtimeEntity.entityId,
      plan.semanticContract.requiredDimensions,
    ]),
  );
  const language = collectLanguageObservations({
    entityDimensions,
    observedAt: VALID_FROM,
  });
  const node = collectNodeObservations({
    entityDimensions,
    observedAt: VALID_FROM,
  });
  const records = buildEvidenceRecords({
    decisionPlans: initial.decisions,
    runtimeCollections: {
      [RUNTIME_IDS.LANGUAGE]: language,
      [RUNTIME_IDS.NODE]: node,
    },
    policyVersion: "policy-evidence",
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
  });

  const resolved = analyzeAndDecide({
    source: code,
    filePath: "const-array-propagation.js",
    targetRuntimeIds: [RUNTIME_IDS.LANGUAGE, RUNTIME_IDS.NODE],
    targetRuntimeSource: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
    evaluatorRuntimeId: RUNTIME_IDS.LANGUAGE,
    policyVersion: "policy-evidence",
    asOf: "2026-09-17T12:00:00.000Z",
    analysisMode: "pro",
    evidenceRecords: records,
  });

  // 确证物证支持后，纯语言安全属性允许 FOLD
  assert.ok(resolved.decisions.every(d => d.decision.knowledgeState === "FOLD"));
  assert.ok(resolved.decisions.every(d => d.decision.enforcementAction === "ALLOW_FOLD"));
});

test("被重赋值的数组不进行常量索引传播，保持防御性 UNKNOWN 兜底", () => {
  const code = 'var arr = ["Math", "max"]; arr = ["wx", "request"]; globalThis[arr[0]][arr[1]]();';
  const result = analyzeAndDecide({
    source: code,
    filePath: "mutated-array.js",
    targetRuntimeIds: ["e1-ecmascript", "e2-node-24.21.0"],
    analysisMode: "pro",
  });

  assert.ok(result.decisions.some(d => d.decision.enforcementAction === "BLOCK_FOLD"));
});
