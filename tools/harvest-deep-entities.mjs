/**
 * 运行深度实体收集工具，产出 Node 与 Web 规范原型实体。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

import { buildHarvestedEntityMap } from "../src/evidence/deep-explorer.mjs";

const OUT_DIR = "datasets/deep-entities";
const OUT_FILE = path.join(OUT_DIR, "harvested-host-entities.json");

function run() {
  console.log("=== 启动深层命名空间与实例原型链安全枚举 ===");
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. 选取代表性的典型宿主根节点与工厂对象原型
  const roots = {
    crypto,
    fs,
    process,
    console,
    // Web 标准跨宿主 API（Node 与 Headless 浏览器环境均具备）
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    EventTarget,
    Event,
    MessageChannel,
    MessagePort,
    FormData: globalThis.FormData ?? {},
    Headers: globalThis.Headers ?? {},
    Request: globalThis.Request ?? {},
    Response: globalThis.Response ?? {},
  };

  // 2. 模拟与构造规范常见工厂类原型（遵循只读原型链反射，绝不调用实例方法）
  const prototypes = {
    "fs.Stats.prototype": fs.Stats.prototype,
    "crypto.Hash.prototype": crypto.createHash("sha256").constructor.prototype,
    "crypto.Cipher.prototype": crypto.Cipher?.prototype ?? {},
    "URL.prototype": URL.prototype,
    "URLSearchParams.prototype": URLSearchParams.prototype,
    "TextEncoder.prototype": TextEncoder.prototype,
    "TextDecoder.prototype": TextDecoder.prototype,
    "AbortController.prototype": AbortController.prototype,
    "AbortSignal.prototype": AbortSignal.prototype,
    "EventTarget.prototype": EventTarget.prototype,
    "MessagePort.prototype": MessagePort.prototype,
    // 微信小程序特有实例原型（静态类定义与无害抽象）
    "wx.FileSystemManager.prototype": {
      readFile: () => {},
      writeFile: () => {},
      access: () => {},
      mkdir: () => {},
      rmdir: () => {},
      readdir: () => {},
      stat: () => {},
      unlink: () => {},
      copyFile: () => {},
    },
    "wx.SocketTask.prototype": {
      send: () => {},
      close: () => {},
      onOpen: () => {},
      onClose: () => {},
      onError: () => {},
      onMessage: () => {},
    },
    "wx.InnerAudioContext.prototype": {
      play: () => {},
      pause: () => {},
      stop: () => {},
      seek: () => {},
      destroy: () => {},
      onPlay: () => {},
      onPause: () => {},
      onStop: () => {},
      onEnded: () => {},
      onError: () => {},
    },
    "wx.RequestTask.prototype": {
      abort: () => {},
      onHeadersReceived: () => {},
      offHeadersReceived: () => {},
    },
    "wx.UploadTask.prototype": {
      abort: () => {},
      onProgressUpdate: () => {},
      offProgressUpdate: () => {},
    },
  };

  const harvested = buildHarvestedEntityMap({
    roots,
    prototypes,
    maxDepth: 3,
  });

  const entityCount = Object.keys(harvested).length;
  console.log(`枚举完成！共发现深层实体数量: ${entityCount}`);

  const output = {
    generatedAt: new Date().toISOString(),
    totalEntities: entityCount,
    entities: harvested,
  };

  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`已成功保存至: ${OUT_FILE}`);
}

run();
