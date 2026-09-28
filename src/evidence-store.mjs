export class InMemoryEvidenceStore {
  #byQuery = new Map();

  add(evidenceRecord) {
    const key = makeEvidenceKey(
      evidenceRecord.entityId,
      evidenceRecord.usageContextId,
      evidenceRecord.semanticContractId,
    );
    const records = this.#byQuery.get(key) ?? [];
    records.push(evidenceRecord);
    this.#byQuery.set(key, records);
    return evidenceRecord;
  }

  get({ entityId, usageContextId, semanticContractId }) {
    return this.#byQuery.get(
      makeEvidenceKey(entityId, usageContextId, semanticContractId),
    ) ?? [];
  }

  clear() {
    this.#byQuery.clear();
  }
}

const makeEvidenceKey = (entityId, usageContextId, semanticContractId) =>
  `${entityId}\u0000${usageContextId}\u0000${semanticContractId}`;

