import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSourceInLanguageBaseline } from "../src/evaluation/differential-reference.mjs";
import { TRANSFORMATION_ORACLE_CASES } from "../src/evaluation/transformation-oracle-cases.mjs";
import {
  oracleCaseDigest,
  parseTransformationOracleArgs,
} from "../src/evaluation/transformation-oracle.mjs";

const REQUIRED_FIELDS = [
  "caseId",
  "category",
  "description",
  "foldPoint",
  "source",
  "folded",
  "evaluatorRuntime",
  "targetRuntime",
];

test("每个用例都带齐必需字段且 id 唯一", () => {
  const seen = new Set();
  for (const testCase of TRANSFORMATION_ORACLE_CASES) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        typeof testCase[field] === "string" && testCase[field].trim() !== "",
        `${testCase.caseId} 缺字段 ${field}`,
      );
    }
    assert.ok(!seen.has(testCase.caseId), `重复 caseId: ${testCase.caseId}`);
    seen.add(testCase.caseId);
    assert.ok(
      ["node", "edge"].includes(testCase.targetRuntime),
      `${testCase.caseId} 的 targetRuntime 必须是 node 或 edge`,
    );
  }
});

test("折叠结果必须等于求值基线里的真实结果，否则用例是伪造的安全变换", async () => {
  // 折叠的定义就是「把求值环境里算出来的值写死」。如果 `folded` 写的是目标
  // 环境的取值而不是基线的取值，这个用例测的就不是 R97 要防的问题——
  // 第一版用例集正是这样错了三条，被这条断言挡住。
  for (const testCase of TRANSFORMATION_ORACLE_CASES) {
    const baselineBefore = await evaluateSourceInLanguageBaseline(
      testCase.source,
    );
    const baselineAfter = await evaluateSourceInLanguageBaseline(
      testCase.folded,
    );
    // 观测来自隔离 vm 的另一个 realm，原型不同会让 deepStrictEqual 误判，
    // 因此按序列化结果比较。
    assert.equal(
      JSON.stringify(baselineAfter),
      JSON.stringify(baselineBefore),
      `${testCase.caseId}: folded 与求值基线下的 source 结果不一致`,
    );
  }
});

test("用例摘要对同一集合稳定", () => {
  assert.equal(oracleCaseDigest(), oracleCaseDigest([...TRANSFORMATION_ORACLE_CASES]));
  assert.match(oracleCaseDigest(), /^[0-9a-f]{16}$/u);
});

test("命令行参数校验", () => {
  assert.throws(() => parseTransformationOracleArgs(["--out"]), /--out/);
  assert.throws(
    () => parseTransformationOracleArgs(["--unknown"]),
    /Unknown argument/,
  );
  const options = parseTransformationOracleArgs(["--out", "tmp/oracle"]);
  assert.match(options.outputDir, /tmp[\\/]oracle$/u);
});
