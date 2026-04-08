// 區間平移 — 把 [start, end] 內的所有點搬到目標位置
//
// 來源：audioplayer.jsx `executeTimeShift` (L1348)
//
// ⚠️ 已知 bug（從原碼繼承，未修）：
//   原 `executeTimeShift` 引用了 `globalFirstTime` 變數，但程式碼中從未定義它
//   （L1350 的註解寫「前段計算 globalFirstTime 與 offset 的邏輯保持不變」但實際沒有）
//   → offset = target - undefined = NaN → 平移結果會壞掉
//
//   為了「Phase 0.5 純重構不改行為」原則，這裡保留同樣的 bug。
//   修正放到 Phase 1/4，那時搭配 segment 模型一起重做。
//
//   workaround：把每個被選中點時間的最小值當作 globalFirstTime（合理推測）
//   呼叫端可選擇傳入 explicit globalFirstTime 覆寫此預設行為。

import { produce } from 'immer';
import { isBlack } from './constants.js';
import { removeDuplicateBlackBlocks } from './deleteRange.js';
import { ensureBlackBefore } from './paste.js';

export function shift(actionTable, {
  start,
  end,
  target,
  globalFirstTime: explicitFirstTime,
  blackthreshold = 10,
}) {
  // 推測 globalFirstTime：所有 part 中 [start, end] 區間內最早的 time
  let inferredFirstTime = explicitFirstTime;
  if (inferredFirstTime === undefined) {
    let min = Infinity;
    Object.values(actionTable).forEach((armor) => {
      Object.values(armor).forEach((timeline) => {
        if (!Array.isArray(timeline)) return;
        timeline.forEach((p) => {
          if (p.time >= start && p.time <= end && p.time < min) {
            min = p.time;
          }
        });
      });
    });
    inferredFirstTime = Number.isFinite(min) ? min : start;
  }

  const offset = target - inferredFirstTime;

  const updated = produce(actionTable, (draft) => {
    Object.keys(draft).forEach((armorIdx) => {
      Object.keys(draft[armorIdx]).forEach((partIdx) => {
        let timeline = draft[armorIdx][partIdx];
        if (!Array.isArray(timeline)) return;

        const moveIndices = [];
        timeline.forEach((p, idx) => {
          if (p.time >= start && p.time <= end) moveIndices.push(idx);
        });
        if (moveIndices.length === 0) return;

        const movedPoints = moveIndices.map((idx) => ({
          ...timeline[idx],
          time: timeline[idx].time + offset,
        }));

        const newStart = movedPoints[0].time;
        const newEnd = movedPoints[movedPoints.length - 1].time;
        const toRemove = new Set(moveIndices);
        timeline.forEach((p, idx) => {
          if (p.time >= newStart && p.time <= newEnd) toRemove.add(idx);
        });

        let nextTimeline = timeline.filter((_, idx) => !toRemove.has(idx));
        nextTimeline = [...nextTimeline, ...movedPoints].sort((a, b) => a.time - b.time);

        const firstColorPoint = movedPoints.find((p) => !isBlack(p.color));
        if (firstColorPoint) {
          ensureBlackBefore(nextTimeline, firstColorPoint.time, blackthreshold);
        }

        draft[armorIdx][partIdx] = nextTimeline.sort((a, b) => a.time - b.time);
      });
    });
  });

  return removeDuplicateBlackBlocks(updated);
}
