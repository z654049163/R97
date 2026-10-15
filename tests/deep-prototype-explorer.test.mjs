import assert from "node:assert/strict";
import test from "node:test";

import {
  exploreDeepEntityPaths,
  reflectPrototypeProperties,
  buildHarvestedEntityMap,
} from "../src/evidence/deep-explorer.mjs";

test("exploreDeepEntityPaths 深度遍历命名空间且不触发 getter 副作用", () => {
  let getterInvoked = false;
  const fixture = {
    sub: {
      action: () => "ok",
      deep: {
        val: 123,
      },
    },
    get dangerousGetter() {
      getterInvoked = true;
      return "side_effect";
    },
  };

  const results = exploreDeepEntityPaths(fixture, "root", { maxDepth: 3 });

  // 验证不触发 getter
  assert.equal(getterInvoked, false, "深度遍历绝对不能触发 accessor getter");

  // 验证展开的深层实体路径
  const paths = Object.keys(results);
  assert.ok(paths.includes("root.sub"), "包含 root.sub");
  assert.ok(paths.includes("root.sub.action"), "包含 root.sub.action");
  assert.ok(paths.includes("root.sub.deep.val"), "包含 root.sub.deep.val");
  
  // dangerousGetter 只能记录为 accessor / existence，不能获取具体动态值
  assert.equal(results["root.dangerousGetter"]?.type, null);
  assert.equal(results["root.sub.action"]?.type, "function");
  assert.equal(results["root.sub.action"]?.callability, true);
});

test("reflectPrototypeProperties 安全反射类与原型链方法", () => {
  class MockFileSystemManager {
    readFile() {}
    writeFile() {}
    mkdir() {}
    get status() { return "ready"; }
  }

  const results = reflectPrototypeProperties(
    MockFileSystemManager.prototype,
    "wx.FileSystemManager.prototype",
  );

  assert.ok(
    Object.hasOwn(results, "wx.FileSystemManager.prototype.readFile"),
    "必须识别原型上的 readFile 方法",
  );
  assert.equal(
    results["wx.FileSystemManager.prototype.readFile"].type,
    "function",
  );
  assert.equal(
    results["wx.FileSystemManager.prototype.readFile"].callability,
    true,
  );
  assert.ok(
    Object.hasOwn(results, "wx.FileSystemManager.prototype.writeFile"),
    "必须识别原型上的 writeFile 方法",
  );
  // status 是 getter，不执行
  assert.equal(
    results["wx.FileSystemManager.prototype.status"].type,
    null,
  );
});

test("buildHarvestedEntityMap 能够聚合多根节点与原型反射生成规范实体集合", () => {
  const harvested = buildHarvestedEntityMap({
    roots: {
      crypto: {
        subtle: {
          digest: () => {},
        },
      },
    },
    prototypes: {
      "crypto.SubtleCrypto.prototype": {
        digest: () => {},
        encrypt: () => {},
      },
    },
  });

  assert.ok(Object.hasOwn(harvested, "crypto.subtle.digest"));
  assert.ok(Object.hasOwn(harvested, "crypto.SubtleCrypto.prototype.encrypt"));
  assert.equal(harvested["crypto.SubtleCrypto.prototype.encrypt"].callability, true);
});

test("非破坏性红线：原型链扫描中遇到循环引用与不可枚举属性安全终止", () => {
  const circularObj = {
    name: "circular_root",
  };
  circularObj.self = circularObj; // 自引用环

  const results = exploreDeepEntityPaths(circularObj, "circular", { maxDepth: 4 });
  assert.ok(Object.hasOwn(results, "circular.name"));
  assert.equal(results["circular.name"].type, "string");
  // 环形引用通过 seenObjects 弱引用集合终止，不陷入死循环
  assert.ok(results);
});
