import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { fetchRepoTarball } from "../tools/fetch-repo-tarball.mjs";

const tarHeader = ({ name, size }) => {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "utf8");
  header.write("0000000\0", 108, 8, "utf8");
  header.write("0000000\0", 116, 8, "utf8");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
  header.write("00000000000\0", 136, 12, "utf8");
  header.write("0", 156, 1, "utf8");
  header.write("ustar\0", 257, 6, "utf8");
  header.write("00", 263, 2, "utf8");
  header.write("        ", 148, 8, "utf8");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
  return header;
};

const tarEntry = ({ name, body }) => {
  const content = Buffer.from(body, "utf8");
  const padding = (512 - (content.length % 512)) % 512;
  return Buffer.concat([
    tarHeader({ name, size: content.length }),
    content,
    Buffer.alloc(padding),
  ]);
};

const buildTarball = (entries) =>
  gzipSync(
    Buffer.concat([
      ...entries.map(tarEntry),
      Buffer.alloc(1024),
    ]),
  );

const STUB_COMMIT = "0123456789abcdef0123456789abcdef01234567";

const stubFetch = (archive) => async (url) => {
  if (url.includes("codeload.github.com")) {
    return new Response(archive, { status: 200 });
  }
  if (url.includes("/branches/")) {
    return Response.json({ commit: { sha: STUB_COMMIT } });
  }
  if (url.includes("api.github.com/repos/")) {
    return Response.json({
      default_branch: "main",
      license: { spdx_id: "MIT", name: "MIT License", url: null },
    });
  }
  throw new Error(`Unexpected URL: ${url}`);
};

test("tarball 抓取只保留指定目录与扩展名的常规文件", async () => {
  const archive = buildTarball([
    { name: "wpt-abc123/dom/a.js", body: "const a = 1;" },
    { name: "wpt-abc123/dom/readme.txt", body: "not js" },
    { name: "wpt-abc123/tools/c.js", body: "const c = 3;" },
    { name: "wpt-abc123/dom/nested/d.mjs", body: "export const d = 4;" },
  ]);
  const directory = mkdtempSync(path.join(os.tmpdir(), "r97-tarball-test-"));
  try {
    const manifest = await fetchRepoTarball({
      repository: "web-platform-tests/wpt",
      ref: "abc123",
      includePrefixes: ["dom"],
      outDir: path.join(directory, "out"),
      cacheDir: path.join(directory, "cache"),
      fetchImpl: stubFetch(archive),
    });

    assert.deepEqual(
      manifest.files.map((file) => file.path),
      ["dom/a.js", "dom/nested/d.mjs"],
    );
    assert.equal(manifest.selection.candidateCount, 2);
    assert.equal(manifest.license.spdxId, "MIT");
    assert.equal(manifest.commit, STUB_COMMIT);
    assert.equal(
      readFileSync(path.join(directory, "out", "files", "dom", "a.js"), "utf8"),
      "const a = 1;",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tarball 抓取跳过没有扩展名匹配的目录", async () => {
  const archive = buildTarball([
    { name: "wpt-abc123/dom/a.js", body: "const a = 1;" },
    { name: "wpt-abc123/html/b.js", body: "const b = 2;" },
  ]);
  const directory = mkdtempSync(path.join(os.tmpdir(), "r97-tarball-test-"));
  try {
    const manifest = await fetchRepoTarball({
      repository: "web-platform-tests/wpt",
      ref: "abc123",
      includePrefixes: ["html"],
      outDir: path.join(directory, "out"),
      cacheDir: path.join(directory, "cache"),
      fetchImpl: stubFetch(archive),
    });

    assert.deepEqual(
      manifest.files.map((file) => file.path),
      ["html/b.js"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
