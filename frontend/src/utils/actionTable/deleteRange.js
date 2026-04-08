// 把選取區間整段塗黑（多選 delete）+ 連續黑點清理
//
// 來源：audioplayer.jsx `handleMultiDelete` (L771) + `removeDuplicateBlackBlocks` (L919)
// 行為等價。

import { produce } from 'immer';
import { BLACK, isBlack } from './constants.js';

/**
 * 清理連續或太接近的黑點（< 5ms 視為重複）
 * @internal
 */
export function removeDuplicateBlackBlocks(actionTable) {
  return produce(actionTable, (draft) => {
    Object.values(draft).forEach((armor) => {
      Object.keys(armor).forEach((partKey) => {
        const timeline = armor[partKey];
        if (!Array.isArray(timeline)) return;

        armor[partKey] = timeline.filter((block, index) => {
          if (!isBlack(block.color)) return true;
          const prev = timeline[index - 1];
          if (prev) {
            const prevIsBlack = isBlack(prev.color);
            if (prevIsBlack || Math.abs(block.time - prev.time) < 5) return false;
          }
          return true;
        });
      });
    });
  });
}

/**
 * 把多選範圍內的色塊塗黑（保留第一格改色為黑、刪掉中間多餘格）
 *
 * @param {*} actionTable
 * @param {Object} args
 * @param {Array<{armorIndex,partIndex,blockIndex}>} args.selections - 多選清單
 * @param {*} args.timelineBlocks - redux state.profiles.timelineBlocks（視覺色塊矩形資料）
 *                                  util 不訂閱 redux，由呼叫端傳入
 */
export function deleteRange(actionTable, { selections, timelineBlocks }) {
  // 依 (armor, part) 分組
  const groupedByPart = selections.reduce((acc, block) => {
    const key = `${block.armorIndex}-${block.partIndex}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(block.blockIndex);
    return acc;
  }, {});

  const updated = produce(actionTable, (draft) => {
    Object.keys(groupedByPart).forEach((key) => {
      const [armorIndexStr, partIndexStr] = key.split('-');
      const armorIndex = parseInt(armorIndexStr, 10);
      const partIndex = parseInt(partIndexStr, 10);
      const blockIndexes = groupedByPart[key];

      const minBlockIndex = Math.min(...blockIndexes);
      const maxBlockIndex = Math.max(...blockIndexes);

      const partTimelineFromView = timelineBlocks?.[armorIndex]?.[partIndex];
      const partTimelineFromActionTable = draft[armorIndex]?.[partIndex];
      if (!partTimelineFromView || !partTimelineFromActionTable) return;

      const firstTimelineBlock = partTimelineFromView[minBlockIndex];
      const lastTimelineBlock = partTimelineFromView[maxBlockIndex];
      if (!firstTimelineBlock || !lastTimelineBlock) return;

      const selectionStartTime = firstTimelineBlock.startTime;
      const selectionEndTime =
        lastTimelineBlock.startTime + lastTimelineBlock.durationTime;

      const startIndexToActionTable = partTimelineFromActionTable.findIndex(
        (entry) => entry.time === selectionStartTime
      );
      if (startIndexToActionTable === -1) return;

      partTimelineFromActionTable[startIndexToActionTable].color = { ...BLACK };
      partTimelineFromActionTable[startIndexToActionTable].linear = 0;

      let deleteStartIndex = startIndexToActionTable + 1;
      let deleteCount = 0;
      while (
        deleteStartIndex + deleteCount < partTimelineFromActionTable.length &&
        partTimelineFromActionTable[deleteStartIndex + deleteCount].time <
          selectionEndTime
      ) {
        deleteCount++;
      }
      if (deleteCount > 0) {
        partTimelineFromActionTable.splice(deleteStartIndex, deleteCount);
      }
    });
  });

  return removeDuplicateBlackBlocks(updated);
}
