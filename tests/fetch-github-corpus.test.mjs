import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  fetchGitHubCorpus,
  parseFetchArgs,
} from "../tools/fetch-github-corpus.mjs";

const jsonResponse = (value) => ({
  ok: true,
  status: 200,
  json: async () => value,
});

const fileResponse = (value) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new TextEncoder().encode(value).buffer,
});

test("公开语料参数允许使用固定 commit", () => {
  const commit = "a".repeat(40);
  const options = parseFetchArgs([
    "--repo",
    "owner/repo",
    "--ref",
    commit,
    "--include",
    "test",
    "--out",
    "corpus",
  ]);

  assert.equal(options.repository, "owner/repo");
  assert.equal(options.ref, commit);
  assert.deepEqual(options.includePrefixes, ["test"]);
});

test("固定 commit 下载会写入来源清单和文件哈希", async () => {
  const commit = "a".repeat(40);
  const outDir = mkdtempSync(path.join(os.tmpdir(), "r97-github-corpus-"));
  const calls = [];
  try {
    const manifest = await fetchGitHubCorpus({
      repository: "owner/repo",
      ref: commit,
      includePrefixes: ["fixtures"],
      outDir,
      limit: 1,
      maxBytes: 1024,
      maxApiCalls: 1,
      fetchImpl: async (url) => {
        calls.push(url);
        if (url === "https://api.github.com/repos/owner/repo") {
          return jsonResponse({
            default_branch: "main",
            license: { spdx_id: "MIT", name: "MIT License", url: null },
          });
        }
        if (url.includes("/contents/fixtures?ref=")) {
          return jsonResponse([
            {
              type: "file",
              path: "fixtures/sample.js",
              size: 13,
              download_url: null,
            },
          ]);
        }
        if (url.includes("cdn.jsdelivr.net")) {
          return fileResponse("console.log(1);");
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    assert.equal(manifest.commit, commit);
    assert.equal(manifest.license.spdxId, "MIT");
    assert.equal(manifest.files.length, 1);
    assert.equal(manifest.files[0].path, "fixtures/sample.js");
    assert.match(manifest.files[0].sourceUrl, /raw\.githubusercontent\.com/u);
    assert.match(manifest.files[0].downloadUrl, /cdn\.jsdelivr\.net/u);
    assert.match(manifest.files[0].sha256, /^[0-9a-f]{64}$/u);
    assert.equal(
      readFileSync(path.join(outDir, "files", "fixtures", "sample.js"), "utf8"),
      "console.log(1);",
    );
    assert.equal(
      calls.some((url) => url.includes("/branches/")),
      false,
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("Git Tree 发现模式只请求一次文件树并下载匹配文件", async () => {
  const commit = "b".repeat(40);
  const outDir = mkdtempSync(path.join(os.tmpdir(), "r97-github-tree-"));
  const calls = [];
  try {
    const manifest = await fetchGitHubCorpus({
      repository: "owner/repo",
      ref: commit,
      includePrefixes: ["lib"],
      outDir,
      limit: 2,
      maxBytes: 1024,
      maxApiCalls: 1,
      discoveryMethod: "tree",
      fetchImpl: async (url) => {
        calls.push(url);
        if (url === "https://api.github.com/repos/owner/repo") {
          return jsonResponse({
            default_branch: "main",
            license: { spdx_id: "MIT", name: "MIT License", url: null },
          });
        }
        if (url.includes("/git/trees/") && url.includes("recursive=1")) {
          return jsonResponse({
            truncated: false,
            tree: [
              { type: "blob", path: "lib/a.js", size: 5 },
              { type: "blob", path: "lib/b.js", size: 5 },
              { type: "blob", path: "test/ignored.js", size: 5 },
            ],
          });
        }
        if (url.includes("cdn.jsdelivr.net")) {
          return fileResponse("void 0;");
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    assert.equal(manifest.selection.discoveryMethod, "tree");
    assert.equal(manifest.selection.apiCalls, 1);
    assert.deepEqual(
      manifest.files.map((file) => file.path),
      ["lib/a.js", "lib/b.js"],
    );
    assert.equal(
      calls.filter((url) => url.includes("/contents/")).length,
      0,
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
