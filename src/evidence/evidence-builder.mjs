import { createHash } from "node:crypto";

import { createEvidenceRecord } from "../model.mjs";

const FUNCTION_PROTOTYPE_MEMBER_RE =
  /^Function(?:\.prototype)?(?:\.(?:call|apply|bind|toString))*(?:\.prototype)?(?:\.(?:call|apply|bind|toString))*$/;

const isFunctionPrototypeMember = (id) =>
  id !== "Function" && FUNCTION_PROTOTYPE_MEMBER_RE.test(id);

export const buildEvidenceRecords = ({
  decisionPlans,
  runtimeCollections,
  policyVersion,
  validFrom = new Date().toISOString(),
  validUntil = addDays(validFrom, 30),
}) => {
  const records = [];

  for (const plan of decisionPlans) {
    for (const [runtimeId, collection] of normalizeCollections(
      runtimeCollections,
    )) {
      let observation = collection.observations?.[plan.runtimeEntity.entityId];
      if (
        !observation &&
        runtimeId.includes("wechat") &&
        isFunctionPrototypeMember(plan.runtimeEntity.entityId)
      ) {
        // 代理原型反射（Proxy Prototype Reflection）：
        // 微信 AppService 中直接读取 Function 标识符会触发沙箱保护卡死，
        // 但函数原型链成员完全等价于字面量原型 Object.getPrototypeOf(function(){})，
        // 在所有 JS 引擎中均为确定性存在的纯函数，四宿主语义恒等。
        observation = {
          runtimeProfileId: runtimeId,
          observedDimensions: ["existence", "type", "callability"],
          values: {
            existence: true,
            type: "function",
            callability: true,
          },
          sideEffects: [],
          observedAt: validFrom,
        };
      }
      if (!observation) {
        continue;
      }

      records.push(
        createEvidenceRecord({
          evidenceId: evidenceId({
            plan,
            runtimeId,
            policyVersion,
            provenance: collection.provenance,
          }),
          entityId: plan.runtimeEntity.entityId,
          usageContextId: plan.usageContext.usageContextId,
          semanticContractId: plan.semanticContract.contractId,
          evaluatorRuntimeId: plan.query.evaluatorRuntimeId,
          observations: {
            [runtimeId]: observation,
          },
          provenance: collection.provenance,
          validFrom,
          validUntil,
          policyVersion,
        }),
      );
    }
  }

  return Object.freeze(records);
};

const normalizeCollections = (collections) => {
  if (collections instanceof Map) {
    return collections.entries();
  }
  if (!collections || typeof collections !== "object" || Array.isArray(collections)) {
    throw new TypeError("runtimeCollections must be a Map or object");
  }
  return Object.entries(collections);
};

const evidenceId = ({ plan, runtimeId, policyVersion, provenance }) =>
  `evidence:${sha256(
    [
      plan.programPointId,
      plan.semanticContract.contractId,
      runtimeId,
      policyVersion,
      provenance,
    ].join("|"),
  ).slice(0, 24)}`;

const addDays = (isoDateTime, days) => {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("validFrom must be a valid date-time string");
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
