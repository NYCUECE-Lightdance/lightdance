// 頻閃效果 — 在選中色塊範圍內生成 (色, 黑) 配對的閃爍序列
//
// 來源：audioplayer.jsx `applyBlinkEffect` (L852)。行為等價。
//
// 注意：viewBlock 與 isLinear/targetEndBlock 由呼叫端從 timelineBlocks 與 timeline
//       算出後傳入，util 不訂閱 redux。

import { produce } from 'immer';
import { TICK_MS, BLACK_THRESHOLD, BLACK, isBlack } from './constants.js';
import { removeDuplicateBlackBlocks } from './deleteRange.js';

/**
 * @param {*} actionTable
 * @param {Object} args
 * @param {number} args.armor
 * @param {number} args.part
 * @param {number} args.blockIndex
 * @param {number} args.period - 頻閃週期 ms（必須是 TICK_MS 的倍數，呼叫端先驗證）
 * @param {{startTime,durationTime}} args.viewBlock - 從 timelineBlocks 取得的視覺色塊資料
 */
export function applyBlink(actionTable, {
  armor,
  part,
  blockIndex,
  period,
  viewBlock,
}) {
  if (!viewBlock) return actionTable;
  if (period <= 0 || period % TICK_MS !== 0) return actionTable;

  const updated = produce(actionTable, (draft) => {
    const timeline = draft[armor]?.[part];
    if (!Array.isArray(timeline)) return;

    const startTime = Math.round(viewBlock.startTime / TICK_MS) * TICK_MS;
    const totalDuration = viewBlock.durationTime;
    const activeBlock = timeline[blockIndex];
    if (!activeBlock) return;
    const isLinear = activeBlock.linear === 1;

    let targetEndBlock = null;
    if (isLinear) {
      for (let i = blockIndex + 1; i < timeline.length; i++) {
        const p = timeline[i];
        if (!isBlack(p.color)) {
          targetEndBlock = p;
          break;
        }
      }
    }

    const blinkCount = Math.floor(totalDuration / period);
    const newPoints = [];

    for (let i = 0; i < blinkCount; i++) {
      const baseTime = startTime + i * period;
      let currentColor = { ...activeBlock.color };

      if (isLinear && targetEndBlock) {
        const f = (baseTime - activeBlock.time) / (targetEndBlock.time - activeBlock.time);
        currentColor = {
          R: Math.round(activeBlock.color.R * (1 - f) + targetEndBlock.color.R * f),
          G: Math.round(activeBlock.color.G * (1 - f) + targetEndBlock.color.G * f),
          B: Math.round(activeBlock.color.B * (1 - f) + targetEndBlock.color.B * f),
          A: (activeBlock.color.A ?? 1) * (1 - f) + (targetEndBlock.color.A ?? 1) * f,
        };
      }

      // 彩色點：對齊 TICK_MS
      newPoints.push({ time: baseTime, color: currentColor, linear: 0 });
      // 黑色緩衝：保留 BLACK_THRESHOLD 縫隙
      newPoints.push({
        time: baseTime + period - BLACK_THRESHOLD,
        color: { ...BLACK },
        linear: 0,
      });
    }

    timeline.splice(blockIndex, 1, ...newPoints);
    timeline.sort((a, b) => a.time - b.time);
  });

  return removeDuplicateBlackBlocks(updated);
}
