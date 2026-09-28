import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EXTENSIONS = [".js", ".mjs", ".cjs"];
const DISCOVERY_METHODS = new Set(["contents", "tree"]);
const USER_AGENT = "R97-public-corpus-fetcher";

export const fetchGitHubCorpus = async ({
  repository,
  ref = "HEAD",
  includePrefixes,
  outDir,
  limit = 120,
  maxBytes = 1024 * 1024,
  extensions = DEFAULT_EXTENSIONS,
  maxApiCalls = 40,
  discoveryMethod = "contents",
  fetchImpl = fetch,
  now = () => new Date(),
}) => {
  validateOptions({
    repository,
    includePrefixes,
    outDir,
    limit,
    maxBytes,
    extensions,
    maxApiCalls,
    discoveryMethod,
  });

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
  const normalizedExtensions = normalizeExtensions(extensions);
  const discovery = await discoverFiles({
    repository,
    commit,
    includePrefixes,
    extensions: normalizedExtensions,
    limit,
    maxApiCalls,
    discoveryMethod,
    fetchImpl,
  });
  const candidates = discovery.candidates;
  const selected = evenlySpaced(candidates, limit);

  const files = [];
  const skipped = [];
  for (const entry of selected) {
    const sourceUrl = `https://raw.githubusercontent.com/${repository}/${commit}/${entry.path}`;
    const downloadCandidates = [
      `https://cdn.jsdelivr.net/gh/${repository}@${commit}/${encodePath(entry.path)}`,
      `https://github.com/${repository}/raw/${commit}/${encodePath(entry.path)}`,
      sourceUrl,
    ];
    let response = null;
    let downloadUrl = null;
    let downloadError = null;
    for (const candidate of downloadCandidates) {
      try {
        const candidateResponse = await fetchWithRetry(candidate, {
          headers: { "User-Agent": USER_AGENT },
        }, fetchImpl, 2);
        if (candidateResponse.ok) {
          response = candidateResponse;
          downloadUrl = candidate;
          break;
        }
        downloadError = `HTTP ${candidateResponse.status}`;
      } catch (error) {
        downloadError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!response) {
      skipped.push({
        path: entry.path,
        reason: downloadError ?? "all download sources failed",
      });
      continue;
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.byteLength > maxBytes) {
      skipped.push({
        path: entry.path,
        reason: `size ${content.byteLength} exceeds ${maxBytes}`,
      });
      continue;
    }
    const destination = path.join(outDir, "files", ...entry.path.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
    files.push({
      path: entry.path,
      sha256: createHash("sha256").update(content).digest("hex"),
      bytes: content.byteLength,
      sourceUrl,
      downloadUrl,
    });
  }

  const manifest = {
    generatedAt: now().toISOString(),
    repository,
    requestedRef: ref,
    resolvedRef,
    commit,
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
      maxApiCalls,
      discoveryMethod,
      apiCalls: discovery.apiCalls,
      discoveryLimitReached: discovery.limitReached,
      candidateCount: candidates.length,
      selectedCount: selected.length,
      downloadedCount: files.length,
      skippedCount: skipped.length,
    },
    files,
    skipped,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
};

export const parseFetchArgs = (argv) => {
  const options = {
    repository: null,
    ref: "HEAD",
    includePrefixes: [],
    outDir: null,
    limit: 120,
    maxBytes: 1024 * 1024,
    maxApiCalls: 40,
    discoveryMethod: "contents",
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
      case "--max-api-calls":
        options.maxApiCalls = positiveInteger(argument, next);
        index += 1;
        break;
      case "--discovery":
        options.discoveryMethod = requireValue(argument, next);
        if (!DISCOVERY_METHODS.has(options.discoveryMethod)) {
          throw new Error("--discovery must be contents or tree");
        }
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

const validateOptions = ({
  repository,
  includePrefixes,
  outDir,
  limit,
  maxBytes,
  extensions,
  maxApiCalls,
  discoveryMethod,
}) => {
  if (!/^[^/]+\/[^/]+$/u.test(repository ?? "")) {
    throw new Error("repository must use owner/name format");
  }
  if (!Array.isArray(includePrefixes) || includePrefixes.length === 0) {
    throw new Error("at least one --include prefix is required");
  }
  if (typeof outDir !== "string" || outDir.trim() === "") {
    throw new Error("outDir must be a non-empty string");
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("maxBytes must be a positive integer");
  }
  if (!Number.isInteger(maxApiCalls) || maxApiCalls <= 0) {
    throw new Error("maxApiCalls must be a positive integer");
  }
  if (!DISCOVERY_METHODS.has(discoveryMethod)) {
    throw new Error("discoveryMethod must be contents or tree");
  }
  normalizeExtensions(extensions);
};

const discoverFiles = async ({
  repository,
  commit,
  includePrefixes,
  extensions,
  limit,
  maxApiCalls,
  discoveryMethod,
  fetchImpl,
}) => {
  const queue = includePrefixes
    .map((prefix) => prefix.replace(/^\/+|\/+$/gu, ""))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const visited = new Set();
  const candidates = [];
  let apiCalls = 0;
  let limitReached = false;
  const candidateTarget = limit * 8;

  if (discoveryMethod === "tree") {
    const tree = await githubJson(
      `https://api.github.com/repos/${repository}/git/trees/${commit}?recursive=1`,
      fetchImpl,
    );
    apiCalls += 1;
    const normalizedPrefixes = includePrefixes.map((prefix) =>
      prefix.replace(/^\/+|\/+$/gu, ""),
    );
    const candidates = (tree.tree ?? [])
      .filter((entry) => entry.type === "blob")
      .filter((entry) => extensions.includes(path.extname(entry.path).toLowerCase()))
      .filter((entry) =>
        normalizedPrefixes.some(
          (prefix) =>
            entry.path === prefix ||
            entry.path.startsWith(`${prefix}/`),
        ),
      )
      .map((entry) => ({
        path: entry.path,
        size: entry.size,
        downloadUrl: null,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    return {
      candidates,
      apiCalls,
      limitReached: Boolean(tree.truncated),
    };
  }

  while (queue.length > 0 && apiCalls < maxApiCalls) {
    const current = queue.shift();
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const entries = await githubJson(
      `https://api.github.com/repos/${repository}/contents/${encodePath(current)}?ref=${encodeURIComponent(commit)}`,
      fetchImpl,
    );
    apiCalls += 1;
    if (!Array.isArray(entries)) {
      continue;
    }
    const directories = [];
    for (const entry of entries) {
      if (entry.type === "dir") {
        directories.push(entry.path);
      } else if (
        entry.type === "file" &&
        extensions.includes(path.extname(entry.path).toLowerCase())
      ) {
        candidates.push({
          path: entry.path,
          size: entry.size,
          downloadUrl: entry.download_url,
        });
      }
    }
    directories.sort((left, right) => left.localeCompare(right));
    queue.push(...directories);
    if (candidates.length >= candidateTarget) {
      limitReached = true;
      break;
    }
  }

  candidates.sort((left, right) => left.path.localeCompare(right.path));
  return { candidates, apiCalls, limitReached };
};

const encodePath = (value) =>
  value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const normalizeExtensions = (extensions) => {
  const values = Array.isArray(extensions) ? extensions : [extensions];
  const normalized = values
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean)
    .map((value) => (value.startsWith(".") ? value : `.${value}`));
  if (normalized.length === 0) {
    throw new Error("extensions must not be empty");
  }
  return [...new Set(normalized)];
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
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
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
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
};

const fetchWithRetry = async (
  url,
  options,
  fetchImpl,
  attempts = 3,
  timeoutMs = 15_000,
) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
};

const requireValue = (argument, value) => {
  if (typeof value !== "string" || value.startsWith("--")) {
    throw new Error(`${argument} requires a value`);
  }
  return value;
};

const positiveInteger = (argument, value) => {
  const parsed = Number.parseInt(requireValue(argument, value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${argument} requires a positive integer`);
  }
  return parsed;
};

const isMain = () =>
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain()) {
  const options = parseFetchArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage:",
        "  node tools/fetch-github-corpus.mjs [options]",
        "",
        "Options:",
        "  --repo <owner/name>       GitHub repository",
        "  --ref <branch-or-tag>     Ref to resolve; defaults to HEAD",
        "  --include <path-prefix>   Include files under this prefix; repeatable",
        "  --out <path>              Output directory",
        "  --limit <n>               Maximum downloaded files",
        "  --max-bytes <n>           Maximum bytes per file",
        "  --max-api-calls <n>       Maximum GitHub directory requests",
        "  --discovery <method>      contents or tree; defaults to contents",
        "  --extensions <list>       Comma-separated suffixes",
      ].join("\n"),
    );
  } else {
    const manifest = await fetchGitHubCorpus(options);
    console.log(JSON.stringify(manifest.selection, null, 2));
  }
}
