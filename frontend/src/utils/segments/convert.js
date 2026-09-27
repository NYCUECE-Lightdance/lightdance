import { TICK_MS } from "../../constants/time.js";
import { ceilToTick, createId } from "./core.js";
import { expandEffects } from "./effects.js";

/**
 * keyframe ↔ segment 雙向轉換。
 *
 * ## 為什麼邊界一律用 ceil
 *
 * `buildPlayers`（韌體輸出）決定取樣時間點的方式是 `ceil(t / TICK_MS) * TICK_MS`。
 * 轉換器用**完全相同的取整方式**決定 segment 邊界，於是兩種模型算出來的事件時間
 * 集合逐格相同——「時間格不變」這個硬性契約因此是由建構方式保證的，不是碰巧成立。
 *
 * ## 黑色哨兵徹底消失
 *
 * 舊模型用「色塊結束前 10ms 插一個純黑關鍵格」表達 LED 熄滅。segment 模型改用
 * **段與段之間的空隙**表達熄滅，黑色不再是資料：
 *   - `keyframesToSegments`：黑關鍵格只當作邊界，本身不產生 segment
 *   - `segmentsToKeyframes`：空隙前在**網格點整點**發一個黑關鍵格（不是 -10ms）
 *
 * ## 已知的表達力限制
 *
 * keyframe 模型中，漸變的終點色**就是下一個 keyframe 的顏色**——沒有地方能單獨
 * 記錄「這段漸變要收在什麼顏色」。因此 `colorEnd` 只有在等於邊界色時才能被忠實
 * 壓平回 keyframe：
 *   - 後面是空隙 → `colorEnd` 必須是黑（fade to dark）
 *   - 後面緊鄰下一段 → `colorEnd` 應等於下一段的 `colorStart`
 *
 * 從真實資料轉出來的 segment 天然滿足這個條件（因為它本來就是這樣算出來的）。
 * Phase 5 之後由編輯器維持這個不變式。
 */

const BLACK = { R: 0, G: 0, B: 0, A: 1 };

const isBlackColor = (color) =>
  (color?.R ?? 0) === 0 && (color?.G ?? 0) === 0 && (color?.B ?? 0) === 0;

const sameColor = (a, b) =>
  (a?.R ?? 0) === (b?.R ?? 0) &&
  (a?.G ?? 0) === (b?.G ?? 0) &&
  (a?.B ?? 0) === (b?.B ?? 0) &&
  (a?.A ?? 1) === (b?.A ?? 1);

const cloneColor = (color) => ({
  R: color?.R ?? 0,
  G: color?.G ?? 0,
  B: color?.B ?? 0,
  A: color?.A ?? 1,
});

/**
 * 關鍵格時間軸 → segment 陣列。
 *
 * @param {Array} timeline - `[{time, color:{R,G,B,A}, linear}]`，需已依時間排序
 * @param {{duration?: number, tick?: number, makeId?: () => string}} options
 *   duration: 末段沒有終止關鍵格時用來收尾
 * @returns {Array} `[{id, start, end, colorStart, colorEnd, linear}]`
 */
export function keyframesToSegments(timeline, options = {}) {
  const { duration, tick = TICK_MS, makeId = createId } = options;
  if (!Array.isArray(timeline) || timeline.length === 0) return [];

  // 先把每個關鍵格對齊到網格。多個關鍵格落在同一格點時，只有最後一個會被
  // buildPlayers 取樣到（activeBlock = 最後一個 time <= 取樣點者），
  // 但**前一個仍可能是某段漸變的終點**，所以這裡保留原始順序，
  // 由下面的零長度過濾自然處理。
  const points = timeline
    .filter((keyframe) => keyframe && Number.isFinite(keyframe.time))
    .map((keyframe) => ({
      grid: ceilToTick(keyframe.time, tick),
      color: cloneColor(keyframe.color),
      linear: keyframe.linear === 1 ? 1 : 0,
      isBlack: isBlackColor(keyframe.color),
    }));

  const segments = [];

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    if (current.isBlack) continue; // 黑點只是邊界，不產生 segment

    const next = points[i + 1];
    const start = current.grid;
    // 沒有下一格 = 舊資料沒有寫「什麼時候熄滅」。用 duration 收尾只是給它一個
    // 合法的 end，真正的資訊記在 openEnded 上（見下方說明）。
    const end = next
      ? next.grid
      : Math.max(ceilToTick(duration ?? 0, tick), start + tick);

    if (end <= start) continue; // 同格點塌陷產生的零長度段：捨棄

    const segment = {
      id: makeId(),
      start,
      end,
      colorStart: current.color,
      // 漸變的終點色就是下一格的顏色；沒有下一格時視為漸暗到黑
      colorEnd:
        current.linear === 1
          ? next
            ? cloneColor(next.color)
            : { ...BLACK }
          : current.color,
      linear: current.linear,
    };

    // 舊資料中「最後一個關鍵格是彩色」代表這個顏色一路亮到表演結束，
    // 從來沒有熄滅點。這個事實必須明確記下來，否則壓平時會多發一個
    // 原本不存在的黑關鍵格，讓輸出多出一列。
    //
    // 為什麼不用「end 是否等於 duration」來推斷：那會讓輸出正確與否取決於
    // 呼叫端有沒有傳對 duration——傳錯就靜默改變韌體資料，是很糟的性質。
    if (!next) segment.openEnded = true;

    segments.push(segment);
  }

  return segments;
}

/**
 * segment 陣列 → 關鍵格時間軸（供匯出壓平與過渡期 adapter 使用）。
 *
 * 關於「要不要在段尾發黑點」：只有當那個位置真的會熄滅時才發。標記為
 * `openEnded` 的段（來自舊資料中沒有熄滅點的尾段）不發黑點，對應舊模型
 * 「最後一個關鍵格之後就沒有資料列」的行為。
 *
 * @param {Array} segments - 需符合不變式（排序、不重疊、對齊網格）
 * @param {{duration?: number}} options
 *   duration: 表演總長。舊模型每個部位尾端都有一個到表演結束的黑關鍵格
 *   （`normalizeActionTable` 強制加的），它同時承載「這條時間軸有多長」的資訊。
 *   segment 模型把長度收斂到 duration 這個單一來源，因此壓平時要在尾端還原它，
 *   否則輸出的時間範圍會比原本短。
 * @returns {Array} `[{time, color, linear}]`
 */
export function segmentsToKeyframes(input, options = {}) {
  const { duration } = options;

  /*
   * 效果（目前只有頻閃）在這裡才展開成一串脈衝。
   *
   * 編輯器裡它是段上的一個 metadata 欄位，畫面上仍然是**一個**可拖曳、可 resize、
   * 可改色的色塊；韌體不認得那個欄位，所以壓平時把它攤成舊模型看得懂的樣子。
   * 展開後的形狀與舊版「直接生一堆小色塊」逐格相同，韌體收到的東西不變。
   *
   * 沒有任何效果時 `expandEffects` 回傳原陣列，不會多配置一次。
   */
  const segments = expandEffects(input);

  // 全程熄滅的部位：涵蓋 [0, duration]，與 normalizeActionTable 的不變式一致
  if (!Array.isArray(segments) || segments.length === 0) {
    const off = [{ time: 0, color: { ...BLACK }, linear: 0 }];
    if (duration !== undefined && duration > 0) {
      off.push({ time: duration, color: { ...BLACK }, linear: 0 });
    }
    return off;
  }

  const keyframes = [];

  // 第一段不是從 0 開始 → 開頭補一個黑點，表示一開始是熄滅的
  if (segments[0].start > 0) {
    keyframes.push({ time: 0, color: { ...BLACK }, linear: 0 });
  }

  segments.forEach((segment, index) => {
    keyframes.push({
      time: segment.start,
      color: cloneColor(segment.colorStart),
      linear: segment.linear === 1 ? 1 : 0,
    });

    const next = segments[index + 1];
    const hasGapAfter = !next || next.start > segment.end;

    if (hasGapAfter) {
      // 後面是空隙 → 在網格點整點熄滅。
      // openEnded 的尾段從來就沒有熄滅點，也不該補一個。
      if (!segment.openEnded) {
        keyframes.push({ time: segment.end, color: { ...BLACK }, linear: 0 });
      }
      return;
    }

    // 緊鄰下一段：下一段的起點關鍵格通常就是這段的邊界，不必多發東西。
    //
    // 但漸變是例外——keyframe 模型中漸變的終點色**就是下一個關鍵格的顏色**。
    // 若本段的 colorEnd 與下一段的 colorStart 不同，直接接上去會讓漸變漸到
    // 錯誤的顏色。真實資料就會踩到：舊的黑色哨兵（如 2990ms）向上對齊到 3000ms
    // 之後，正好與下一個色塊的起點重合，「白→黑」就會被壓平成「白→紅」。
    // 這時必須額外發一個帶 colorEnd 的關鍵格當作漸變終點。
    const needsGradientTarget =
      segment.linear === 1 && !sameColor(segment.colorEnd, next.colorStart);

    if (needsGradientTarget) {
      keyframes.push({
        time: segment.end,
        color: cloneColor(segment.colorEnd),
        linear: 0,
      });
    }
  });

  // 尾端補齊到表演長度（見上方 duration 說明）。openEnded 的段代表「一路亮到最後」，
  // 補黑點會把它關掉，所以排除。
  const lastSegment = segments[segments.length - 1];
  const lastKeyframe = keyframes[keyframes.length - 1];
  if (
    duration !== undefined &&
    !lastSegment.openEnded &&
    lastKeyframe.time < duration
  ) {
    keyframes.push({ time: duration, color: { ...BLACK }, linear: 0 });
  }

  return keyframes;
}

/**
 * 整張 actionTable 的轉換。
 *
 * 容器容忍 array 與 object 兩種形狀（與 buildPlayers 一致）——Phase 1 已把
 * canonical 定為巢狀 array，但舊的持久化資料仍可能是 object，轉換器是遷移
 * 路徑的一部分，不該在這裡才炸掉。
 */
export function actionTableToSegments(actionTable, options = {}) {
  const armors = Array.isArray(actionTable)
    ? actionTable
    : Object.values(actionTable ?? {});

  return armors.map((armor) => {
    const timelines = Array.isArray(armor) ? armor : Object.values(armor ?? {});
    return timelines.map((timeline) => keyframesToSegments(timeline, options));
  });
}

/** 整張 segment table 壓平回 keyframe actionTable */
export function segmentsToActionTable(segmentTable, options = {}) {
  return segmentTable.map((armor) =>
    Array.from(armor, (segments) => segmentsToKeyframes(segments, options)),
  );
}
