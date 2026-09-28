/**
 * 最小 Worker：只回显收到的消息，不读任何实体。
 *
 * 用来把「Worker 没跑起来」和「Worker 跑了但读实体出错」分开——前者是工具/编译
 * 问题，后者才是探针逻辑问题。
 */
worker.onMessage((payload) => {
  worker.postMessage({
    marker: "r97-minimal",
    echo: payload,
    typeofWorker: typeof worker,
    typeofGlobalThis: typeof globalThis,
    hasWx: typeof wx,
  });
});
