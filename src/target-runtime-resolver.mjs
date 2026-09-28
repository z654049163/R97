import {
  EVIDENCE_PROVENANCE,
  TARGET_RUNTIME_SOURCE,
  TARGET_RUNTIME_STATUS,
} from "./constants.mjs";
import {
  familyForRuntimeId,
  isKnownPlatformFamily,
  surfacesForFamily,
} from "./execution-surfaces.mjs";

const EXTERNAL_SOURCES = new Set([
  EVIDENCE_PROVENANCE.OFFICIAL_SPEC,
  EVIDENCE_PROVENANCE.HUMAN_REVIEW,
]);

const APPROVED_SOURCES = new Set([
  EVIDENCE_PROVENANCE.RUNTIME_OBSERVED,
  "official_project_config",
  "deployment_config",
  "build_manifest",
  "runtime_trace",
  "runtime_fingerprint",
]);

const hasContent = (value) =>
  typeof value === "string" && value.trim() !== "";

const isTimeBound = (record) =>
  hasContent(record.validFrom) ||
  hasContent(record.validUntil) ||
  hasContent(record.detectedAt);

const hasExecutionSurface = (record) => hasContent(record.executionSurface);

const hasVersionProfile = (record) =>
  Array.isArray(record.versionProfile) &&
  record.versionProfile.length > 0 &&
  record.versionProfile.every(hasContent);

const hasProfile = (record) =>
  hasContent(record.platformFamily) &&
  hasExecutionSurface(record) &&
  hasVersionProfile(record);

const hasArtifactBinding = (record) =>
  hasContent(record.artifactHash) || hasContent(record.revision);

const isExternalEvidence = (record) => {
  if (record.external !== true) {
    return false;
  }
  if (!EXTERNAL_SOURCES.has(record.provenance)) {
    return false;
  }
  if (!APPROVED_SOURCES.has(record.source)) {
    return false;
  }
  if (!hasContent(record.scopeId) || !hasContent(record.artifactScope)) {
    return false;
  }
  if (!hasContent(record.runtimeId) || !hasProfile(record)) {
    return false;
  }
  if (!hasArtifactBinding(record) || !isTimeBound(record)) {
    return false;
  }
  return true;
};

/**
 * 族级证据：只要求「平台族已由外部权威证据确认」，不要求执行表面与版本画像。
 *
 * 这是 `context_unknown` 的输入。它对作用域、产物绑定、时间范围、来源等级
 * 的要求与完整证据完全一致——放宽的只有「执行表面 + 版本画像」这两项，
 * 因为这两项在真实项目里常常不可得：解析一个已打包的小程序，`app-service.js`
 * 能确定执行表面，但包内**没有任何字段**能给出基础库版本。
 */
const isFamilyEvidence = (record) => {
  if (record.external !== true) {
    return false;
  }
  if (!EXTERNAL_SOURCES.has(record.provenance)) {
    return false;
  }
  if (!APPROVED_SOURCES.has(record.source)) {
    return false;
  }
  if (!hasContent(record.scopeId) || !hasContent(record.artifactScope)) {
    return false;
  }
  if (!hasContent(record.runtimeId) || !isKnownPlatformFamily(record.platformFamily)) {
    return false;
  }
  if (!hasArtifactBinding(record) || !isTimeBound(record)) {
    return false;
  }
  return true;
};

const fingerprintsAgree = (left, right) => {
  // 只在**两边都提供了**同一字段时比较。
  //
  // 早先的实现直接比较字段值，于是「一份来源只给 artifactHash、另一份只给
  // revision」会被判成 conflict——哪怕它们描述的是同一个产物。不同采集通道
  // 能拿到的标识本来就不一样，缺失不等于冲突。
  if (
    hasContent(left.artifactHash) &&
    hasContent(right.artifactHash) &&
    left.artifactHash !== right.artifactHash
  ) {
    return false;
  }
  if (
    hasContent(left.revision) &&
    hasContent(right.revision) &&
    left.revision !== right.revision
  ) {
    return false;
  }
  // 执行表面是确认门槛的必填项，两边都有；不一致就是真冲突。
  if (left.executionSurface !== right.executionSurface) {
    return false;
  }
  return true;
};

const versionsAgree = (left, right) =>
  left.versionProfile.join(",") === right.versionProfile.join(",");

const isConflict = (left, right) =>
  left.runtimeId !== right.runtimeId ||
  !versionsAgree(left, right) ||
  !fingerprintsAgree(left, right);

const unique = (values) => [...new Set(values)];

const resolved = ({
  ids,
  status,
  source,
  candidates,
  evidenceRecords,
  conflicts = [],
  missing = [],
}) =>
  Object.freeze({
    status,
    targetRuntimeIds: Object.freeze(unique(ids)),
    candidateRuntimeIds: Object.freeze(unique(candidates)),
    source,
    evidenceIds: Object.freeze(
      unique(evidenceRecords.map((record) => record.evidenceId)),
    ),
    conflicts: Object.freeze(
      conflicts.map((conflict) => Object.freeze({ ...conflict })),
    ),
    missing: Object.freeze([...missing]),
  });

export const resolveTargetRuntime = ({
  artifactId = null,
  scopeIds = [],
  requiredRuntimeIds = [],
  declaredRuntimeIds = [],
  inferredRuntimeIds = requiredRuntimeIds,
  targetRuntimeSource = TARGET_RUNTIME_SOURCE.UNKNOWN,
  targetRuntimeEvidence = [],
  targetRuntimeExplicit = false,
}) => {
  const candidates = unique([
    ...declaredRuntimeIds,
    ...inferredRuntimeIds,
  ]);
  const evidence = targetRuntimeEvidence
    .filter(isExternalEvidence)
    .filter((record) =>
      scopeCovers(
        record,
        [artifactId, ...scopeIds].filter(hasContent),
      ),
    );

  if (targetRuntimeEvidence.length > 0 && evidence.length === 0) {
    const familyEvidence = targetRuntimeEvidence
      .filter(isFamilyEvidence)
      .filter((record) =>
        scopeCovers(
          record,
          [artifactId, ...scopeIds].filter(hasContent),
        ),
      );
    if (familyEvidence.length > 0) {
      // 平台族已确认，但完整画像还差东西。收窄候选到该族的执行表面，
      // 并把缺什么显式记下来——这截缺口从此可测量，而不是混进 unknown。
      return resolved({
        ids: unique(familyEvidence.map((record) => record.runtimeId)),
        status: TARGET_RUNTIME_STATUS.CONTEXT_UNKNOWN,
        source: TARGET_RUNTIME_SOURCE.UNKNOWN,
        candidates: unique(
          familyEvidence.flatMap((record) =>
            surfacesForFamily(record.platformFamily),
          ),
        ),
        evidenceRecords: familyEvidence,
        missing: unique(
          familyEvidence.flatMap((record) => [
            ...(hasExecutionSurface(record) ? [] : ["execution_surface"]),
            ...(hasVersionProfile(record) ? [] : ["version_profile"]),
          ]),
        ),
      });
    }
    return resolved({
      ids: declaredRuntimeIds,
      status: TARGET_RUNTIME_STATUS.UNKNOWN,
      source: TARGET_RUNTIME_SOURCE.UNKNOWN,
      candidates,
      evidenceRecords: [],
    });
  }

  const conflicts = findConflicts(evidence);
  if (conflicts.length > 0) {
    return resolved({
      ids: [],
      status: TARGET_RUNTIME_STATUS.CONFLICT,
      source: TARGET_RUNTIME_SOURCE.UNKNOWN,
      candidates,
      evidenceRecords: evidence,
      conflicts,
    });
  }

  const ids = unique(
    evidence.map((record) => record.runtimeId),
  );
  if (ids.length > 0) {
    const confirmed = everyEvidenceIsConfirmed(evidence);
    return resolved({
      ids,
      status: confirmed
        ? TARGET_RUNTIME_STATUS.CONFIRMED
        : TARGET_RUNTIME_STATUS.CORROBORATED,
      source: TARGET_RUNTIME_SOURCE.UNKNOWN,
      candidates,
      evidenceRecords: evidence,
    });
  }

  if (
    targetRuntimeSource === TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG &&
    targetRuntimeExplicit &&
    declaredRuntimeIds.length > 0
  ) {
    return resolved({
      ids: declaredRuntimeIds,
      status: TARGET_RUNTIME_STATUS.CONFIRMED,
      source: TARGET_RUNTIME_SOURCE.EXPERIMENT_CONFIG,
      candidates,
      evidenceRecords: [],
    });
  }

  if (declaredRuntimeIds.length > 0) {
    return resolved({
      ids: declaredRuntimeIds,
      status: TARGET_RUNTIME_STATUS.DECLARED,
      source: TARGET_RUNTIME_SOURCE.DECLARED,
      candidates,
      evidenceRecords: [],
    });
  }

  if (inferredRuntimeIds.length > 0) {
    return resolved({
      ids: candidates,
      status: TARGET_RUNTIME_STATUS.INFERRED,
      source: TARGET_RUNTIME_SOURCE.INFERRED,
      candidates,
      evidenceRecords: [],
    });
  }

  return resolved({
    ids: [],
    status: TARGET_RUNTIME_STATUS.UNKNOWN,
    source: TARGET_RUNTIME_SOURCE.UNKNOWN,
    candidates,
    evidenceRecords: [],
  });
};

const scopeCovers = (record, wantedIds) => {
  if (wantedIds.length === 0) {
    return true;
  }
  return wantedIds.includes(record.scopeId) ||
    wantedIds.includes(record.artifactScope);
};

const everyEvidenceIsConfirmed = (records) => {
  const groups = groupByRuntime(records);
  return groups.every(
    (group) =>
      group.length >= 2 &&
      group.some((record) => record.authority === "authoritative"),
  );
};

const groupByRuntime = (records) => {
  const grouped = new Map();
  for (const record of records) {
    const group = grouped.get(record.runtimeId) ?? [];
    group.push(record);
    grouped.set(record.runtimeId, group);
  }
  return [...grouped.values()];
};

const findConflicts = (records) => {
  const conflicts = [];
  for (const [runtimeId, group] of groupByRuntime(records).entries()) {
    for (let index = 0; index < group.length; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < group.length;
        otherIndex += 1
      ) {
        const left = group[index];
        const right = group[otherIndex];
        if (!isConflict(left, right)) {
          continue;
        }
        conflicts.push({
          runtimeId,
          evidenceIds: [left.evidenceId, right.evidenceId],
          reason: "version_or_artifact_fingerprint_mismatch",
        });
      }
    }
  }
  return conflicts;
};

export const isExternalTargetConfirmed = (status) =>
  status === TARGET_RUNTIME_STATUS.CONFIRMED;

export const targetRuntimeRecordTemplate = Object.freeze({
  evidenceId: "",
  runtimeId: "",
  platformFamily: "",
  executionSurface: "",
  versionProfile: [],
  scopeId: "",
  artifactScope: "",
  artifactHash: null,
  revision: null,
  detectedAt: null,
  validFrom: null,
  validUntil: null,
  external: true,
  authority: "authoritative",
  source: "",
  provenance: "",
});
