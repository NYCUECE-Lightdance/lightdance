import { TICK_MS } from "../../constants/time.js";

/**
 * Segment 核心工具 — **payload-agnostic**。
 *
 * ⚠️ 這個檔案**永遠不可以 import 任何色彩相關的程式碼**。
 *
 * 原因：長期願景是讓音軌也用同一套 segment 模型（可拖曳、可拼貼的音訊片段，
 * 見 CLAUDE.md「長期願景：多軌音訊」）。燈光 segment 的 payload 是
 * `{colorStart, colorEnd, linear}`，音訊 segment 的 payload 會是
 * `{sourceFile, sourceOffset, volume, fadeIn, fadeOut}`——兩者結構完全相同，
 * 差別只在 payload。只要核心邏輯不認得色彩，多軌時就能直接複用。
 *
 * 因此本檔的函式只認得三個欄位：`id` / `start` / `end`，其餘一律用 spread 帶過。
 *
 * 給 C++ 開發者的類比：這相當於 `template<typename Payload> struct Segment`，
 * 演算法只操作 start/end 這兩個 key，payload 是不透明型別。
 *
 * 不變式（invariants）：
 *   1. 依 start 由小到大排序
 *   2. 彼此不重疊（前一段的 end <= 後一段的 start）
 *   3. start 與 end 都對齊 TICK_MS 網格
 *   4. end > start（不允許零長度）
 *   5. segment 之間的空隙 = 沒有東西（燈光上就是熄滅）
 */

/** 向上對齊到網格 */
export function ceilToTick(ms, tick = TICK_MS) {
  return Math.ceil(ms / tick) * tick;
}

/** 四捨五入對齊到網格 */
export function roundToTick(ms, tick = TICK_MS) {
  return Math.round(ms / tick) * tick;
}

/** 向下對齊到網格 */
export function floorToTick(ms, tick = TICK_MS) {
  return Math.floor(ms / tick) * tick;
}

/**
 * 二分搜尋：找出最後一個 `start <= time` 的 segment 索引。
 * 找不到（time 在第一段之前）時回傳 -1。
 */
export function findSegmentIndexAt(segments, time) {
  let left = 0;
  let right = segments.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (segments[mid].start <= time) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return result;
}

/**
 * 找出涵蓋 `time` 的 segment（半開區間 `[start, end)`）。
 * 落在空隙中回傳 null——空隙代表沒有內容。
 */
export function findSegmentAt(segments, time) {
  const index = findSegmentIndexAt(segments, time);
  if (index === -1) return null;
  const candidate = segments[index];
  return time < candidate.end ? candidate : null;
}

/**
 * 找出涵蓋 `time` 的 segment；落在空隙時退而求其次找**最接近**的那一段。
 *
 * 跨軌導航（W/S）要的就是這個語意：「上一條軌道在同一個時間點的色塊」，
 * 但那條軌道在該時刻可能是熄滅的，這時選最近的色塊比什麼都不選有用。
 *
 * 空陣列回傳 null。距離相同時取比較早的那一段。
 */
export function findNearestSegment(segments, time) {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const covering = findSegmentAt(segments, time);
  if (covering) return covering;

  let best = null;
  let bestDistance = Infinity;

  for (const segment of segments) {
    const distance =
      time < segment.start ? segment.start - time : time - segment.end;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = segment;
    }
  }
  return best;
}

/** 找出與 `[start, end)` 有交集的所有 segment */
export function findSegmentsInRange(segments, start, end) {
  return segments.filter(
    (segment) => segment.start < end && segment.end > start,
  );
}

/**
 * 檢查不變式，回傳違反項目的清單（空陣列代表通過）。
 * 回傳清單而非丟例外，讓呼叫端決定要 warn 還是 throw。
 */
export function validateSegments(segments, { tick = TICK_MS } = {}) {
  const problems = [];

  segments.forEach((segment, index) => {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
      problems.push(`第 ${index} 段的 start/end 不是有限數`);
      return;
    }
    if (segment.end <= segment.start) {
      problems.push(
        `第 ${index} 段的長度非正（start=${segment.start}, end=${segment.end}）`,
      );
    }
    if (segment.start % tick !== 0 || segment.end % tick !== 0) {
      problems.push(
        `第 ${index} 段未對齊 ${tick}ms 網格（start=${segment.start}, end=${segment.end}）`,
      );
    }
    if (index > 0) {
      const previous = segments[index - 1];
      if (segment.start < previous.start) {
        problems.push(`第 ${index} 段未依 start 排序`);
      } else if (segment.start < previous.end) {
        problems.push(
          `第 ${index} 段與前一段重疊（前段 end=${previous.end}, 本段 start=${segment.start}）`,
        );
      }
    }
  });

  return problems;
}

/**
 * 把 `[start, end)` 這段區間從既有 segment 上裁掉（trim 碰撞策略）。
 *
 * 三種情況：
 *   - 完全被蓋住 → 整段移除
 *   - 一端被蓋住 → 縮短那一端
 *   - 中間被蓋住 → split 成兩段（後半段拿到新的 id）
 *
 * @param {Array} segments - 已符合不變式的 segment 陣列
 * @param {number} start
 * @param {number} end
 * @param {{makeId?: () => string}} options - split 時產生新 id 的方式
 * @returns {Array} 新陣列
 */
export function clearRange(segments, start, end, { makeId = createId } = {}) {
  const result = [];

  for (const segment of segments) {
    // 沒有交集：原樣保留
    if (segment.end <= start || segment.start >= end) {
      result.push(segment);
      continue;
    }
    // 完全被覆蓋：丟棄
    if (segment.start >= start && segment.end <= end) {
      continue;
    }
    // 中間被挖空：split 成前後兩段
    if (segment.start < start && segment.end > end) {
      result.push({ ...segment, end: start });
      result.push({ ...segment, id: makeId(), start: end });
      continue;
    }
    // 右側被覆蓋：縮短尾端
    if (segment.start < start) {
      result.push({ ...segment, end: start });
      continue;
    }
    // 左側被覆蓋：推遲開頭
    result.push({ ...segment, start: end });
  }

  return result;
}

/**
 * 插入一個 segment，碰撞時把舊 segment 被覆蓋的部分裁掉（trim）。
 * 回傳排序後的新陣列。
 */
export function insertSegment(segments, segment, { makeId = createId } = {}) {
  const cleared = clearRange(segments, segment.start, segment.end, { makeId });
  const inserted = [...cleared, segment];
  inserted.sort((a, b) => a.start - b.start);
  return inserted;
}

/** 產生穩定 id；沒有 crypto.randomUUID 的環境（舊瀏覽器、部分測試）自動退回 */
export function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `seg-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
