// 漸變效果 — 在選中色塊範圍內生成 colorStart → colorEnd 的線性漸變序列
//
// ⚠️ 規格已重設計（B6 決策 2026-04-07）：
//   原版 audioplayer.jsx `applyGradientEffect` 用「每隔 2 格 = (色, 黑) 配對」
//   的奇怪假設，且只接受 startBrightness/interval/endBrightness（操作 alpha）。
//
//   新規格：使用者直接指定首尾顏色，預設取「前後最近非黑色塊」的顏色。
//   透過在區間內以 TICK_MS 為步長產生 keyframe + linear=1 來表達。
//
//   如果使用者沒指定 startColor / endColor，呼叫端應從 timeline 算出預設值後傳入。

import { produce } from 'immer';
import { TICK_MS, BLACK, isBlack } from './constants.js';
import { removeDuplicateBlackBlocks } from './deleteRange.js';

/**
 * 從 timeline 推測前後最近的非黑色塊顏色，作為漸變預設首尾色
 *
 * @param {Array} timeline
 * @param {number} blockIndex - 起點 keyframe 索引
 * @returns {{startColor, endColor}} - 找不到時 fallback 為 BLACK
 */
export function inferGradientColors(timeline, blockIndex) {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { startColor: { ...BLACK }, endColor: { ...BLACK } };
  }

  // 起點：optimistically 用 blockIndex 自己；若它是黑就往前找最近非黑
  let startColor = timeline[blockIndex]?.color;
  if (!startColor || isBlack(startColor)) {
    for (let i = blockIndex - 1; i >= 0; i--) {
      if (!isBlack(timeline[i].color)) {
        startColor = timeline[i].color;
        break;
      }
    }
  }
  // 終點：往後找下一個非黑（且不是 startColor 自己那格）
  let endColor = null;
  for (let i = blockIndex + 1; i < timeline.length; i++) {
    if (!isBlack(timeline[i].color)) {
      endColor = timeline[i].color;
      break;
    }
  }

  return {
    startColor: startColor ? { ...startColor } : { ...BLACK },
    endColor: endColor ? { ...endColor } : { ...BLACK },
  };
}

/**
 * 在 [viewBlock.startTime, viewBlock.startTime + viewBlock.durationTime] 區間內
 * 產生 startColor → endColor 的漸變
 *
 * @param {*} actionTable
 * @param {Object} args
 * @param {number} args.armor
 * @param {number} args.part
 * @param {number} args.blockIndex
 * @param {{R,G,B,A}} args.startColor
 * @param {{R,G,B,A}} args.endColor
 * @param {{startTime,durationTime}} args.viewBlock
 */
export function applyGradient(actionTable, {
  armor,
  part,
  blockIndex,
  startColor,
  endColor,
  viewBlock,
}) {
  if (!viewBlock || !startColor || !endColor) return actionTable;

  const updated = produce(actionTable, (draft) => {
    const timeline = draft[armor]?.[part];
    if (!Array.isArray(timeline)) return;

    const startTime = Math.round(viewBlock.startTime / TICK_MS) * TICK_MS;
    const endTime = startTime + viewBlock.durationTime;
    if (endTime <= startTime) return;

    // 用兩個 keyframe + linear=1 表達漸變（最簡形式）
    // 重構成 segment 後這就是一個 segment 的 colorStart/colorEnd
    const startEntry = {
      time: startTime,
      color: { ...startColor },
      linear: 1,
    };
    const endEntry = {
      time: endTime,
      color: { ...endColor },
      linear: 0,
    };

    timeline.splice(blockIndex, 1, startEntry, endEntry);
    timeline.sort((a, b) => a.time - b.time);
  });

  return removeDuplicateBlackBlocks(updated);
}
