/**
 * 迭代 3 诊断：定位「属性访问没匹配上导出表」的具体形态。
 *
 * 对每个 app-service.js，找出 origin 为 `bundle:<模块路径>` 的 finding，分成两类：
 *   1. entityId === 模块路径      → 模块变量本身被使用（require 的返回值直接调用/赋值）
 *   2. entityId 带额外属性段       → `t.foo` 这类属性访问，导出表里没找到 foo
 *
 * 对第 2 类打印具体案例：实体路径、模块路径、该模块导出表的键、factory 开头片段。
 *
 * 用法：node tools/diagnose-export-mismatch.mjs --limit 10 --examples 15
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseJavaScript } from "espree";

import { analyzeSource } from "../src/analyzer.mjs";
import {
  buildBundleModuleTable,
  extractModuleExports,
} from "../src/bundle-modules.mjs";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const sourceRoot = path.resolve(
  argValue("--source") ??
    "E:\\复现\\sample_collector\\可用于实验的干净源码包",
);
const limit = Number.parseInt(argValue("--limit") ?? "10", 10);
const exampleLimit = Number.parseInt(argValue("--examples") ?? "15", 10);

const projects = readdirSync(sourceRoot)
  .filter((name) => existsSync(path.join(sourceRoot, name, "app-service.js")))
  .slice(0, limit);

const stats = {
  files: 0,
  refFindings: 0,
  bareModuleUse: 0,
  propertyAccess: 0,
  matchedByExportTable: 0,
  missingFromExportTable: 0,
  emptyExportTable: 0,
};
const examples = [];

for (const project of projects) {
  const filePath = path.join(sourceRoot, project, "app-service.js");
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  let ast;
  try {
    ast = parseJavaScript(source, {
      ecmaVersion: "latest",
      sourceType: "script",
      range: true,
    });
  } catch {
    continue;
  }
  stats.files += 1;
  const { modules } = buildBundleModuleTable(ast);
  const analysis = analyzeSource({ source, filePath });

  for (const finding of analysis.findings) {
    const origin = finding.bindingRef.bindingOrigin ?? "";
    if (!origin.startsWith("bundle:")) continue;
    stats.refFindings += 1;
    const modulePath = origin.slice("bundle:".length);
    const entityId = finding.runtimeEntity.entityId;
    if (entityId === modulePath) {
      stats.bareModuleUse += 1;
      continue;
    }
    stats.propertyAccess += 1;
    const entry = modules.get(modulePath);
    if (!entry) continue;
    const exported = extractModuleExports(entry.factoryNode);
    if (exported.named.size === 0 && !exported.defaultExport) {
      stats.emptyExportTable += 1;
      if (examples.length < exampleLimit) {
        examples.push({
          file: filePath,
          entityId,
          modulePath,
          exportKeys: [],
          factoryHead: entry.factoryNode?.range
            ? source
                .slice(entry.factoryNode.range[0], entry.factoryNode.range[0] + 180)
                .replace(/\s+/gu, " ")
            : null,
        });
      }
      continue;
    }
    const suffix = entityId.slice(modulePath.length + 1);
    const firstSegment = suffix.split(".")[0];
    if (exported.named.has(firstSegment) || firstSegment === "default") {
      stats.matchedByExportTable += 1;
    } else {
      stats.missingFromExportTable += 1;
      if (examples.length < exampleLimit) {
        examples.push({
          file: filePath,
          entityId,
          modulePath,
          exportKeys: [...exported.named.keys()].slice(0, 12),
          factoryHead: entry.factoryNode?.range
            ? source
                .slice(entry.factoryNode.range[0], entry.factoryNode.range[0] + 180)
                .replace(/\s+/gu, " ")
            : null,
        });
      }
    }
  }
}

console.log(`分析文件：${stats.files}`);
console.log(`bundle 引用 finding：${stats.refFindings}`);
console.log(`  模块变量本身被使用：${stats.bareModuleUse}`);
console.log(`  属性访问：${stats.propertyAccess}`);
console.log(`    导出表能匹配上首段属性：${stats.matchedByExportTable}`);
console.log(`    导出表缺该属性：${stats.missingFromExportTable}`);
console.log(`    导出表为空：${stats.emptyExportTable}`);
console.log("");
console.log("案例：");
for (const item of examples) {
  console.log(`  entityId: ${item.entityId}`);
  console.log(`    file: ${item.file}`);
  console.log(`    module: ${item.modulePath}`);
  console.log(`    exports: ${item.exportKeys.length ? item.exportKeys.join(", ") : "(空)"}`);
  console.log(`    factory: ${item.factoryHead?.slice(0, 140) ?? "—"}`);
}
