/**
 * 判卷探针在评测层的入口。
 *
 * 实现已统一到 `src/evidence/oracle-probe.mjs`：同一份代码在语言基线、
 * Node、Edge 与真实微信 AppService 里执行，这样环境之间出现差异时可以确定
 * 是环境差异，而不是探针写法差异。
 *
 * 历史名字（direct probe）保留为别名，避免大范围改动调用点。
 */
export {
  oracleProbeSource as directProbeSource,
  createOracleProbe,
  evaluateOracleProbeInNode as evaluateDirectProbeInNode,
  buildOracleProbeExpression as buildDirectProbeExpression,
} from "../evidence/oracle-probe.mjs";
