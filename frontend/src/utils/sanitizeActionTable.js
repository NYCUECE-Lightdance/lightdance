/**
 * 將 actionTable 中所有有色區塊（非純黑）的 time 對齊至 50ms 倍數。
 * 純黑區塊（R=0, G=0, B=0）保留原始 time 不做修改，維持視覺間隔。
 */
export function sanitizeActionTableTimes(actionTable) {
  if (!Array.isArray(actionTable)) return actionTable;

  return actionTable.map((armor) => {
    const sanitized = {};
    for (const key of Object.keys(armor)) {
      const timeline = armor[key];
      if (!Array.isArray(timeline)) {
        sanitized[key] = timeline;
        continue;
      }
      sanitized[key] = timeline.map((entry) => {
        if (!entry || typeof entry.time !== "number") return entry;
        const isBlack =
          (entry.color?.R ?? 0) === 0 &&
          (entry.color?.G ?? 0) === 0 &&
          (entry.color?.B ?? 0) === 0;
        if (isBlack) return entry;
        return { ...entry, time: Math.round(entry.time / 50) * 50 };
      });
    }
    return sanitized;
  });
}
