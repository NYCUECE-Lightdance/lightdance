/**
 * 選取項目的形狀與查詢 —— **全專案唯一的定義處**。
 *
 * `multiSelectedBlocks` 裡的每一筆長這樣：
 *
 * ```js
 * { armorIndex, partIndex, segmentId }
 * ```
 *
 * ## 為什麼是 id 而不是索引
 *
 * 這裡曾經還帶著一個 `blockIndex`（色塊在 keyframe 陣列裡的位置），Phase 5g
 * 隨最後一個消費者一起刪掉了。索引會位移：Phase 4 期間連續踩到三次同一類
 * bug——`blockIndex + 2` 假設中間一定有黑哨兵、亮度階梯用 stride 2 找下一個
 * 色塊、剪下後選取落在隔壁色塊——根因都是「用位置當識別」。色塊被切開或鄰居
 * 被刪除時，索引指向的東西就換人了，而且不會報錯，只是靜默選錯。
 *
 * id 沒有這個問題：找不到就是找不到（回傳 null），可以明確處理。
 */

/**
 * 建立一筆選取項目。
 *
 * @param {object} params
 *   armorIndex / partIndex: 位置；segment: 被選中的 segment（要有 id）
 */
export const makeSelection = ({ armorIndex, partIndex, segment }) => ({
  armorIndex,
  partIndex,
  segmentId: segment?.id ?? null,
});

/** 以 id 找出 segment；找不到回傳 null（呼叫端必須處理這個情況） */
export const findSegmentById = (segments, segmentId) => {
  if (!segmentId || !Array.isArray(segments)) return null;
  return segments.find((segment) => segment.id === segmentId) ?? null;
};

/** 兩筆選取是否指向同一個色塊 */
export const isSameSelection = (a, b) =>
  !!a &&
  !!b &&
  a.armorIndex === b.armorIndex &&
  a.partIndex === b.partIndex &&
  a.segmentId === b.segmentId;

/** 這筆選取是不是落在指定的部位上 */
export const isSelectionOnPart = (selection, armorIndex, partIndex) =>
  !!selection &&
  selection.armorIndex === armorIndex &&
  selection.partIndex === partIndex;

/**
 * 選取清單中落在指定部位上的 segmentId 集合。
 *
 * 渲染時要逐 block 判斷「我被選中了嗎」，用 Set 才不會變成 O(blocks × selections)。
 */
export const selectedIdsOnPart = (selections, armorIndex, partIndex) => {
  const ids = new Set();
  if (!Array.isArray(selections)) return ids;

  for (const selection of selections) {
    if (
      isSelectionOnPart(selection, armorIndex, partIndex) &&
      selection.segmentId
    ) {
      ids.add(selection.segmentId);
    }
  }
  return ids;
};

/**
 * 把選取依部位分組 —— **跨軌操作的入口**。
 *
 * 框選做出來之後，`multiSelectedBlocks` 裡的項目可以來自不同的時間軸
 * （一次選到七位舞者身上的同一個樂句）。但光表是 `table[armor][part]`，
 * 每一條要各自算、各自寫回，所以每個跨軌的操作第一件事都是分組。
 *
 * 先前這段迴圈在 `deleteSelected` 與 `applyColorToSelection` 裡各手寫了一遍，
 * 而其他八個操作根本沒寫——它們只看 `multiSelectedBlocks[0]`，選了七條只有
 * 一條會動，**而且不會報錯**。
 *
 * 順序**跟著選取的順序**（不排序）：第一組就是使用者最先點到的那一條，
 * 貼上與拖曳都拿它當錨點。
 *
 * ⚠️ **`segmentId` 是 `null` 的選取要保留成一個空集合的組。** 這份清單同時
 * 表達兩件事：「選了哪些色塊」與「目前在編哪一條軌」——點了軌道但還沒點到
 * 任何色塊時，`makeSelection` 產生的就是 `segmentId: null`。把它濾掉的話
 * 「在播放頭放一個最愛色」與「跳到下一個時間點」會變成什麼都不做，
 * 因為它們要的是**部位**而不是色塊。
 *
 * @returns {Array<{armorIndex, partIndex, segmentIds: Set<string>}>}
 */
export const groupSelectionsByPart = (selections) => {
  if (!Array.isArray(selections)) return [];

  const byPart = new Map();
  for (const selection of selections) {
    if (!selection) continue;
    const { armorIndex, partIndex } = selection;
    const key = `${armorIndex}-${partIndex}`;

    if (!byPart.has(key)) {
      byPart.set(key, { armorIndex, partIndex, segmentIds: new Set() });
    }
    if (selection.segmentId) {
      byPart.get(key).segmentIds.add(selection.segmentId);
    }
  }

  return [...byPart.values()];
};

/**
 * 把選取解析成真正的 segment 物件，順便濾掉已經不存在的（例如被 undo 掉）。
 *
 * ⚠️ **`segments` 是單一部位的**，所以這個函式只認得落在那個部位上的選取。
 * 跨軌的操作請走 `groupSelectionsByPart` + `utils/segments/table.js`，
 * 不要拿第一筆選取的部位當「大家的部位」——那正是跨軌操作原本壞掉的方式。
 *
 * @returns {Array} `[{selection, segment}]`，依 segment 起始時間排序
 */
export const resolveSelections = (selections, segments) => {
  if (!Array.isArray(selections)) return [];

  return selections
    .map((selection) => ({
      selection,
      segment: findSegmentById(segments, selection.segmentId),
    }))
    .filter((entry) => entry.segment !== null)
    .sort((a, b) => a.segment.start - b.segment.start);
};

