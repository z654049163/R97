import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_LEGACY_RULE_MAP =
  "E:\\复现\\JSIMPLIFIER\\jsimplifier_dataset\\jsimplifier\\data\\pra-rule-map.json";

const FALLBACK_SYMBOLS = Object.freeze([
  "App",
  "Behavior",
  "Buffer",
  "Component",
  "Page",
  "clearInterval",
  "clearTimeout",
  "getApp",
  "getCurrentPages",
  "process",
  "require",
  "setInterval",
  "setTimeout",
  "wx",
]);

export const loadLegacyBlacklist = (filePath = DEFAULT_LEGACY_RULE_MAP) => {
  if (filePath && existsSync(filePath)) {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const symbols = (parsed.entries ?? [])
      .map((entry) => entry?.symbol)
      .filter((symbol) => typeof symbol === "string" && symbol.length > 0);
    return {
      source: path.resolve(filePath),
      symbols: new Set(symbols),
    };
  }

  return {
    source: "<fallback>",
    symbols: new Set(FALLBACK_SYMBOLS),
  };
};
