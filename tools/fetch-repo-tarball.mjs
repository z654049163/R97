import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * 按仓库 tarball 抓取公开语料。
 *
 * 逐文件走 CDN 的抓取在几百个文件后会卡在长连接上，且一旦失败整批作废。
 * codeload 的 tar.gz 一次请求即可拿到整个仓库，本地解包后只保留需要的
 * 目录与扩展名，速度快且可重跑。
 */

const USER_AGENT = "R97-public-corpus-fetcher";
const DEFAULT_EXTENSIONS = [".js", ".mjs", ".cjs"];

export const fetchRepoTarball = async ({
  repository,
  ref = "HEAD",
  includePrefixes,
  outDir,
  limit = 800,
  maxBytes = 524288,
  extensions = DEFAULT_EXTENSIONS,
  cacheDir = null,
  fetchImpl = fetch,
  now = () => new Date(),
}) => {
  if (!repository || !/^[^/\s]+\/[^/\s]+$/u.test(repository)) {
    throw new TypeError("repository must look like owner/name");
  }
  if (!Array.isArray(includePrefixes) || includePrefixes.length === 0) {
    throw new TypeError("includePrefixes must be a non-empty array");
  }
  if (!outDir) {
    throw new TypeError("outDir is required");
  }
  const normalizedExtensions = extensions
    .map((value) => String(value).trim().toLowerCase())
    .map((value) => (value.startsWith(".") ? value : `.${value}`));

  const repo = await githubJson(
    `https://api.github.com/repos/${repository}`,
    fetchImpl,
  );
  const resolvedRef = ref === "HEAD" ? repo.default_branch : ref;
  const commit = /^[0-9a-f]{40}$/iu.test(resolvedRef)
    ? resolvedRef
    : (
        await githubJson(
          `https://api.github.com/repos/${repository}/branches/${encodeURIComponent(resolvedRef)}`,
          fetchImpl,
        )
      ).commit.sha;

  const archivePath = await downloadTarball({
    repository,
    commit,
    cacheDir,
    fetchImpl,
  });
  const candidates = await collectCandidates({
    archivePath,
    includePrefixes,
    extensions: normalizedExtensions,
    maxBytes,
  });
  const selected = evenlySpaced(candidates, limit);
  const wanted = new Set(selected.map((entry) => entry.path));
  const files = [];
  await walkTarball({
    archivePath,
    onEntry: async ({ path: entryPath, read }) => {
      const relative = stripTopLevel(entryPath);
      if (!wanted.has(relative)) {
        return false;
      }
      const content = await read();
      const destination = path.join(outDir, "files", ...relative.split("/"));
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, content);
      files.push({
        path: relative,
        sha256: createHash("sha256").update(content).digest("hex"),
        bytes: content.byteLength,
        sourceUrl: `https://github.com/${repository}/blob/${commit}/${relative}`,
      });
      return true;
    },
  });

  const manifest = {
    generatedAt: now().toISOString(),
    repository,
    requestedRef: ref,
    resolvedRef,
    commit,
    archiveUrl: `https://codeload.github.com/${repository}/tar.gz/${commit}`,
    license: {
      spdxId: repo.license?.spdx_id ?? null,
      name: repo.license?.name ?? null,
      url: repo.license?.url ?? null,
    },
    selection: {
      includePrefixes,
      extensions: normalizedExtensions,
      limit,
      maxBytes,
      candidateCount: candidates.length,
      selectedCount: candidates.length,
      downloadedCount: files.length,
    },
    files,
    skipped: [],
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
};

const downloadTarball = async ({
  repository,
  commit,
  cacheDir,
  fetchImpl,
}) => {
  const targetDir = cacheDir ?? os.tmpdir();
  mkdirSync(targetDir, { recursive: true });
  const archivePath = path.join(
    targetDir,
    `${repository.replace("/", "-")}-${commit}.tar.gz`,
  );
  if (existsSync(archivePath) && statSync(archivePath).size > 0) {
    return archivePath;
  }
  const url = `https://codeload.github.com/${repository}/tar.gz/${commit}`;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Tarball download failed: ${response.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));
  return archivePath;
};

/**
 * 只读 tar 头，收集符合目录与扩展名的常规文件路径。
 * 只接受 regular file，符号链接、目录和特殊文件一律跳过：GitHub 的
 * node 仓库 tarball 里有指向仓库外路径的符号链接，在 Windows 上解包会失败。
 */
const collectCandidates = async ({
  archivePath,
  includePrefixes,
  extensions,
  maxBytes,
}) => {
  const prefixes = includePrefixes.map((prefix) =>
    prefix.replace(/^\/+|\/+$/gu, ""),
  );
  const candidates = [];
  await walkTarball({
    archivePath,
    onEntry: ({ path: entryPath, size }) => {
      const relative = stripTopLevel(entryPath);
      if (
        size > maxBytes ||
        !extensions.includes(path.extname(relative).toLowerCase()) ||
        !prefixes.some(
          (prefix) =>
            relative === prefix || relative.startsWith(`${prefix}/`),
        )
      ) {
        return false;
      }
      candidates.push({ path: relative, size });
      return false;
    },
  });
  candidates.sort((left, right) => left.path.localeCompare(right.path));
  return candidates;
};

const stripTopLevel = (entryPath) => {
  const separator = entryPath.indexOf("/");
  return separator === -1 ? entryPath : entryPath.slice(separator + 1);
};

const BLOCK_SIZE = 512;

const paddingFor = (size) => (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;

const isZeroBlock = (block) => block.every((byte) => byte === 0);

const readCString = (buffer, offset, length) => {
  const slice = buffer.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice
    .subarray(0, end === -1 ? slice.length : end)
    .toString("utf8")
    .trim();
};

const readOctal = (buffer, offset, length) => {
  const raw = readCString(buffer, offset, length);
  if (raw === "") {
    return 0;
  }
  const parsed = Number.parseInt(raw, 8);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePaxHeader = (buffer) => {
  const record = {};
  let cursor = 0;
  while (cursor < buffer.length) {
    const space = buffer.indexOf(32, cursor);
    if (space === -1) {
      break;
    }
    const length = Number.parseInt(buffer.toString("utf8", cursor, space), 10);
    if (!Number.isFinite(length) || length <= 0) {
      break;
    }
    const recordText = buffer
      .toString("utf8", space + 1, cursor + length)
      .replace(/\n$/u, "");
    const equals = recordText.indexOf("=");
    if (equals > 0) {
      record[recordText.slice(0, equals)] = recordText.slice(equals + 1);
    }
    cursor += length;
  }
  return record;
};

const createByteReader = (stream) => {
  const iterator = stream[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0);
  let finished = false;
  return {
    async read(length) {
      if (length === 0) {
        return Buffer.alloc(0);
      }
      while (buffer.length < length && !finished) {
        const next = await iterator.next();
        if (next.done) {
          finished = true;
          break;
        }
        buffer =
          buffer.length === 0
            ? Buffer.from(next.value)
            : Buffer.concat([buffer, next.value]);
      }
      if (buffer.length < length) {
        return null;
      }
      const output = buffer.subarray(0, length);
      buffer = buffer.subarray(length);
      return output;
    },
    async skip(length) {
      let remaining = length;
      while (remaining > 0) {
        const chunk = await this.read(Math.min(remaining, 1 << 20));
        if (!chunk) {
          return;
        }
        remaining -= chunk.length;
      }
    },
    close() {
      if (typeof iterator.return === "function") {
        iterator.return().catch(() => {});
      }
    },
  };
};

const walkTarball = async ({ archivePath, onEntry }) => {
  const reader = createByteReader(
    createReadStream(archivePath).pipe(createGunzip()),
  );
  let pendingPax = null;
  try {
    while (true) {
      const header = await reader.read(BLOCK_SIZE);
      if (!header || isZeroBlock(header)) {
        break;
      }
      const name = readCString(header, 0, 100);
      const prefix = readCString(header, 345, 155);
      const rawSize = readOctal(header, 124, 12);
      const typeByte = header[156] === 0 ? 48 : header[156];
      const type = String.fromCharCode(typeByte);
      const entryPath = pendingPax?.path ?? (prefix ? `${prefix}/${name}` : name);
      const size = pendingPax?.size ?? rawSize;
      pendingPax = null;

      if (type === "x") {
        const data = await reader.read(size);
        pendingPax = data ? parsePaxHeader(data) : null;
        await reader.skip(paddingFor(size));
        continue;
      }

      let consumed = false;
      if (type === "0" || type === "\0") {
        consumed = Boolean(
          await onEntry({
            path: entryPath,
            size,
            read: () => reader.read(size),
          }),
        );
      }
      if (!consumed) {
        await reader.skip(size);
      }
      await reader.skip(paddingFor(size));
    }
  } finally {
    reader.close();
  }
};

const evenlySpaced = (values, limit) => {
  if (values.length <= limit) {
    return values;
  }
  const selected = [];
  for (let index = 0; index < limit; index += 1) {
    selected.push(values[Math.floor((index * values.length) / limit)]);
  }
  return selected;
};

const githubJson = async (url, fetchImpl) => {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${url}`);
  }
  return response.json();
};

export const parseTarballArgs = (argv) => {
  const options = {
    repository: null,
    ref: "HEAD",
    includePrefixes: [],
    outDir: null,
    limit: 800,
    maxBytes: 524288,
    cacheDir: null,
    extensions: DEFAULT_EXTENSIONS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    switch (argument) {
      case "--repo":
        options.repository = requireValue(argument, next);
        index += 1;
        break;
      case "--ref":
        options.ref = requireValue(argument, next);
        index += 1;
        break;
      case "--include":
        options.includePrefixes.push(requireValue(argument, next));
        index += 1;
        break;
      case "--out":
        options.outDir = path.resolve(requireValue(argument, next));
        index += 1;
        break;
      case "--limit":
        options.limit = positiveInteger(argument, next);
        index += 1;
        break;
      case "--max-bytes":
        options.maxBytes = positiveInteger(argument, next);
        index += 1;
        break;
      case "--cache-dir":
        options.cacheDir = path.resolve(requireValue(argument, next));
        index += 1;
        break;
      case "--extensions":
        options.extensions = requireValue(argument, next).split(",");
        index += 1;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const requireValue = (argument, input) => {
  if (typeof input !== "string" || input.startsWith("--")) {
    throw new Error(`${argument} requires a value`);
  }
  return input;
};

const positiveInteger = (argument, input) => {
  const parsed = Number.parseInt(requireValue(argument, input), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${argument} requires a positive integer`);
  }
  return parsed;
};

const isMain = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseTarballArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage: node tools/fetch-repo-tarball.mjs --repo <owner/name> --out <dir> --include <prefix>",
        "",
        "Options:",
        "  --repo <owner/name>   GitHub repository",
        "  --ref <ref>           Commit SHA or branch (default: HEAD)",
        "  --include <prefix>    Directory prefix to keep (repeatable)",
        "  --out <path>          Output directory",
        "  --limit <n>           Maximum files to keep (default: 800)",
        "  --max-bytes <n>       Skip files larger than this (default: 524288)",
        "  --extensions <.a,.b>  Extensions to keep (default: .js,.mjs,.cjs)",
        "  --cache-dir <path>    Where to keep the downloaded tarball",
      ].join("\n"),
    );
  } else {
    const manifest = await fetchRepoTarball(options);
    console.log(
      JSON.stringify(
        {
          repository: manifest.repository,
          commit: manifest.commit,
          candidateCount: manifest.selection.candidateCount,
          downloadedCount: manifest.selection.downloadedCount,
        },
        null,
        2,
      ),
    );
  }
}
