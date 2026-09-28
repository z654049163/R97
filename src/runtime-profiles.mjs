import { RUNTIME_KIND } from "./constants.mjs";
import { createRuntimeProfile } from "./model.mjs";

export const RUNTIME_IDS = Object.freeze({
  LANGUAGE: "e1-ecmascript",
  NODE: "e2-node-24.21.0",
  WECHAT: "e4-wechat-real",
  EDGE: "e5-edge-headless",
});

export const LANGUAGE_PROFILE = createRuntimeProfile({
  runtimeId: RUNTIME_IDS.LANGUAGE,
  runtimeKind: RUNTIME_KIND.LANGUAGE_BASELINE,
  runtimeFamily: "ecmascript",
  runtimeName: "ECMAScript language baseline",
  runtimeVersion: "es2024",
  environmentFingerprint: {
    host: "language",
  },
});

export const NODE_PROFILE = createRuntimeProfile({
  runtimeId: RUNTIME_IDS.NODE,
  runtimeKind: RUNTIME_KIND.HOST_RUNTIME,
  runtimeFamily: "node",
  runtimeName: "Node.js",
  runtimeVersion: process.version,
  environmentFingerprint: {
    platform: process.platform,
    arch: process.arch,
  },
});

export const EDGE_PROFILE = createRuntimeProfile({
  runtimeId: RUNTIME_IDS.EDGE,
  runtimeKind: RUNTIME_KIND.HOST_RUNTIME,
  runtimeFamily: "browser",
  runtimeName: "Microsoft Edge",
  runtimeVersion: "external",
  environmentFingerprint: {
    mode: "headless",
  },
});

export const WECHAT_PROFILE = createRuntimeProfile({
  runtimeId: RUNTIME_IDS.WECHAT,
  runtimeKind: RUNTIME_KIND.HOST_RUNTIME,
  runtimeFamily: "wechat_miniprogram",
  runtimeName: "WeChat Mini Program",
  runtimeVersion: "external",
  sdkVersion: "external",
  environmentFingerprint: {
    source: "external_import",
  },
});
