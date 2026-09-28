// R97 Worker 侧探针：逐段访问实体路径，回传存在性与类型。
//
// Worker 是受限子环境（没有 wx、没有 document）。这里不用 eval / Function，
// 只用属性访问，并且把逻辑整个放在 onMessage 回调里——顶层 `const` 声明在
// 某些 Worker 运行时上会让脚本加载失败（实测 createWorker 返回 undefined）。
worker.onMessage((payload) => {
  const entityIds = (payload && payload.entityIds) || [];
  const observations = {};
  for (let index = 0; index < entityIds.length; index += 1) {
    const entityId = entityIds[index];
    const parts = String(entityId).split(".");
    let current = globalThis;
    let found = true;
    for (let step = 0; step < parts.length; step += 1) {
      if (current === null || current === undefined) {
        found = false;
        break;
      }
      try {
        current = current[parts[step]];
      } catch (error) {
        found = false;
        observations[entityId] = {
          existence: false,
          type: "undefined",
          error: (error && error.name) || "Error",
        };
        break;
      }
    }
    if (!observations[entityId]) {
      observations[entityId] = {
        existence: Boolean(found && current !== undefined),
        type: typeof current,
      };
    }
  }
  worker.postMessage({
    marker: "r97-worker-probe",
    observations,
    environment: {
      hasWx: typeof wx !== "undefined",
      hasGlobalThis: typeof globalThis !== "undefined",
      hasSelf: typeof self !== "undefined",
      hasDocument: typeof document !== "undefined",
    },
  });
});
