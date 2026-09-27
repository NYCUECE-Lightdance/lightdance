import { DEFAULT_SEGMENT_MS, TICK_MS } from "../../constants/time.js";
import {
  clearRange,
  createId,
  findSegmentAt,
  floorToTick,
  insertSegment,
} from "./core.js";
import { blinkColorAt } from "./effects.js";
import { BLACK, cloneColor, lerpColor, sameColor } from "./rgba.js";

/**
 * 燈光 segment 的色彩層 —— `core.js` 之上的**唯一**認得顏色的地方。
 *
 * `core.js` 刻意不認得 payload（見那個檔案開頭的說明），所以「這段現在是什麼
 * 顏色」「放一個色塊下去」這類事情放在這裡。未來多軌音訊會有一個平行的
 * `audio.js`，共用同一份 `core.js`。
 *
 * ## 段內漸變的語意
 *
 * `linear === 1` 時，segment 在 `[start, end)` 內從 `colorStart` 線性插值到
 * `colorEnd`。這和舊 keyframe 模型「漸變到下一個關鍵格的顏色」是同一件事，
 * 差別是終點色現在**記在自己身上**，不必依賴鄰居 —— 於是拖曳一個色塊不會
 * 改變另一個色塊的外觀。
 *
 * ## 空隙就是熄滅
 *
 * 段與段之間沒有東西，代表 LED 關著。因此 `getColorAt` 在空隙回傳純黑，
 * 而不是「上一段的顏色」。
 */

/*
 * 顏色的基本運算住在 `rgba.js`（`effects.js` 也要用，放在共同的下層才不會
 * 變成循環相依）。這裡原樣 re-export，既有的 import 路徑不必改。
 */
export { BLACK, cloneColor, isBlackColor, lerpColor, sameColor } from "./rgba.js";

/**
 * 某個時間點該顯示什麼顏色。
 *
 * 落在空隙（或所有段之外）回傳純黑——空隙就是熄滅。
 * 落在漸變段內時回傳插值後的顏色，所以播放預覽直接用這個函式即可。
 */
export function getColorAt(segments, time) {
  const segment = findSegmentAt(segments ?? [], time);
  if (!segment) return { ...BLACK };

  /*
   * 頻閃是段上的 metadata，不是一堆小色塊（見 effects.js）。展開只發生在
   * 壓平輸出與這裡的預覽取色——而預覽是播放時每一格都會問一次的路徑，
   * 所以用 `blinkColorAt` 直接算相位，不要展開整條時間軸。
   */
  const blink = blinkColorAt(segment, time);
  if (blink !== undefined) return blink ?? { ...BLACK };

  if (segment.linear !== 1) return cloneColor(segment.colorStart);

  const span = segment.end - segment.start;
  if (span <= 0) return cloneColor(segment.colorStart);

  return lerpColor(
    segment.colorStart,
    segment.colorEnd,
    (time - segment.start) / span,
  );
}

/**
 * 建立一個純色 segment。
 *
 * 固定色的 `colorEnd` 與 `colorStart` 相同 —— 這樣切換成漸變時不需要另外
 * 補欄位，而且壓平回 keyframe 時的行為與固定色一致。
 */
export function createColorSegment({
  start,
  end,
  color,
  linear = 0,
  colorEnd,
  makeId = createId,
}) {
  const startColor = cloneColor(color);
  return {
    id: makeId(),
    start,
    end,
    colorStart: startColor,
    colorEnd: colorEnd ? cloneColor(colorEnd) : startColor,
    linear: linear === 1 ? 1 : 0,
  };
}

/**
 * 在時間軸上放一個色塊 —— 取代舊模型的 `insertColorKeyframes`。
 *
 * 舊版要判斷前後鄰居是不是黑色、決定要補幾個黑點（5 個分支）。segment 模型
 * 只做一件事：**在 `[start, start + length)` 放一個色塊**，撞到的舊色塊按
 * trim 策略裁掉（必要時 split 成前後兩段）。
 *
 * 「放固定長度」是拍板的設計（`DEFAULT_SEGMENT_MS`，見 todo.md）。舊模型
 * 沒有色塊長度的概念，放色會一路亮到下一個關鍵格，所以在空白處點一下可能
 * 亮好幾十秒；segment 模型給的是可預期的 1 秒，要更長用拖曳邊緣調整。
 *
 * @param {Array} segments - 該部位的 segment 陣列（不會被修改）
 * @param {object} params
 *   time: 插入時間（會向下對齊網格）；color: 顏色；
 *   length: 新色塊的長度，預設 DEFAULT_SEGMENT_MS；
 *   duration: 表演總長，用來夾住不要超出結尾；
 *   collision: "trim"（預設，覆蓋並裁掉舊的）或 "keep"（撞到舊色塊就縮短）
 * @returns {Array} 新陣列；沒有任何改變時回傳原陣列（呼叫端可用 reference 判斷）
 */
export function insertColorSegment(
  segments,
  {
    time,
    color,
    length = DEFAULT_SEGMENT_MS,
    duration,
    tick = TICK_MS,
    collision = "trim",
    makeId = createId,
  },
) {
  const list = segments ?? [];
  const start = floorToTick(time, tick);

  // 長度先取 length，再依表演結尾收斂。
  // 不要在這裡用 `Math.max(..., start + tick)` 去保證非零長度——那會讓
  // 「點在表演結束之後」硬生出一個超出 duration 的色塊。放不下就是放不下。
  const limit =
    duration !== undefined && duration > 0
      ? floorToTick(duration, tick)
      : Infinity;

  let end = Math.min(start + length, limit);

  if (collision === "keep") {
    // 不覆蓋既有色塊：撞到下一段就停在它的開頭
    const next = list.find((segment) => segment.start >= start);
    if (next) end = Math.min(end, next.start);
  }

  if (end <= start) return list; // 沒有空間可放

  // 同一個位置已經是同一個色塊了：原樣回傳，不佔一格 undo。
  // 沒有這道判斷的話，在同一點連按兩次會產生內容相同但 reference 不同的
  // 陣列，undo 需要多按一次才會回到使用者認得的狀態。
  const nextColor = cloneColor(color);
  const existing = findSegmentAt(list, start);
  if (
    existing &&
    existing.start === start &&
    existing.end === end &&
    existing.linear !== 1 &&
    sameColor(existing.colorStart, nextColor)
  ) {
    return list;
  }

  return insertSegment(
    list,
    createColorSegment({ start, end, color, makeId }),
    {
      makeId,
    },
  );
}

/**
 * 把一段時間範圍熄滅（等同舊模型的「塗黑」）。
 *
 * segment 模型不需要真的放黑色進去——把那段從資料裡拿掉就是熄滅。
 */
export function clearColorRange(
  segments,
  start,
  end,
  { makeId = createId } = {},
) {
  return clearRange(segments ?? [], start, end, { makeId });
}

/**
 * 在 `time` 把涵蓋它的 segment 切成兩段。
 *
 * 漸變段切開時，切點的插值顏色會成為前段的 `colorEnd` 與後段的 `colorStart`，
 * 兩段接起來的視覺結果與切之前完全相同。
 *
 * @returns {Array} 新陣列；切點不在任何段內、或正好落在邊界時回傳原陣列
 */
export function splitSegmentAt(segments, time, { makeId = createId } = {}) {
  const list = segments ?? [];
  const index = list.findIndex(
    (segment) => segment.start < time && segment.end > time,
  );
  if (index === -1) return list;

  const segment = list[index];
  const isLinear = segment.linear === 1;
  const middle = isLinear
    ? lerpColor(
        segment.colorStart,
        segment.colorEnd,
        (time - segment.start) / (segment.end - segment.start),
      )
    : cloneColor(segment.colorStart);

  const front = {
    ...segment,
    end: time,
    colorEnd: isLinear ? middle : segment.colorEnd,
  };
  const back = {
    ...segment,
    id: makeId(),
    start: time,
    colorStart: middle,
  };

  return [...list.slice(0, index), front, back, ...list.slice(index + 1)];
}
