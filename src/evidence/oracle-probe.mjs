import vm from "node:vm";

import { createLanguageBaselineContext } from "./language-baseline.mjs";
import { createCommonJsModuleBindings } from "./node-module-bindings.mjs";

/**
 * 判卷探针（oracle probe）：一份实现，在语言基线、Node、Edge 与真实微信
 * AppService 里跑出**可比对**的观测。
 *
 * 它和 R97 决策链用的描述符探针是两个角色：
 *
 * - 描述符探针（`language-probe` / `node-probe` / `browser-probe`）是**被测对象**，
 *   它通过 `Object.getOwnPropertyDescriptor` 读属性，不触发 getter；
 * - 判卷探针是**参考尺子**，只做纯属性读取 + `typeof`，因此在四个环境里都跑得起来，
 *   环境之间出现差异时能确定是环境差异而不是尺子差异。
 *
 * 两条语义约束都是实测踩出来的，不能改回去：
 *
 * 1. 不能反过来用 `in` 判缺失。小程序宿主对象（例如 `wx.cloud`）对 `in` 和
 *    `Object.keys` 全部返回空，但属性读取拿得到真实函数。用 `in` 判缺失会把
 *    宿主 API 误报成不存在，而语言基线里它也不存在，两边「一致」就可能放行
 *    不安全折叠。所以 `in` 只在读到的值为 `undefined` 时用于补证。
 * 2. 不能用反射接口。微信 AppService 上对 `Function` 做反射会栈溢出，
 *    连会话一起卡死（实测：探过一次 `Function` 之后，同一会话里连 `Math.max`
 *    都开始超时）。因此判卷探针只做纯读取，且 `Function` 根节点不参与微信判卷。
 */
export const oracleProbeSource = `
function r97OracleProbe(entityIds, injectedRoots) {
  function observe(entityId) {
    const parts = String(entityId).split(".");
    let current = globalThis;
    let resolved = true;
    let lastStepPresent = false;

    for (let index = 0; index < parts.length; index += 1) {
      const property = parts[index];
      if (
        index === 0 &&
        injectedRoots &&
        Object.prototype.hasOwnProperty.call(injectedRoots, property)
      ) {
        current = injectedRoots[property];
        if (index === parts.length - 1) {
          lastStepPresent = true;
        }
        continue;
      }
      if (current === null || current === undefined) {
        resolved = false;
        current = undefined;
        break;
      }
      if (index === parts.length - 1) {
        try {
          lastStepPresent = property in Object(current);
        } catch (error) {
          lastStepPresent = false;
        }
      }
      try {
        current = current[property];
      } catch (error) {
        // 属性存在但读取抛错（getter / 代理陷阱）：只能确认存在，
        // 不能编造 type 与 callability。
        return { existence: true };
      }
    }

    if (!resolved) {
      return { existence: false, type: "undefined", callability: false };
    }
    const type = typeof current;
    return {
      existence: current !== undefined || lastStepPresent,
      type,
      callability: type === "function",
    };
  }

  const output = {};
  for (const entityId of entityIds) {
    try {
      output[entityId] = observe(entityId);
    } catch (error) {
      output[entityId] = { error: String((error && error.message) || error) };
    }
  }
  return output;
}
`;

/** 在 Node 里直接执行判卷探针。 */
export const createOracleProbe = () =>
  new Function(`${oracleProbeSource}\nreturn r97OracleProbe;`)();

export const evaluateOracleProbeInNode = (entityIds) =>
  createOracleProbe()(entityIds, createCommonJsModuleBindings());

/**
 * 在**真实隔离的 vm 上下文**里执行判卷探针。
 *
 * 这是语言基线那一列的正确来源。此前它取自决策链的描述符探针，而那个探针只是
 * 在当前 Node realm 里按白名单过滤——它既不是独立环境，也不是独立实现，作为判卷
 * 参照说不通。vm 上下文自带全部 ECMAScript 内建，但没有 `process`、`require`、
 * `wx`、`window` 这些宿主对象，正好是「裸 JS 引擎」的定义。
 */
export const evaluateOracleProbeInVm = (entityIds) => {
  const context = createLanguageBaselineContext();
  vm.runInContext(oracleProbeSource, context, { timeout: 5000 });
  const serialized = JSON.stringify(entityIds).replaceAll("<", "\\u003c");
  return vm.runInContext(`r97OracleProbe(${serialized})`, context, {
    timeout: 5000,
  });
};

/** 生成可在浏览器（CDP `Runtime.evaluate`）里求值的表达式。 */
export const buildOracleProbeExpression = (entityIds) => {
  const serialized = JSON.stringify(entityIds).replaceAll("<", "\\u003c");
  return `(() => {
  ${oracleProbeSource}
  return r97OracleProbe(${serialized});
})()`;
};

/**
 * 供微信 AppService 求值用的探针函数。
 *
 * miniprogram-automator 会把函数序列化后送进 AppService，因此这里必须是
 * 一份自包含的普通函数；它的函数体与 `oracleProbeSource` 同源。
 */
export const createWechatOracleProbe = () => createOracleProbe();
