import { TICK_MS } from "../../constants/time.js";
import { createId } from "./core.js";
import { cloneColor, lerpColor } from "./rgba.js";

/**
 * 段上的效果 metadata —— 目前只有頻閃。
 *
 * ```js
 * { id, start, end, colorStart, colorEnd, linear, effect: { type: "blink", period } }
 * ```
 *
 * ## 為什麼是 metadata 而不是一堆小色塊
 *
 * 舊版的頻閃是**破壞性**的：套下去之後那個色塊就被換成 N 個 250ms 的小色塊，
 * 於是
 *
 * - 想整段往後挪半拍，得把 N 個小塊全部選起來（而且它們之間有空隙，
 *   `Shift+click` 連選會斷掉）
 * - 想把間隔從 250 改成 200，只能全部刪掉重放一次
 * - 想改顏色，得逐塊改
 * - undo 一次只退一格，但套用產生的是**一次** dispatch，所以退得掉——
 *   真正的問題是套完之後那個「一段有頻閃的區間」在資料上已經不存在了
 *
 * 改成 metadata 之後，畫面上還是一個可拖曳、可 resize、可改色的色塊，
 * 展開只發生在兩個地方：**壓平成韌體格式**與**播放預覽取色**。
 *
 * ## 展開的語意（和舊版逐格相同）
 *
 * 一個週期 = 亮 `period - TICK_MS`、熄滅一格。第 i 個脈衝是
 * `[start + i*period, start + i*period + period - TICK_MS)`，只產生**完整**的
 * 週期（`floor(span / period)` 個），尾巴不足一個週期的部分維持熄滅。
 *
 * 原本的色塊若是漸變，每個脈衝取**該脈衝起點**在漸變曲線上的顏色（脈衝內部
 * 是固定色）。這樣「一邊漸變一邊閃」看起來仍然連續。
 */

export const BLINK = "blink";

/** 一個週期至少要兩格：一格亮、一格滅。只有一格的話等於整段熄滅 */
export const MIN_BLINK_PERIOD_MS = TICK_MS * 2;

/** 建立頻閃 metadata；不合法的週期回傳 null，呼叫端自己決定要不要報錯 */
export const makeBlink = (periodInput, tick = TICK_MS) => {
  const period = parseInt(periodInput, 10);
  if (!Number.isFinite(period)) return null;
  if (period % tick !== 0) return null;
  if (period < tick * 2) return null;
  return { type: BLINK, period };
};

/** 這一段的頻閃週期；沒有頻閃回傳 null */
export const blinkPeriodOf = (segment) =>
  segment?.effect?.type === BLINK ? segment.effect.period : null;

/** 這一段裝得下幾個完整的頻閃週期 */
export const blinkPulseCount = (segment) => {
  const period = blinkPeriodOf(segment);
  if (!period) return 0;
  return Math.floor((segment.end - segment.start) / period);
};

/** 拿掉效果，回傳純色塊；本來就沒有效果時回傳原物件 */
export const withoutEffect = (segment) => {
  if (!segment?.effect) return segment;
  const { effect, ...rest } = segment;
  return rest;
};

/** 第 i 個脈衝該是什麼顏色（漸變段取脈衝起點在曲線上的值） */
const pulseColor = (segment, pulseStart) => {
  if (segment.linear !== 1) return cloneColor(segment.colorStart);
  const span = segment.end - segment.start;
  if (span <= 0) return cloneColor(segment.colorStart);
  return lerpColor(
    segment.colorStart,
    segment.colorEnd,
    (pulseStart - segment.start) / span,
  );
};

/**
 * 把一個帶頻閃的段展開成一串固定色的脈衝。
 *
 * 沒有頻閃、或裝不下一個完整週期時回傳 `[segment]`（原物件），
 * 呼叫端可以用 reference 判斷有沒有東西被展開。
 *
 * `openEnded`（v1 資料「一路亮到最後」的標記）不會傳給脈衝——脈衝一定在段的
 * 結尾之前就熄滅了，帶著那個旗標會讓壓平時少發一個熄滅點。編輯器產生的頻閃
 * 不會有 openEnded，這只是防禦。
 */
export function expandBlink(segment, { tick = TICK_MS, makeId = createId } = {}) {
  const period = blinkPeriodOf(segment);
  if (!period) return [segment];

  const count = Math.floor((segment.end - segment.start) / period);
  if (count < 1) return [segment];

  const pulses = [];
  for (let i = 0; i < count; i++) {
    const start = segment.start + i * period;
    const color = pulseColor(segment, start);
    pulses.push({
      id: i === 0 ? segment.id : makeId(),
      start,
      end: start + period - tick, // 最後一格留給空隙 = 熄滅
      colorStart: color,
      colorEnd: cloneColor(color),
      linear: 0,
    });
  }
  return pulses;
}

/**
 * 展開整條時間軸上的所有效果。
 *
 * 沒有任何效果時回傳**原陣列**——壓平路徑對每個部位都會呼叫一次，
 * 而絕大多數部位沒有頻閃，不該為此配置新陣列。
 */
export function expandEffects(segments, options = {}) {
  if (!Array.isArray(segments)) return segments;
  if (!segments.some((segment) => blinkPeriodOf(segment))) return segments;

  const out = [];
  for (const segment of segments) out.push(...expandBlink(segment, options));
  return out;
}

/**
 * 頻閃段在某個時間點的顏色。
 *
 * 給預覽用，不展開整條時間軸——播放時每一格都會問一次，展開會在每一幀
 * 配置 N 個物件。落在熄滅的那一格、或落在尾巴不足一個週期的部分時回傳 null，
 * 呼叫端當成「這裡是暗的」。
 */
export function blinkColorAt(segment, time, tick = TICK_MS) {
  const period = blinkPeriodOf(segment);
  if (!period) return undefined; // 不是頻閃段，呼叫端走原本的邏輯

  const offset = time - segment.start;
  if (offset < 0) return null;

  const index = Math.floor(offset / period);
  if (index >= Math.floor((segment.end - segment.start) / period)) return null;

  const within = offset - index * period;
  if (within >= period - tick) return null; // 熄滅的那一格

  return pulseColor(segment, segment.start + index * period);
}
