/**
 * 對齊與分佈 —— 選取的色塊之間的幾何整理。
 *
 * 從向量繪圖工具借來的三個動作，在 segment 模型上都很短：
 *
 * | 動作 | 做什麼 | 常見情境 |
 * |---|---|---|
 * | 起點對齊 | 每一段搬到同一個起點，長度不變 | 七位舞者的同一個樂句手放得參差不齊 |
 * | 長度統一 | 每一段保持起點，長度換成基準值 | 一組閃光有的 300ms 有的 350ms |
 * | 平均分佈 | 保留頭尾，中間的平均攤開 | 一串遞進的色塊間距不均 |
 *
 * ## 為什麼要有這一層
 *
 * 這三件事用拖曳都做得到，但**做不準**：拖曳吃 50ms 的網格，肉眼對齊七條軌
 * 的起點要一條一條放大再微調，而且下次改動又跑掉。它們是純幾何運算，交給
 * 程式做剛好。
 *
 * ## 落點的碰撞規則與貼上一致
 *
 * 算出新位置之後，那一條軌上**沒被選到**的內容照 `clearRange` 讓位（與貼上、
 * 換軌拖曳同一套）。這樣「把東西放到某個位置」在整個編輯器裡只有一種語意。
 *
 * ⚠️ 但**被選到的段彼此重疊時整條放棄**，不是讓後者蓋掉前者。
 * 兩段選取重疊代表使用者的意圖本身有歧義（同一條軌上兩段對齊到同一個起點，
 * 要留哪一段？），而靜靜吃掉一段是這個專案最想避免的那種錯——畫面上只是
 * 「怎麼少了一塊」。回報哪幾條沒做，讓呼叫端說得出來。
 */
import { clearRange, roundToTick } from "./core.js";

/**
 * 把一條軌上算好的新位置寫回去。
 *
 * @param {Array} segments 這條軌原本的內容
 * @param {Set<string>} ids 被選到的段
 * @param {Map<string, {start:number, end:number}>} placed 新位置
 * @returns {Array|null} 新內容；被選到的段彼此重疊時回傳 null（整條放棄）
 */
function rebuild(segments, ids, placed) {
  const moved = [];
  // 每一段都停在原地時要回傳**原陣列**：呼叫端與 `updateParts` 都用 reference
  // 判斷「這條有沒有變」，少了這道判斷，一次沒有效果的對齊照樣佔一格 undo、
  // 也照樣把那條軌的訂閱者全部喚醒
  let changed = false;

  for (const segment of segments) {
    if (!ids.has(segment.id)) continue;
    const next = placed.get(segment.id);
    if (!next) return null;

    /*
     * 對齊網格是在**這裡**做的，不是在各個 place 裡。
     *
     * `start % TICK_MS === 0` 是 segment 的不變式，而平均分佈算出來的步長
     * 幾乎不會是 50 的倍數。收在同一個出口，三個動作就不必各自記得，
     * 而且下面的重疊檢查看到的是**取整之後**的位置——先檢查再取整的話，
     * 取整可能把兩段推成重疊，而檢查已經過了。
     */
    const start = roundToTick(next.start);
    const end = roundToTick(next.end);
    if (end <= start || start < 0) return null;
    if (start !== segment.start || end !== segment.end) changed = true;
    moved.push({ ...segment, start, end });
  }
  if (moved.length === 0 || !changed) return segments;

  moved.sort((a, b) => a.start - b.start);
  for (let i = 1; i < moved.length; i++) {
    // 選取彼此重疊 = 意圖有歧義，整條放棄而不是讓後者蓋掉前者
    if (moved[i].start < moved[i - 1].end) return null;
  }

  // 未選取的內容照讓位規則被裁掉，與貼上一致
  let rest = segments.filter((segment) => !ids.has(segment.id));
  for (const segment of moved) {
    rest = clearRange(rest, segment.start, segment.end);
  }

  return [...rest, ...moved].sort((a, b) => a.start - b.start);
}

/** 逐條套用 `place`，收集結果與放棄的那幾條 */
function arrange(groups, place) {
  const updates = [];
  const skipped = [];

  for (const group of groups) {
    const { armorIndex, partIndex, segments, segmentIds } = group;
    const selected = segments.filter((segment) => segmentIds.has(segment.id));
    if (selected.length === 0) continue;

    const placed = place(selected, group);
    if (!placed) {
      skipped.push({ armorIndex, partIndex });
      continue;
    }

    const next = rebuild(segments, segmentIds, placed);
    if (!next) {
      skipped.push({ armorIndex, partIndex });
      continue;
    }
    if (next !== segments) updates.push({ armorIndex, partIndex, segments: next });
  }

  return { updates, skipped };
}

/** 選取範圍裡最早的起點（跨軌）——「對齊到哪」的預設答案 */
export function earliestStart(groups) {
  let earliest = Infinity;
  for (const { segments, segmentIds } of groups) {
    for (const segment of segments) {
      if (segmentIds.has(segment.id)) {
        earliest = Math.min(earliest, segment.start);
      }
    }
  }
  return earliest === Infinity ? null : earliest;
}

/**
 * 起點對齊：每一段搬到 `time`，長度不變。
 *
 * 這是跨軌的主要用途——七位舞者的同一個樂句，手放的起點差個幾格。
 */
export function alignStarts(groups, time) {
  return arrange(groups, (selected) => {
    const placed = new Map();
    for (const segment of selected) {
      placed.set(segment.id, {
        start: time,
        end: time + (segment.end - segment.start),
      });
    }
    return placed;
  });
}

/**
 * 長度統一：每一段保持起點，長度換成 `lengthMs`。
 *
 * 同一條軌上有好幾段被選到時，拉長可能會撞到下一段——那時整條放棄
 * （見檔頭：靜靜吃掉一段比什麼都不做糟）。
 */
export function matchLengths(groups, lengthMs) {
  if (!(lengthMs > 0)) return { updates: [], skipped: [] };

  return arrange(groups, (selected) => {
    const placed = new Map();
    for (const segment of selected) {
      placed.set(segment.id, {
        start: segment.start,
        end: segment.start + lengthMs,
      });
    }
    return placed;
  });
}

/**
 * 平均分佈：**逐軌**進行，保留頭尾，中間的段平均攤開。
 *
 * ⚠️ 這一個和另外兩個不同，它**不跨軌**：不同軌上的段各自在自己的時間軸上，
 * 把它們一起分佈只會全部疊在一起。所以每一條軌各自需要至少三段——只有兩段
 * 時「頭尾」就是全部，沒有中間可以攤。
 *
 * 攤的是**起點**而不是間隙：使用者要的是「每隔一樣久出現一次」，
 * 而各段長度不一時，等間隙不等於等節奏。
 */
export function distributeEvenly(groups) {
  return arrange(groups, (selected) => {
    if (selected.length < 3) return null;

    const sorted = [...selected].sort((a, b) => a.start - b.start);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const step = (last.start - first.start) / (sorted.length - 1);

    const placed = new Map();
    sorted.forEach((segment, index) => {
      // 取整交給 rebuild 統一做，這裡保持精確值，誤差才不會逐段累積
      const start = first.start + step * index;
      placed.set(segment.id, {
        start,
        end: start + (segment.end - segment.start),
      });
    });
    return placed;
  });
}
