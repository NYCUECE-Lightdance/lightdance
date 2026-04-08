// 把選中色塊在 currentTime 處「切」成兩段
//
// 來源：audioplayer.jsx `handleCut` (L1074)。行為等價。
//
// 流程：
//   1. 在 currentTime 前 BLACK_THRESHOLD 處插入一個黑點（前段的終止）
//   2. 在 currentTime 處插入新色塊起點
//   3. 若原色塊是 linear 漸變，新色塊起點的顏色用插值算出，且 linear 標記延續

import { produce } from 'immer';
import { BLACK_THRESHOLD, BLACK } from './constants.js';

export function cutAt(actionTable, { armor, part, blockIndex, currentTime }) {
  return produce(actionTable, (draft) => {
    const timeline = draft[armor]?.[part];
    const originalBlock = timeline?.[blockIndex];
    const nextBlock = timeline?.[blockIndex + 1];

    if (!originalBlock || !nextBlock) return;
    if (currentTime <= originalBlock.time || currentTime >= nextBlock.time) return;

    let newBlockColor = originalBlock.color;
    const isOriginalLinear = originalBlock.linear === 1;

    if (isOriginalLinear) {
      const gradientTargetBlock = timeline[blockIndex + 2];
      const startColor = originalBlock.color;
      const endColor = gradientTargetBlock?.color || { ...BLACK };
      const startTime = originalBlock.time;
      const endTime = nextBlock.time;

      if (endTime > startTime) {
        const ratio = (currentTime - startTime) / (endTime - startTime);
        newBlockColor = {
          R: Math.round(startColor.R * (1 - ratio) + endColor.R * ratio),
          G: Math.round(startColor.G * (1 - ratio) + endColor.G * ratio),
          B: Math.round(startColor.B * (1 - ratio) + endColor.B * ratio),
          A: (startColor.A ?? 1) * (1 - ratio) + (endColor.A ?? 1) * ratio,
        };
      }
      originalBlock.linear = 1;
    }

    const newBlackBlock = {
      time: currentTime - BLACK_THRESHOLD,
      color: { ...BLACK },
      linear: 0,
    };
    const newBlock = {
      time: currentTime,
      color: newBlockColor,
      linear: isOriginalLinear ? 1 : 0,
    };

    timeline.splice(blockIndex + 1, 0, newBlackBlock, newBlock);
    timeline.sort((a, b) => a.time - b.time);
  });
}
