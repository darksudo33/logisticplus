export function normalizeShipmentContainerCounts(value = {}) {
  const container20Count = Number(value.container20Count ?? 0);
  const container40Count = Number(value.container40Count ?? 0);
  return {
    container20Count: Number.isFinite(container20Count) ? container20Count : 0,
    container40Count: Number.isFinite(container40Count) ? container40Count : 0,
  };
}
