import { TICK_MS } from "../constants/time.js";

/**
 * 將 actionTable 中所有有色區塊（非純黑）的 time 對齊至 TICK_MS 倍數。
 * 純黑區塊（R=0, G=0, B=0）保留原始 time 不做修改，維持視覺間隔。
 */
export function sanitizeActionTableTimes(actionTable) {
  if (!Array.isArray(actionTable)) return actionTable;

  return actionTable.map((armor) => {
    // 容器維持 array（見 utils/actionTable/toNestedArray.js 的說明）
    const sanitized = [];
    for (const key of Object.keys(armor)) {
      const partIndex = Number(key);
      const timeline = armor[key];
      if (!Array.isArray(timeline)) {
        sanitized[partIndex] = timeline;
        continue;
      }
      sanitized[partIndex] = timeline.map((entry) => {
        if (!entry || typeof entry.time !== "number") return entry;
        const isBlack =
          (entry.color?.R ?? 0) === 0 &&
          (entry.color?.G ?? 0) === 0 &&
          (entry.color?.B ?? 0) === 0;
        if (isBlack) return entry;
        return { ...entry, time: Math.round(entry.time / TICK_MS) * TICK_MS };
      });
    }
    return sanitized;
  });
}
