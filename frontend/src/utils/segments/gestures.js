/**
 * 拖曳與 resize 的**純運算** —— 不碰 DOM、不碰 Redux。
 *
 * ## 為什麼要抽出來
 *
 * 這兩段邏輯原本內嵌在 `Timeline.jsx` 的全域滑鼠事件處理器裡，跟
 * `getBoundingClientRect()`、`requestAnimationFrame`、直接寫 DOM style
 * 綁在一起。jsdom 沒有版面（`getBoundingClientRect()` 全回 0），所以
 * **整個手勢路徑一行測試都沒有**——偏偏它是最容易寫錯的地方：邊界夾緊、
 * 網格對齊、與鄰居的最小間距，每一項錯了都只會在手感上「怪怪的」。
 *
 * 抽出來之後，會動到資料的部分是純函式，可以窮舉邊界；留在元件裡的只剩
 * 「像素 → 毫秒」與「把結果寫回 DOM」，那部分本來就只能靠瀏覽器驗。
 *
 * ## 兩個約束都保持原本的手感
 *
 * | 常數 | 意思 |
 * |---|---|
 * | `MIN_BLOCK_GAP_MS` | 相鄰兩個色塊之間至少留這麼多空隙（0 = 允許貼齊） |
 * | `MIN_SEGMENT_MS` | 色塊本身至少這麼長，避免縮到看不見也點不到 |
 */
import { TICK_MS } from "../../constants/time.js";

/**
 * 相鄰色塊之間的最小空隙。**0 = 可以拖到貼齊**。
 *
 * ⚠️ 這個值曾經是 50，而 `TICK_MS` 也是 50 —— 兩者相等會讓**最後一格永遠
 * 拖不到**，因為「與鄰居至少留一格」在一格對齊的網格上，正好把唯一剩下的
 * 那一步吃掉：
 *
 * ```
 * 鄰居在 12050、色塊尾端在 12000（中間隔 50ms）
 *   rightBound = 12050 - 50 = 12000
 *   max        = 12000 - 12000 = 0     ← 明明看得到空隙，卻一格都推不動
 * ```
 *
 * 使用者的症狀是「拖曳被隱形的東西擋住」：空隙在 1 倍率下只有 0.25px，
 * 而 `clearRange` 的 trim 會留下 50ms 的碎片段，於是擋住他的往往是一個
 * 看不見、也點不到的東西。
 *
 * 舊值的用意是「別讓色塊不小心黏在一起，之後很難用滑鼠分開」。但那個顧慮
 * 站不住腳：segment 模型明確允許首尾相接（`a.end === b.start`），而貼上與
 * 拖曳覆蓋（`clearRange`）本來就會產生相接的段。也就是說編輯器自己做得出
 * 那個狀態，卻不讓拖曳做——而且代價是連合法的最後一格都到不了。
 *
 * 要恢復「保留間距」的手感，正確的做法是吸附（snap）而不是硬性下界：
 * 靠近時吸開，但仍然允許使用者堅持貼齊。
 */
export const MIN_BLOCK_GAP_MS = 0;

/** 色塊的最小長度 */
export const MIN_SEGMENT_MS = 50;

const roundTo = (value, step) => Math.round(value / step) * step;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ceilTo = (value, step) => Math.ceil(value / step) * step;

const floorTo = (value, step) => Math.floor(value / step) * step;

/** 找出某個 id 在陣列裡的位置，找不到回傳 -1 */
const indexOfId = (segments, segmentId) =>
  segments.findIndex((segment) => segment.id === segmentId);

/** 表演總長沒給（音檔還沒載入）時當作無限長，不要讓 NaN 流進運算 */
const endOfTimeline = (duration) =>
  Number.isFinite(duration) ? duration : Infinity;

/**
 * 這批色塊還能往左／往右移多少毫秒。
 *
 * **像素預覽與放開後的 commit 必須用同一份答案**，否則會出現「拖到底了但
 * 放開後又跳一點」——那是因為兩邊各自算了一次邊界，而且用的是不同的公式。
 * 所以這裡把規則抽出來當單一來源：元件拿它換算成像素做預覽，`moveSegments`
 * 拿它決定最終落點。
 *
 * ## 為什麼只看「最近的未選取鄰居」就夠
 *
 * 整批色塊是**剛性移動**的，彼此相對位置不變，所以選取範圍內部不會互撞。
 * 每一段真正的限制只來自它和最近的那個**沒被選到**的鄰居；把每一段各自的
 * 上下限取交集，就是整批的可動範圍。連續選取時內側那幾段的限制較鬆，
 * 取 min/max 之後自然由最靠近鄰居的那一段決定。
 *
 * @returns {{min: number, max: number} | null}
 *   可移動的毫秒範圍（已對齊網格）。沒有選到東西、或被夾死時回傳 null。
 */
export function movableRange(
  segments,
  segmentIds,
  { duration, gap = MIN_BLOCK_GAP_MS, tick = TICK_MS } = {},
) {
  const ids = segmentIds instanceof Set ? segmentIds : new Set(segmentIds);
  const selected = segments.filter((segment) => ids.has(segment.id));
  if (selected.length === 0) return null;

  const isSelected = (index) => ids.has(segments[index].id);
  const limit = endOfTimeline(duration);

  let min = -Infinity;
  let max = Infinity;

  segments.forEach((segment, index) => {
    if (!isSelected(index)) return;

    let left = index - 1;
    while (left >= 0 && isSelected(left)) left--;
    let right = index + 1;
    while (right < segments.length && isSelected(right)) right++;

    const leftBound = left >= 0 ? segments[left].end + gap : 0;
    const rightBound =
      right < segments.length ? segments[right].start - gap : limit;

    min = Math.max(min, leftBound - segment.start);
    max = Math.min(max, rightBound - segment.end);
  });

  // 對齊網格時往內收（ceil 下界、floor 上界），確保夾出來的位移一定在範圍內。
  // 先夾再對齊的話，間距不是網格倍數時會被 round 推出邊界。
  //
  // 再夾一次 0：**沒有移動一定要是合法的**。呼叫端可以自己傳一個大於 0 的
  // `gap`，而 segment 模型允許兩個色塊首尾相接（`a.end === b.start`，貼上與
  // trim 都會產生）——那時算出來的下界會是正的，少了這道夾緊，拖 0 像素會把
  // 色塊自己彈開一格。被前後夾死的情況自然收斂成 {0, 0}，也就是整批不動。
  return {
    min: Math.min(0, ceilTo(min, tick)),
    max: Math.max(0, floorTo(max, tick)),
  };
}

/**
 * 整段平移（單一色塊）。
 *
 * @param {Array} segments 該部位的 segments（已排序、不重疊）
 * @param {string} segmentId 要移動的段
 * @param {number} deltaMs 位移量（可負）
 * @param {object} options duration / gap / tick
 * @returns {Array} 新陣列；沒有任何改變時回傳**原陣列**（呼叫端可用 reference 判斷）
 */
export function moveSegment(segments, segmentId, deltaMs, options = {}) {
  if (indexOfId(segments, segmentId) === -1) return segments;
  return moveSegments(segments, [segmentId], deltaMs, options);
}

/**
 * 多個色塊一起平移，彼此的相對位置不變。
 *
 * 選取範圍內部不會互撞（剛性移動），與外部鄰居的距離則由 `movableRange`
 * 夾住。整批共用同一個位移量——這正是使用者對「一起搬」的預期：搬完之後
 * 樂句的節奏不變。
 *
 * @param {Array} segments 該部位的 segments
 * @param {Iterable<string>} segmentIds 要一起移動的 id
 * @param {number} deltaMs 位移量（可負）
 * @param {object} options duration / gap / tick
 * @returns {Array} 新陣列；沒有任何改變時回傳原陣列
 */
export function moveSegments(
  segments,
  segmentIds,
  deltaMs,
  { duration, gap = MIN_BLOCK_GAP_MS, tick = TICK_MS } = {},
) {
  const ids = segmentIds instanceof Set ? segmentIds : new Set(segmentIds);
  const range = movableRange(segments, ids, { duration, gap, tick });
  if (!range) return segments;

  const delta = clamp(roundTo(deltaMs, tick), range.min, range.max);
  if (delta === 0) return segments;

  return segments.map((segment) =>
    ids.has(segment.id)
      ? { ...segment, start: segment.start + delta, end: segment.end + delta }
      : segment,
  );
}

/**
 * 好幾條軌一起平移時，整批共用的可動範圍。
 *
 * 每一條各自問一次 `movableRange`（那一條的限制只來自它自己的未選取鄰居），
 * 再取**交集**。整批共用同一個位移量是「一起搬」的定義：搬完之後樂句在七位
 * 舞者身上仍然對得齊，而那正是使用者框選跨軌的理由。
 *
 * ⚠️ 交集**永遠包含 0**（每一條各自的範圍就已經含 0），所以不會出現「動不了
 * 卻回傳 null」而讓呼叫端誤判成沒有選取。真的被夾死時是 `{min:0, max:0}`。
 *
 * @param {Array<{segments:Array, segmentIds:Iterable<string>}>} groups
 * @returns {{min:number, max:number}|null} 沒有任何一條選到東西時回傳 null
 */
export function movableRangeAcross(groups, options = {}) {
  let min = -Infinity;
  let max = Infinity;
  let found = false;

  for (const group of groups) {
    const range = movableRange(group.segments, group.segmentIds, options);
    if (!range) continue; // 這一條沒選到東西（例如只選了軌沒選色塊）
    found = true;
    min = Math.max(min, range.min);
    max = Math.min(max, range.max);
  }

  return found ? { min, max } : null;
}

/**
 * 好幾條軌一起平移，全部套用**同一個**位移量。
 *
 * 位移量先對齊網格、再夾進整批的交集，然後原樣套到每一條——**不要讓每一條
 * 各自再夾一次**，那會讓限制最緊的那條停下來而其他條繼續走，樂句就散開了
 * （而畫面上只是「怎麼有幾條沒跟上」）。
 *
 * @param {Array<{armorIndex, partIndex, segments, segmentIds}>} groups
 * @param {number} deltaMs 位移量（可負）
 * @returns {Array<{armorIndex, partIndex, segments}>}
 *   可以直接餵給 `updateParts`。沒有實際位移時回傳空陣列
 */
export function moveAcross(groups, deltaMs, options = {}) {
  const { tick = TICK_MS } = options;
  const range = movableRangeAcross(groups, options);
  if (!range) return [];

  const delta = clamp(roundTo(deltaMs, tick), range.min, range.max);
  if (delta === 0) return [];

  return groups.map(({ armorIndex, partIndex, segments, segmentIds }) => {
    const ids =
      segmentIds instanceof Set ? segmentIds : new Set(segmentIds);
    return {
      armorIndex,
      partIndex,
      segments: segments.map((segment) =>
        ids.has(segment.id)
          ? { ...segment, start: segment.start + delta, end: segment.end + delta }
          : segment,
      ),
    };
  });
}

/**
 * 拖動單邊調整長度。
 *
 * @param {Array} segments 該部位的 segments
 * @param {string} segmentId 要調整的段
 * @param {"left"|"right"} edge 拖的是哪一邊
 * @param {number} deltaMs 該邊的位移量（可負）
 * @param {object} options duration / gap / minDuration / tick
 * @returns {Array} 新陣列；沒有任何改變時回傳原陣列
 */
export function resizeSegment(
  segments,
  segmentId,
  edge,
  deltaMs,
  {
    duration,
    gap = MIN_BLOCK_GAP_MS,
    minDuration = MIN_SEGMENT_MS,
    tick = TICK_MS,
  } = {},
) {
  const index = indexOfId(segments, segmentId);
  if (index === -1) return segments;

  const target = segments[index];

  if (edge === "right") {
    const rightBound =
      index < segments.length - 1
        ? segments[index + 1].start - gap
        : endOfTimeline(duration);
    const nextEnd = roundTo(
      clamp(target.end + deltaMs, target.start + minDuration, rightBound),
      tick,
    );
    if (nextEnd === target.end || nextEnd <= target.start) return segments;
    return segments.map((segment, i) =>
      i === index ? { ...segment, end: nextEnd } : segment,
    );
  }

  const leftBound = index > 0 ? segments[index - 1].end + gap : 0;
  const nextStart = roundTo(
    clamp(target.start + deltaMs, leftBound, target.end - minDuration),
    tick,
  );
  if (nextStart === target.start || nextStart >= target.end) return segments;
  return segments.map((segment, i) =>
    i === index ? { ...segment, start: nextStart } : segment,
  );
}
