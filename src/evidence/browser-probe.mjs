import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  EVIDENCE_PROVENANCE,
  SEMANTIC_DIMENSION,
} from "../constants.mjs";
import { createRuntimeObservation } from "../model.mjs";
import { EDGE_PROFILE } from "../runtime-profiles.mjs";
import { withCdpPage } from "./cdp-client.mjs";

const SAFE_DIMENSIONS = new Set([
  SEMANTIC_DIMENSION.EXISTENCE,
  SEMANTIC_DIMENSION.TYPE,
  SEMANTIC_DIMENSION.CALLABILITY,
]);

const DEFAULT_BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

export const collectBrowserObservations = async ({
  entityDimensions,
  runtimeProfile = EDGE_PROFILE,
  browserPath = findBrowserPath(),
  observedAt = new Date().toISOString(),
  timeoutMs = 30000,
}) => {
  if (!browserPath) {
    throw new Error(
      "No Chromium-based browser was found. Set R97_BROWSER_PATH to a browser executable.",
    );
  }

  const requested = {};
  for (const [entityId, dimensions] of normalizeEntityDimensions(
    entityDimensions,
  )) {
    const safe = dimensions.filter((dimension) =>
      SAFE_DIMENSIONS.has(dimension),
    );
    if (safe.length > 0) {
      requested[entityId] = safe;
    }
  }

  if (Object.keys(requested).length === 0) {
    return Object.freeze({
      runtimeId: runtimeProfile.runtimeId,
      provenance: EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
      observations: Object.freeze({}),
    });
  }

  const profileDir = path.join(process.cwd(), ".runtime", "edge-profile");
  mkdirSync(profileDir, { recursive: true });

  const { raw, browserVersion } = await withCdpPage(
    { browserPath, profileDir, startupTimeoutMs: timeoutMs },
    async ({ evaluate, browserVersion: version }) => ({
      raw: await evaluate(buildProbeExpression(requested)),
      browserVersion: version,
    }),
  );

  const observations = {};
  for (const [entityId, values] of Object.entries(raw ?? {})) {
    const observedDimensions = Object.keys(values);
    if (observedDimensions.length === 0) {
      continue;
    }
    observations[entityId] = createRuntimeObservation({
      runtimeProfileId: runtimeProfile.runtimeId,
      observedDimensions,
      values,
      sideEffects: [],
      observedAt,
      probeHash: probeHash({
        runtimeId: runtimeProfile.runtimeId,
        entityId,
        observedDimensions,
      }),
    });
  }

  return Object.freeze({
    runtimeId: runtimeProfile.runtimeId,
    provenance: EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
    observations: Object.freeze(observations),
    browserVersion,
  });
};

export const buildProbeExpression = (requested) => {
  const serialized = JSON.stringify(requested).replaceAll("<", "\\u003c");
  return `(() => {
  const requested = ${serialized};
  const safeGlobalAccessors = new Set([
    "crypto",
    "document",
    "localStorage",
    "navigator",
    "performance",
    "sessionStorage",
    "window"
  ]);

  function descriptorValue(object, property) {
    if (object === null || object === undefined) {
      return { status: "missing" };
    }
    let current = object;
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor) {
        if (Object.hasOwn(descriptor, "value")) {
          return { status: "value", value: descriptor.value };
        }
        return { status: "accessor" };
      }
      current = Object.getPrototypeOf(current);
    }
    return { status: "missing" };
  }

  function rootValue(name) {
    if (name === "globalThis" || name === "global") {
      return { status: "value", value: globalThis };
    }
    const result = descriptorValue(globalThis, name);
    if (result.status === "accessor" && safeGlobalAccessors.has(name)) {
      try {
        return { status: "value", value: globalThis[name] };
      } catch (error) {
        return { status: "accessor" };
      }
    }
    return result;
  }

  function observe(entityId, dimensions) {
    const parts = entityId.split(".");
    const root = parts.shift();
    const first = rootValue(root);
    const values = {};
    if (first.status === "missing") {
      if (dimensions.includes("existence")) values.existence = false;
      if (dimensions.includes("type")) values.type = "undefined";
      if (dimensions.includes("callability")) values.callability = false;
      return values;
    }
    if (first.status === "accessor") {
      if (dimensions.includes("existence")) values.existence = true;
      return values;
    }

    let value = first.value;
    for (const property of parts) {
      const next = descriptorValue(value, property);
      if (next.status === "missing") {
        if (dimensions.includes("existence")) values.existence = false;
        if (dimensions.includes("type")) values.type = "undefined";
        if (dimensions.includes("callability")) values.callability = false;
        return values;
      }
      if (next.status === "accessor") {
        if (dimensions.includes("existence")) values.existence = true;
        return values;
      }
      value = next.value;
    }

    const type = typeof value;
    if (dimensions.includes("existence")) values.existence = true;
    if (dimensions.includes("type")) values.type = type;
    if (dimensions.includes("callability")) values.callability = type === "function";
    return values;
  }

  const output = {};
  for (const [entityId, dimensions] of Object.entries(requested)) {
    output[entityId] = observe(entityId, dimensions);
  }
  return output;
})()`;
};

const normalizeEntityDimensions = (input) => {
  if (input instanceof Map) {
    return input.entries();
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("entityDimensions must be a Map or object");
  }
  return Object.entries(input);
};

export const findBrowserPath = () => {
  if (process.env.R97_BROWSER_PATH && existsSync(process.env.R97_BROWSER_PATH)) {
    return process.env.R97_BROWSER_PATH;
  }
  return (
    DEFAULT_BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) ??
    null
  );
};

const probeHash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
