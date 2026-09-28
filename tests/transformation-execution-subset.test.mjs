import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTransformationSubsetArgs,
} from "../src/evaluation/transformation-execution-subset.mjs";

test("命令行参数解析与校验", () => {
  const options = parseTransformationSubsetArgs([
    "--corpus",
    "datasets/x.jsonl",
    "--sample-limit",
    "250",
    "--out",
    "tmp/subset",
  ]);
  assert.match(options.corpusPath, /datasets[\\/]x\.jsonl$/u);
  assert.equal(options.sampleLimit, 250);
  assert.match(options.outputDir, /tmp[\\/]subset$/u);
});

test("默认参数指向当前主语料", () => {
  const options = parseTransformationSubsetArgs([]);
  assert.match(
    options.corpusPath,
    /datasets[\\/]real-miniapp-full[\\/]real-miniapp-candidates\.jsonl$/u,
  );
  assert.equal(options.sampleLimit, 500);
});

test("未知参数被拒绝", () => {
  assert.throws(
    () => parseTransformationSubsetArgs(["--nope"]),
    /Unknown argument/,
  );
});
