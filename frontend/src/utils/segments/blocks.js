/**
 * segments → 時間軸上的視覺色塊。
 *
 * 這裡把「有色的 segment」與「segment 之間的空隙」統一鋪成一條首尾相接、
 * 涵蓋 `[0, duration)` 的序列。
 *
 * ⚠️ **空隙 block 現在的理由是命中判定，不是排版。** 舊版 Timeline 用 flex
 * 百分比寬度排版，色塊的位置來自前面每一塊的寬度總和，所以中間少一塊就會
 * 讓後面全部往前擠、和紅線對不上——空隙是被排版**逼出來**的。色塊改成絕對
 * 定位之後那個理由沒了，但空隙**還是不能拿掉**：框選要能認出「這裡按下去
 * 是空白處」（`data-gap="true"`），而時間軸上沒有真正的空洞可以按。
 *
 * ## 為什麼 block 要帶 segmentId
 *
 * 舊模型是反過來做的：先有一堆關鍵格算出 block，再用 `block.startTime`
 * 回頭去 keyframe 陣列裡 `findIndex` 出「這個 block 是哪一格」，而且要
 * 額外排除黑點（同一時間可能同時有黑點與彩色點）。那個反查散在
 * Timeline 的 5 個地方，也是 Phase 4 連續踩到三次索引錯位的來源。
 *
 * segment 模型直接把 id 帶在 block 上，反查完全消失。
 *
 * ## `segmentId === null` 就是空隙
 *
 * 「這個 block 可以被選取/拖曳嗎」以前是問「它是不是純黑色」——但使用者
 * 本來就可以放一個很暗的色塊，語意是混的。現在改問 `segmentId != null`：
 * 有 id 就是真的色塊，沒有就是熄滅的空隙。
 */

import { blinkPeriodOf } from "./effects.js";

const BLACK = Object.freeze({ R: 0, G: 0, B: 0, A: 1 });

/** 空隙 block：畫面上是黑的，但它不是資料，不能被選取 */
const makeGap = (startTime, durationTime) => ({
  segmentId: null,
  startTime,
  durationTime,
  color: { ...BLACK },
  colorEnd: { ...BLACK },
  linear: 0,
});

/**
 * @param {Array} segments - 已符合不變式的 segment 陣列
 * @param {number} duration - 表演總長（ms）
 * @returns {Array} `[{segmentId, startTime, durationTime, color, colorEnd, linear, blinkPeriod}]`
 *   依時間排序、首尾相接、涵蓋 `[0, duration)`
 */
export function buildTimelineBlocks(segments, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const list = Array.isArray(segments) ? segments : [];
  const blocks = [];
  let cursor = 0;

  for (const segment of list) {
    // 超出表演長度的 segment 直接忽略：留著會算出負的寬度，
    // flex 會把整條時間軸等比壓縮，造成與紅線的視覺偏移
    if (segment.start >= duration) break;

    if (segment.start > cursor) {
      blocks.push(makeGap(cursor, segment.start - cursor));
    }

    const end = Math.min(segment.end, duration);
    if (end > segment.start) {
      blocks.push({
        segmentId: segment.id,
        startTime: segment.start,
        durationTime: end - segment.start,
        color: segment.colorStart,
        colorEnd: segment.colorEnd,
        linear: segment.linear === 1 ? 1 : 0,
        // 頻閃是段上的 metadata，畫面上仍然是一個色塊——這裡只把週期帶出來
        // 讓 Timeline 畫一個角標，不展開成一堆小 block（見 effects.js）
        blinkPeriod: blinkPeriodOf(segment),
      });
      cursor = end;
    }
  }

  if (cursor < duration) {
    blocks.push(makeGap(cursor, duration - cursor));
  }

  return blocks;
}

export default buildTimelineBlocks;
