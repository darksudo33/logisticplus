export function shipmentTimerOrderBy(alias = "s") {
  const prefix = alias ? `${alias}.` : "";
  const activeTimer = `${prefix}timer_deadline_at IS NOT NULL AND ${prefix}timer_completed_at IS NULL AND ${prefix}timer_removed_at IS NULL`;
  return `
    CASE WHEN ${activeTimer} THEN 0 ELSE 1 END ASC,
    CASE WHEN ${activeTimer} THEN ${prefix}timer_deadline_at END ASC NULLS LAST,
    ${prefix}created_at DESC
  `;
}
