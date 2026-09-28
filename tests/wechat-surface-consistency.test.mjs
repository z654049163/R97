import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  loadWechatSurfaceReports,
  summarizeWechatSurfaceReports,
} from "../src/evaluation/wechat-surface-consistency.mjs";

const DEFAULT_ENVIRONMENT = {
  hasWx: false,
  hasGlobalThis: true,
  hasSelf: false,
  hasDocument: false,
};

const makeReport = ({
  id,
  divergentEntities = ["wx", "wx.request", "Page", "getApp", "document"],
  workerEnvironment = DEFAULT_ENVIRONMENT,
}) => ({
  id,
  entityCount: 12,
  divergentCount: divergentEntities.length,
  divergentEntities,
  workerEnvironment,
  generatedAt: "2026-09-24T00:00:00.000Z",
});

test("差异集合与 Worker 环境形状一致时汇总为一致", () => {
  const summary = summarizeWechatSurfaceReports([
    makeReport({ id: "project-a" }),
    makeReport({ id: "project-b" }),
  ]);

  assert.equal(summary.reportCount, 2);
  assert.equal(summary.consistent, true);
  assert.equal(summary.environmentConsistent, true);
  assert.equal(summary.signatures.length, 1);
  assert.deepEqual(summary.signatures[0].divergentEntities.sort(), [
    "Page",
    "document",
    "getApp",
    "wx",
    "wx.request",
  ]);
});

test("任何一份报告的差异实体集合不同都要标出不一致", () => {
  const summary = summarizeWechatSurfaceReports([
    makeReport({ id: "project-a" }),
    makeReport({
      id: "project-b",
      divergentEntities: ["wx", "document"],
    }),
  ]);

  assert.equal(summary.consistent, false);
  assert.equal(summary.signatures.length, 2);
  assert.deepEqual(
    summary.signatures.map((signature) => signature.projects).sort(),
    [["project-a"], ["project-b"]],
  );
});

test("Worker 侧全局环境形状不一致同样算不一致", () => {
  const summary = summarizeWechatSurfaceReports([
    makeReport({ id: "project-a" }),
    makeReport({
      id: "project-b",
      workerEnvironment: { ...DEFAULT_ENVIRONMENT, hasSelf: true },
    }),
  ]);

  assert.equal(summary.consistent, true);
  assert.equal(summary.environmentConsistent, false);
  assert.equal(summary.environments.length, 2);
});

test("真实报告集合跨独立项目保持一致", () => {
  const reportsRoot = "datasets/wechat-worker-subenvironment";
  if (!existsSync(reportsRoot)) {
    return;
  }
  const reports = loadWechatSurfaceReports(reportsRoot);
  const summary = summarizeWechatSurfaceReports(reports);

  assert.ok(summary.reportCount >= 5, `报告数应至少 5，实际 ${summary.reportCount}`);
  assert.ok(
    summary.independentProjectCount >= 4,
    `独立项目应至少 4 个，实际 ${summary.independentProjectCount}`,
  );
  assert.equal(summary.consistent, true);
  assert.equal(summary.environmentConsistent, true);
  const divergent = summary.signatures[0].divergentEntities;
  assert.ok(divergent.includes("wx"));
  assert.ok(divergent.includes("wx.request"));
  assert.ok(divergent.includes("document"));
});
