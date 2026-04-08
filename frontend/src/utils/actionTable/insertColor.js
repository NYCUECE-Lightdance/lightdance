// 在指定 (armor, part, time) 插入一個顏色 keyframe
//
// 來源：合併原 Armor.jsx `insertArray`（L92）與 audioplayer.jsx
//       `insertFavoriteColorArray`（L544）兩份重複實作。行為等價。
//
// 為什麼有 5 個分支：
//   keyframe 模型沒有顯式色塊邊界，靠「鄰居黑色斷點」表達色塊範圍。
//   插入新色時必須根據「前/後鄰居是否黑色」決定要不要塞額外的黑點：
//     - 前後皆黑：自由插入，不用補
//     - 前黑後彩：在新色之後 -10ms 補黑，避免漸變到後鄰居
//     - 前彩後黑：在新色之前 -10ms 補黑，避免被前鄰居覆蓋
//     - 前後皆彩：兩側都補黑（夾住新色塊）
//     - indexToCopy === 0（最前面）：在 duration 處補終止黑點
//
// ⚠️ Phase 4 segment 重構後，這個檔會被 `insertSegment(start, end, color)` 取代。
//    那時整個 5 分支邏輯會壓縮到 ~15 行，且不再需要 BLACK_THRESHOLD。

import { binarySearchFirstGreater } from './search.js';
import { BLACK_THRESHOLD, TICK_MS, BLACK, isBlack, makeBlackEntry } from './constants.js';

// 在空 timeline 或最前面插入色塊時，預設色塊長度。
// 過去用整首音樂長度，造成新插入的色塊一插就吃滿整首歌。
const DEFAULT_SEGMENT_MS = 5000;
const endBlackTime = (nowTime, duration) =>
  Math.min(nowTime + DEFAULT_SEGMENT_MS, duration);

/**
 * @param {*} actionTable - 完整 actionTable（陣列或物件形式皆可）
 * @param {Object} args
 * @param {number} args.armor    - 舞者索引
 * @param {number} args.part     - 部位索引
 * @param {number} args.time     - 使用者要插入的時間（會被對齊到 TICK_MS 網格）
 * @param {{R,G,B,A}} args.color - 要插入的顏色
 * @param {number} args.duration - 音樂總長度，作為「最前面插入」時的終止黑點時間
 * @returns {{ table: *, alignedTime: number }}
 *   table        — 新的 actionTable
 *   alignedTime  — 對齊 TICK_MS 後的實際插入時間，呼叫端可拿來 dispatch updateCurrentTime
 */
export function insertColor(actionTable, { armor, part, time, color, duration }) {
  const nowTime = Math.floor(time / TICK_MS) * TICK_MS;
  const partData = actionTable?.[armor]?.[part] || [];
  const indexToCopy = binarySearchFirstGreater(partData, time);

  // 注意：原碼用 `actionTable.map((player, playerIndex) => ...)`，假設 actionTable 是
  // 陣列。Armor.jsx 用 Object.entries / Object.fromEntries 處理 object 形式。
  // 這裡兼容兩種：用 Object.keys 走訪後重建。
  const isArray = Array.isArray(actionTable);
  const keys = isArray ? actionTable.map((_, i) => i) : Object.keys(actionTable);

  const updatedPairs = keys.map((rawKey) => {
    const playerIndex = isArray ? rawKey : Number(rawKey);
    const player = actionTable[rawKey];
    if (playerIndex !== armor) return [rawKey, player];

    const updatedPlayer = { ...player };
    let updatedPartData = [...(player[part] || [])];

    const newEntry = {
      time: nowTime,
      color: { ...color },
      linear: 0,
    };

    const nextElement = updatedPartData[indexToCopy];
    const previousElement =
      updatedPartData[indexToCopy - 1] || updatedPartData[indexToCopy];

    const isNextBlack = !nextElement || isBlack(nextElement.color);
    const isPreviousBlack = !previousElement || isBlack(previousElement.color);

    const existingIndex = updatedPartData.findIndex((e) => e.time === nowTime);

    if (nowTime - BLACK_THRESHOLD <= 0) {
      // 太靠近 0，不能在前面補黑
      updatedPartData.splice(indexToCopy + 1, 0, newEntry);
    } else if (existingIndex !== -1) {
      // 同時間已存在 → 直接覆寫顏色
      updatedPartData = updatedPartData.map((entry, i) =>
        i === existingIndex ? { ...entry, color: { ...color } } : entry
      );
    } else if (indexToCopy === 0) {
      // 全空 / 插在最前面 → 後面補一個 duration 處的終止黑
      updatedPartData.splice(partData.length, 0, newEntry, makeBlackEntry(endBlackTime(nowTime, duration)));
    } else if (!isPreviousBlack && isNextBlack) {
      updatedPartData.splice(
        indexToCopy + 1,
        0,
        makeBlackEntry(nowTime - BLACK_THRESHOLD),
        newEntry
      );
    } else if (!isPreviousBlack && !isNextBlack) {
      updatedPartData.splice(
        indexToCopy + 1,
        0,
        makeBlackEntry(nowTime - BLACK_THRESHOLD),
        newEntry,
        makeBlackEntry(nextElement?.time - BLACK_THRESHOLD || nowTime + BLACK_THRESHOLD)
      );
    } else if (isPreviousBlack && !isNextBlack) {
      updatedPartData.splice(
        indexToCopy + 1,
        0,
        newEntry,
        makeBlackEntry(nextElement?.time - BLACK_THRESHOLD || nowTime + BLACK_THRESHOLD)
      );
    } else if (isPreviousBlack && isNextBlack) {
      updatedPartData.splice(partData.length, 0, newEntry);
    } else {
      updatedPartData.splice(indexToCopy + 1, 0, newEntry, makeBlackEntry(endBlackTime(nowTime, duration)));
    }

    updatedPartData.sort((a, b) => a.time - b.time);
    updatedPlayer[part] = updatedPartData;
    return [rawKey, updatedPlayer];
  });

  const newTable = isArray
    ? updatedPairs.map(([, p]) => p)
    : Object.fromEntries(updatedPairs);

  return { table: newTable, alignedTime: nowTime };
}
