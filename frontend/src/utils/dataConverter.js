/**
 * 數據格式轉換工具
 *
 * 舊格式 (後端/存檔): { time, color, linear }
 * 新格式 (前端): { startTime, endTime, color, linear }
 */

/**
 * 將舊格式轉換為新格式
 * @param {Array} oldFormatTimeline - 舊格式的時間軸數據
 * @param {number} duration - 音頻總長度
 * @returns {Array} 新格式的時間軸數據
 */
export function convertOldToNew(oldFormatTimeline, duration) {
  if (!oldFormatTimeline || oldFormatTimeline.length === 0) {
    return [];
  }

  const newFormatTimeline = [];

  oldFormatTimeline.forEach((block, index) => {
    // 跳過 empty 標記的色塊
    if (block.empty) {
      console.log(`[Convert] Skipping empty block at ${block.time}ms`);
      return;
    }

    const startTime = block.time;
    // 計算結束時間: 下一個色塊的開始時間,或音頻總長度
    const nextBlock = oldFormatTimeline[index + 1];
    const endTime = nextBlock ? nextBlock.time : duration;

    newFormatTimeline.push({
      startTime,
      endTime,
      color: block.color,
      linear: block.linear || 0,
    });
  });

  console.log(`[Convert] Old→New: ${oldFormatTimeline.length} → ${newFormatTimeline.length} blocks`);
  return newFormatTimeline;
}

/**
 * 將新格式轉換為舊格式 (用於保存)
 * @param {Array} newFormatTimeline - 新格式的時間軸數據
 * @param {number} duration - 音頻總長度
 * @returns {Array} 舊格式的時間軸數據
 */
export function convertNewToOld(newFormatTimeline, duration) {
  if (!newFormatTimeline || newFormatTimeline.length === 0) {
    return [];
  }

  const oldFormatTimeline = [];

  // 先按 startTime 排序
  const sortedBlocks = [...newFormatTimeline].sort((a, b) => a.startTime - b.startTime);

  sortedBlocks.forEach((block, index) => {
    // 添加色塊本身
    oldFormatTimeline.push({
      time: block.startTime,
      color: block.color,
      linear: block.linear || 0,
    });

    // 檢查是否有空白間隔
    const nextBlock = sortedBlocks[index + 1];
    const currentEndTime = block.endTime;
    const nextStartTime = nextBlock ? nextBlock.startTime : duration;

    // 如果當前色塊的結束時間 < 下一個色塊的開始時間,表示有空白
    if (currentEndTime < nextStartTime) {
      console.log(`[Convert] Gap detected: ${currentEndTime}ms - ${nextStartTime}ms, inserting empty block`);

      // 插入空白標記 (黑色 + empty 標籤)
      oldFormatTimeline.push({
        time: currentEndTime,
        color: { R: 0, G: 0, B: 0, A: 0 },
        empty: true,
      });
    }
  });

  console.log(`[Convert] New→Old: ${newFormatTimeline.length} → ${oldFormatTimeline.length} blocks (with gaps)`);
  return oldFormatTimeline;
}

/**
 * 轉換整個 actionTable (舊→新)
 * @param {Array} oldActionTable - 舊格式的 actionTable
 * @param {number} duration - 音頻總長度
 * @returns {Array} 新格式的 actionTable
 */
export function convertActionTableOldToNew(oldActionTable, duration) {
  return oldActionTable.map((player) => {
    const newPlayer = {};
    Object.keys(player).forEach((partIndex) => {
      newPlayer[partIndex] = convertOldToNew(player[partIndex], duration);
    });
    return newPlayer;
  });
}

/**
 * 轉換整個 actionTable (新→舊)
 * @param {Array} newActionTable - 新格式的 actionTable
 * @param {number} duration - 音頻總長度
 * @returns {Array} 舊格式的 actionTable
 */
export function convertActionTableNewToOld(newActionTable, duration) {
  return newActionTable.map((player) => {
    const oldPlayer = {};
    Object.keys(player).forEach((partIndex) => {
      oldPlayer[partIndex] = convertNewToOld(player[partIndex], duration);
    });
    return oldPlayer;
  });
}
