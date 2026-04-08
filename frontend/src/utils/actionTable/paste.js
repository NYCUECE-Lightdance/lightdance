// 區間貼上 — 把複製的點位平移後 trim 進目標 timeline
//
// 來源：audioplayer.jsx `executeAdvancedPaste` (L294) + `ensureBlackBefore` (L43)
// 行為等價。

import { produce } from 'immer';
import { BLACK, isBlack } from './constants.js';
import { removeDuplicateBlackBlocks } from './deleteRange.js';

/**
 * 確保 targetTime 之前 threshold ms 處有黑點（沒有就補一個）
 * @internal
 */
export function ensureBlackBefore(timeline, targetTime, threshold = 10) {
  const blackTime = targetTime - threshold;
  if (blackTime <= 0) return;

  const existingIdx = timeline.findIndex((p) => Math.abs(p.time - blackTime) < 5);

  if (existingIdx !== -1) {
    const p = timeline[existingIdx];
    if (!isBlack(p.color)) {
      p.color = { ...BLACK };
      p.linear = 0;
    }
    return;
  }

  // 檢查 blackTime 之前的最後一個點，若不是黑就補一個
  const prevPoints = timeline.filter((p) => p.time < blackTime);
  if (prevPoints.length === 0) return;
  const lastPoint = prevPoints[prevPoints.length - 1];
  if (isBlack(lastPoint.color)) return;

  timeline.push({
    time: blackTime,
    color: { ...BLACK },
    linear: 0,
  });
}

/**
 * 把複製的 keyframe 序列平移 offset 後貼到 (targetArmor, targetPart)
 * 衝突區間採 trim 策略，連帶清掉衝突結尾的黑點
 */
export function paste(actionTable, {
  targetArmor,
  targetPart,
  offset,
  copiedData,
  blackthreshold = 10,
}) {
  const updated = produce(actionTable, (draft) => {
    let timeline = draft[targetArmor]?.[targetPart];
    if (!Array.isArray(timeline)) return;

    const movedPoints = copiedData.map((p) => ({ ...p, time: p.time + offset }));
    if (movedPoints.length === 0) return;

    const newStart = movedPoints[0].time;
    const newEnd = movedPoints[movedPoints.length - 1].time;

    // 收集衝突點 index
    const indicesToRemove = new Set();
    let lastConflictIdx = -1;
    timeline.forEach((item, idx) => {
      if (item.time >= newStart && item.time <= newEnd) {
        indicesToRemove.add(idx);
        lastConflictIdx = idx;
      }
    });

    // 衝突結尾後若緊跟黑點，也清掉
    if (lastConflictIdx !== -1 && lastConflictIdx + 1 < timeline.length) {
      const nextP = timeline[lastConflictIdx + 1];
      if (isBlack(nextP.color)) {
        indicesToRemove.add(lastConflictIdx + 1);
      }
    }

    let nextTimeline = timeline.filter((_, idx) => !indicesToRemove.has(idx));
    nextTimeline = [...nextTimeline, ...movedPoints].sort((a, b) => a.time - b.time);

    // 在貼上區間起點前補黑（避免被前面的色塊漸變吃掉）
    const firstColorPoint = movedPoints.find((p) => !isBlack(p.color));
    if (firstColorPoint) {
      ensureBlackBefore(nextTimeline, firstColorPoint.time, blackthreshold);
    }

    draft[targetArmor][targetPart] = nextTimeline.sort((a, b) => a.time - b.time);
  });

  return removeDuplicateBlackBlocks(updated);
}
