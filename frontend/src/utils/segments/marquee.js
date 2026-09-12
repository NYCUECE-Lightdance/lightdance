/**
 * 框選 —— 用一個矩形選取跨軌的多個 segment。
 *
 * 這個檔案只做**幾何判斷**，不認得 DOM 也不認得 redux：呼叫端把「畫面上有哪些
 * 軌、每一軌佔哪一段像素高度、拉出來的矩形是哪一塊」交進來，這裡回傳碰到的
 * segment 清單。像素換算與事件處理留在元件裡（和 `gestures.js` 同一套分工）。
 *
 * ## 為什麼要框選
 *
 * 多段一起拖（`moveSegments`）早就做好了，但選取只能 `Shift+click` 一個一個點，
 * 而且**跨不了軌**——同一個樂句在七位舞者身上各有一段的時候，要一次搬得點十幾下。
 * 框選是那個功能價值的另一半。
 *
 * ## 相交而不是包含
 *
 * 矩形碰到 segment 的**任何一部分**就選中，不要求整段被框住。理由是實務：
 * 使用者想選的通常是「這一段時間裡的東西」，而色塊的長度不一——要求完全包住的話，
 * 一條特別長的色塊會逼使用者把框拉得比它還大，連帶掃到隔壁不想要的東西。
 *
 * 邊界用**嚴格不等式**：只碰到端點不算相交。segment 是半開區間 `[start, end)`，
 * 首尾相接的兩段共用一個時間點，若把「碰到」算成相交，在接縫上按一下（零寬度
 * 的框）會同時選中前後兩段。
 */

/** 兩個區間有沒有真的重疊（只碰到端點不算） */
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * 把兩個座標收成一個正規化的範圍。
 *
 * 框可以往任何方向拉——由右往左、由下往上都要成立，所以進來的兩個數字
 * 不保證誰大誰小。
 */
export const normalizeRange = (a, b) => ({
  min: Math.min(a, b),
  max: Math.max(a, b),
});

/**
 * 框選碰到的 segment。
 *
 * @param {Array} rows 畫面上的軌，每一筆 `{armorIndex, partIndex, segments, top, bottom}`
 *   （`top`/`bottom` 是這一軌在同一個座標系裡的像素上下緣）
 * @param {object} rect `{x1, x2, y1, y2}` 兩個對角，順序不拘
 * @param {function} timeAt 像素 x → 毫秒。由呼叫端提供，因為換算牽涉縮放與捲動
 * @returns {Array} `[{armorIndex, partIndex, segment}]`，依軌順序、再依時間排序
 */
export function segmentsInMarquee(rows, rect, timeAt) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const x = normalizeRange(rect.x1, rect.x2);
  const y = normalizeRange(rect.y1, rect.y2);
  const startTime = timeAt(x.min);
  const endTime = timeAt(x.max);

  const hits = [];
  for (const row of rows) {
    if (!overlaps(y.min, y.max, row.top, row.bottom)) continue;

    for (const segment of row.segments ?? []) {
      if (!overlaps(startTime, endTime, segment.start, segment.end)) continue;
      hits.push({
        armorIndex: row.armorIndex,
        partIndex: row.partIndex,
        segment,
      });
    }
  }
  return hits;
}

/**
 * 拉得夠遠才算框選。
 *
 * 少了這道判斷，任何一次「在空白處點一下取消選取」都會被當成一個零寬度的框，
 * 而點擊時滑鼠幾乎一定會晃個一兩像素。門檻取 4px：比手抖大，比任何有意的
 * 拖曳小。
 */
export const MARQUEE_MIN_PX = 4;

export const isMarquee = (rect, threshold = MARQUEE_MIN_PX) =>
  Math.abs(rect.x2 - rect.x1) >= threshold ||
  Math.abs(rect.y2 - rect.y1) >= threshold;
