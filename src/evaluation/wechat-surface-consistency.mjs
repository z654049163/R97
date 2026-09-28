/**
 * 微信 Worker 子环境证据的一致性检查。
 *
 * `tools/verify-worker-probe.mjs` 在每个真实项目里同时读 AppService 与 Worker
 * 两侧的存在性/类型，产出 `worker-vs-appservice.json`。这个脚本把所有报告
 * 收在一起，回答两个问题：
 *
 * 1. 不同项目、重复采集之间，Worker 相对 AppService 的差异实体是否一致？
 * 2. Worker 全局环境形状（hasWx / hasDocument / hasSelf / hasGlobalThis）是否一致？
 *
 * 它只做一致性汇总，不把 Worker 差异表直接灌进决策。原因是探针只覆盖了 12 个
 * 实体，把「这 12 个的结果」外推成「Worker 里所有宿主 API 都不存在」会重演
 * 跨环境「不存在」不可外推的错误。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const reportsRoot = path.resolve(
  argValue("--reports") ?? "datasets/wechat-worker-subenvironment",
);
const outputDir = path.resolve(
  argValue("--out") ?? "datasets/wechat-surface-consistency",
);

export const divergentSignature = (report) =>
  [...new Set(report.divergentEntities ?? [])].sort().join(",");

const environmentSignature = (report) =>
  JSON.stringify({
    hasWx: report.workerEnvironment?.hasWx ?? null,
    hasGlobalThis: report.workerEnvironment?.hasGlobalThis ?? null,
    hasSelf: report.workerEnvironment?.hasSelf ?? null,
    hasDocument: report.workerEnvironment?.hasDocument ?? null,
  });

export const summarizeWechatSurfaceReports = (reports) => {
  const signatures = new Map();
  const environmentSignatures = new Map();
  const entries = [];

  for (const report of reports) {
    const divergent = divergentSignature(report);
    const environment = environmentSignature(report);
    const ids = signatures.get(divergent) ?? [];
    ids.push(report.id);
    signatures.set(divergent, ids);
    const environmentIds = environmentSignatures.get(environment) ?? [];
    environmentIds.push(report.id);
    environmentSignatures.set(environment, environmentIds);
    entries.push({
      id: report.id,
      entityCount: report.entityCount ?? null,
      divergentCount: report.divergentCount ?? (report.divergentEntities ?? []).length,
      divergentEntities: [...(report.divergentEntities ?? [])].sort(),
      workerEnvironment: report.workerEnvironment ?? null,
      generatedAt: report.generatedAt ?? null,
    });
  }

  const signaturesByValue = [...signatures.entries()].map(
    ([signature, ids]) => ({
      divergentEntities: signature === "" ? [] : signature.split(","),
      projects: ids,
    }),
  );
  const environmentByValue = [...environmentSignatures.entries()].map(
    ([signature, ids]) => ({
      environment: JSON.parse(signature),
      projects: ids,
    }),
  );
  const independentProjects = entries
    .map((entry) => entry.id)
    .filter((id) => !/-copy$/u.test(id));

  return {
    reportCount: entries.length,
    independentProjectCount: independentProjects.length,
    consistent: signatures.size <= 1,
    environmentConsistent: environmentSignatures.size <= 1,
    signatures: signaturesByValue,
    environments: environmentByValue,
    entries: entries.sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const readReport = (reportPath) => {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  return {
    ...report,
    divergentEntities: report.divergentEntities ?? [],
  };
};

export const loadWechatSurfaceReports = (root = reportsRoot) => {
  if (!existsSync(root)) return [];
  const reports = [];
  const fixturePath = path.join(root, "worker-vs-appservice.json");
  if (existsSync(fixturePath)) {
    reports.push({ id: "fixture", ...readReport(fixturePath) });
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const reportPath = path.join(root, entry.name, "worker-vs-appservice.json");
    if (!existsSync(reportPath)) continue;
    reports.push({ id: entry.name, ...readReport(reportPath) });
  }
  return reports;
};

const main = () => {
  const reports = loadWechatSurfaceReports();
  const summary = {
    generatedAt: new Date().toISOString(),
    reportsRoot: path.relative(process.cwd(), reportsRoot),
    ...summarizeWechatSurfaceReports(reports),
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "report.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8",
  );

  console.log(
    `报告 ${summary.reportCount} 份 / 独立项目 ${summary.independentProjectCount} 个`,
  );
  console.log(
    `差异集合一致：${summary.consistent ? "是" : "否"}；环境形状一致：${
      summary.environmentConsistent ? "是" : "否"
    }`,
  );
  for (const signature of summary.signatures) {
    console.log(
      `  [${signature.divergentEntities.join(", ") || "无"}] ← ${signature.projects.join(", ")}`,
    );
  }
  for (const entry of summary.entries) {
    console.log(
      `  ${entry.id}: ${entry.divergentCount} / ${entry.entityCount} 差异`,
    );
  }
  if (!summary.consistent || !summary.environmentConsistent) {
    process.exitCode = 1;
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
