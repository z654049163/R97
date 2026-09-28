import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWLEDGE_STATE,
  REASON_CODE,
  TARGET_RUNTIME_STATUS,
} from "../src/constants.mjs";
import { analyzeAndDecide } from "../src/pipeline.mjs";
import { RUNTIME_IDS } from "../src/runtime-profiles.mjs";

const ARTIFACT = "miniapp/app-service.js";

test("非确定性调用与返回值用途同时命中时不产生重复维度", () => {
  // 回归：`requiredDimensionsFor` 在 returnValueUsage 为真时已经会加
  // `return_value`，非确定性规则再追加一次就会让契约模型层的去重断言抛错。
  // 这个组合此前没有任何测试覆盖——201 项测试全绿，却只有跑
  // `eval:constant-propagation` 才会踩到。
  const result = analyzeAndDecide({
    source: "const stamp = Date.now();",
    filePath: "non-deterministic.js",
    targetRuntimeIds: [],
    targetRuntimeSource: "unknown",
  });

  const decision = result.decisions[0];
  assert.ok(decision, "应当产生判定");
  const dimensions = decision.semanticContract.requiredDimensions;
  assert.equal(
    new Set(dimensions).size,
    dimensions.length,
    `维度不应重复：${dimensions.join(",")}`,
  );
});

test("文件内自己赋值的全局不改变判定：仍是 UNKNOWN", () => {
  // wcc 产物写法：$gwx 在顶层赋值，wh 在 $gwx 体内赋值，读取点读 wh.nh。
  const source = [
    "$gwx = function (path) {",
    "  wh = makeWh();",
    "  function rev(ops) { return wh.nh(ops); }",
    "  return rev;",
    "};",
  ].join("\n");

  const result = analyzeAndDecide({
    source,
    filePath: ARTIFACT,
    targetRuntimeIds: [],
    targetRuntimeSource: "unknown",
  });

  const decision = result.decisions.find(
    (item) => item.runtimeEntity.entityId === "wh.nh",
  );
  assert.ok(decision);
  assert.equal(
    decision.bindingRef.inFileDefinition,
    "function_body_assignment",
  );
  assert.equal(decision.decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.ok(decision.decision.reasonCodes.includes(REASON_CODE.BINDING_UNRESOLVED));
});

const externalEvidence = ({
  evidenceId,
  runtimeId = RUNTIME_IDS.WECHAT,
  executionSurface = "wechat:appservice",
  scopeId = ARTIFACT,
  authority = "authoritative",
  source = "official_project_config",
  artifactHash = "sha256:aaa",
  provenance = "official_spec",
}) => ({
  evidenceId,
  runtimeId,
  platformFamily: "wechat",
  executionSurface,
  versionProfile: ["base-library:3.5.1", "sdk:3.5.1"],
  scopeId,
  artifactScope: scopeId,
  artifactHash,
  revision: "rev-1",
  detectedAt: "2026-09-01T00:00:00.000Z",
  validFrom: "2026-09-01T00:00:00.000Z",
  validUntil: "2026-10-01T00:00:00.000Z",
  external: true,
  authority,
  source,
  provenance,
});

const analyzeWechatCall = (options = {}) =>
  analyzeAndDecide({
    source: "wx.request({ url: 'https://example.invalid' });",
    filePath: ARTIFACT,
    ...options,
  });

test("纯计算代码不产生运行时依赖或折叠决策", () => {
  const result = analyzeAndDecide({ source: "1 + 2;" });

  assert.equal(result.findingCount, 0);
  assert.equal(result.summary.byKnowledgeState.FOLD, 0);
  assert.equal(result.summary.byKnowledgeState.PROTECT, 0);
});

test("默认 Node 不再误杀未配置的微信代码", () => {
  const result = analyzeWechatCall();
  const decision = result.decisions[0].decision;

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.equal(decision.enforcementAction, "BLOCK_FOLD");
  assert.equal(
    result.decisions[0].targetRuntime.status,
    TARGET_RUNTIME_STATUS.INFERRED,
  );
});

test("显式弱目标同样只进入候选比较，而不是硬 PROTECT", () => {
  const result = analyzeWechatCall({
    targetRuntimeIds: [RUNTIME_IDS.NODE],
    targetRuntimeSource: "declared",
  });
  const decision = result.decisions[0].decision;

  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.TARGET_RUNTIME_UNCONFIRMED,
  ]);
});

test("只传目标列表却不声明来源时按 declared 处理，不会升级为 confirmed", () => {
  const result = analyzeWechatCall({
    targetRuntimeIds: [RUNTIME_IDS.NODE],
  });
  const resolved = result.decisions[0].targetRuntime;
  const decision = result.decisions[0].decision;

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.DECLARED);
  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.deepEqual(decision.reasonCodes, [
    REASON_CODE.TARGET_RUNTIME_UNCONFIRMED,
  ]);
});

test("只有显式声明 experiment_config 时才启用受控 evaluation default", () => {
  const result = analyzeWechatCall({
    targetRuntimeIds: [RUNTIME_IDS.NODE],
    targetRuntimeSource: "experiment_config",
  });
  const resolved = result.decisions[0].targetRuntime;

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CONFIRMED);
  assert.deepEqual(resolved.targetRuntimeIds, [RUNTIME_IDS.NODE]);
});

test("无外部证据时，代码中的 wx 只能产生候选", () => {
  const result = analyzeWechatCall();
  const resolved = result.decisions[0].targetRuntime;

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.INFERRED);
  assert.deepEqual(resolved.candidateRuntimeIds, [RUNTIME_IDS.WECHAT]);
  assert.deepEqual(resolved.targetRuntimeIds, [RUNTIME_IDS.WECHAT]);
});

test("确认目标与 definite required 一致时不会误报缺失", () => {
  const result = analyzeWechatCall({
    targetRuntimeEvidence: [
      externalEvidence({
        evidenceId: "config:1",
        authority: "corroborating",
      }),
      externalEvidence({
        evidenceId: "runtime:1",
        source: "runtime_fingerprint",
      }),
    ],
  });
  const resolved = result.decisions[0].targetRuntime;
  const decision = result.decisions[0].decision;

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CONFIRMED);
  assert.ok(!decision.reasonCodes.includes(REASON_CODE.REQUIRED_RUNTIME_MISSING));
});

test("外部证据确认微信目标后，required 不再被判定为缺失", () => {
  const result = analyzeWechatCall({
    targetRuntimeEvidence: [externalEvidence({ evidenceId: "config:1" })],
  });
  const resolved = result.decisions[0].targetRuntime;
  const decision = result.decisions[0].decision;

  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CORROBORATED);
  assert.deepEqual(resolved.targetRuntimeIds, [RUNTIME_IDS.WECHAT]);
  assert.equal(decision.knowledgeState, KNOWLEDGE_STATE.UNKNOWN);
  assert.ok(!decision.reasonCodes.includes(REASON_CODE.REQUIRED_RUNTIME_MISSING));
});

test("外部证据作用域不属于当前文件时不确认目标", () => {
  const result = analyzeWechatCall({
    targetRuntimeEvidence: [
      externalEvidence({
        evidenceId: "config:1",
        scopeId: "other/project.js",
      }),
    ],
  });

  assert.equal(
    result.decisions[0].targetRuntime.status,
    TARGET_RUNTIME_STATUS.UNKNOWN,
  );
  assert.equal(
    result.decisions[0].decision.knowledgeState,
    KNOWLEDGE_STATE.UNKNOWN,
  );
});

test("外部目标证据与当前产物冲突时不维持 confirmed", () => {
  const result = analyzeWechatCall({
    targetRuntimeEvidence: [
      externalEvidence({ evidenceId: "config:1" }),
      externalEvidence({
        evidenceId: "runtime:1",
        source: "runtime_fingerprint",
        artifactHash: "sha256:bbb",
      }),
    ],
  });

  assert.equal(
    result.decisions[0].targetRuntime.status,
    TARGET_RUNTIME_STATUS.CONFLICT,
  );
  assert.equal(
    result.decisions[0].decision.knowledgeState,
    KNOWLEDGE_STATE.UNKNOWN,
  );
});

test("多目标构建显式枚举时不会被随机选成单一目标", () => {
  const result = analyzeWechatCall({
    targetRuntimeEvidence: [
      externalEvidence({ evidenceId: "config:appservice" }),
      externalEvidence({
        evidenceId: "config:webview",
        runtimeId: "wechat-webview",
        executionSurface: "wechat:webview",
      }),
    ],
  });
  const resolved = result.decisions[0].targetRuntime;

  assert.deepEqual(
    [...resolved.targetRuntimeIds].sort(),
    [RUNTIME_IDS.WECHAT, "wechat-webview"].sort(),
  );
  assert.equal(resolved.status, TARGET_RUNTIME_STATUS.CORROBORATED);
});
