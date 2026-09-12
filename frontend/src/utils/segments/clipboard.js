/**
 * 剪貼簿的形狀與貼上的落點運算 —— **唯一定義處**。
 *
 * ## 為什麼要有這個檔案
 *
 * 舊的剪貼簿只認得**一條**時間軸：`copyRange` 拿 `multiSelectedBlocks[0]`
 * 的部位，把那一條上被選到的段存起來，其餘的丟掉。框選可以一次選到七位
 * 舞者身上的同一個樂句，複製之後卻只剩第一位——而且沒有任何提示。
 *
 * 現在剪貼簿存的是**一個矩形**：時間軸上一段區間 × 幾條軌道。
 *
 * ## 落點怎麼算
 *
 * 貼上要回答兩個問題：貼到**什麼時間**、貼到**哪幾條軌**。
 *
 * 時間沿用原本的兩種：以目標色塊的起點對齊（Ctrl+V），或保持原本的時間
 * （Ctrl+Shift+V）。
 *
 * 軌道則是**二維平移**：把來源的錨點 `(armorIndex, partIndex)` 平移到目標的
 * `(armorIndex, partIndex)`，其餘每一條跟著平移同樣的量。
 *
 * ```
 * 複製 D1 的帽子..領帶  →  貼到 D4 的帽子   落在 D4 的帽子..領帶
 * 複製 D1..D7 的帽子    →  貼到 D1 的領帶   落在 D1..D7 的領帶
 * 複製 D1 的帽子        →  貼到 D1 的帽子   只是往時間軸挪
 * ```
 *
 * ⚠️ **刻意不用「可見軌道清單裡的第幾列」當平移量。** 那是使用者眼睛看到的
 * 東西沒錯，但工作集可以隨時重新排序、增刪軌道，於是同一份剪貼簿在切換工作集
 * 之後會貼到完全不同的部位——而畫面上看起來一切正常，只是燈亮錯地方。
 * `(舞者, 部位)` 是資料本身的座標，跟畫面上怎麼排無關。
 *
 * 平移之後落在光表範圍外的那幾條**整條丟掉**，不夾回邊界：夾回去會讓兩條
 * 疊在同一個部位上，後貼的默默蓋掉先貼的。丟掉至少是「這條沒貼到」，看得出來。
 *
 * ## 相位偏移（跑馬燈）
 *
 * `target.phaseMs` 不是 0 的時候，落點會再多一項「**第幾條**乘上 phaseMs」。
 * 一個色塊貼到七位舞者身上、每位往後推 100ms，就是一道光波沿著隊形跑過去
 * ——那是燈光台（grandMA / Chamsys）最常用的效果，而在這之前要做只能複製七次
 * 再一條一條往後推，推完想改間隔就得全部重來。
 *
 * 「第幾條」是把剪貼簿的內容依 `(舞者, 部位)` 排序之後的名次，**不是**選取的
 * 順序：使用者框選的順序取決於他從哪個角落開始拉，而波要沿著隊形跑。
 * phaseMs 為負就是反方向。
 */
import { TICK_MS } from "../../constants/time.js";
import { isPartAllowed } from "../../config/accessoryConfig.js";
import { clearRange, createId, roundToTick } from "./core.js";

/** 剪貼簿內容的格式標記。舊格式（單軌、或更早的 keyframe 陣列）一律視為空 */
export const CLIPBOARD_KIND = "segments-2d";

/**
 * 把跨軌的選取打包成剪貼簿內容。
 *
 * @param {Array<{armorIndex, partIndex, segmentIds:Set, segments:Array}>} groups
 *   來自 `partsOfSelection(table, groupSelectionsByPart(selections))`
 * @param {object} anchor 錨點部位 `{armorIndex, partIndex}`（使用者最先點到的那一條）
 * @returns {object|null} 沒有任何段被選到時回傳 null
 */
export function packClipboard(groups, anchor) {
  const parts = [];

  for (const { armorIndex, partIndex, segmentIds, segments } of groups) {
    const picked = segments
      .filter((segment) => segmentIds.has(segment.id))
      .map((segment) => ({ ...segment }));
    if (picked.length > 0) parts.push({ armorIndex, partIndex, segments: picked });
  }

  if (parts.length === 0) return null;

  /*
   * `startTime` 是**整份**內容最早的起點，不是錨點那一條的。七位舞者的同一個
   * 樂句起點可能差半拍，用錨點那一條當基準的話，Ctrl+V 對齊之後整組會相對
   * 目標偏移那半拍——而使用者以為自己貼在選到的那個色塊上。
   */
  const starts = parts.flatMap((part) => part.segments.map((s) => s.start));
  const ends = parts.flatMap((part) => part.segments.map((s) => s.end));

  return {
    kind: CLIPBOARD_KIND,
    parts,
    startTime: Math.min(...starts),
    endTime: Math.max(...ends),
    anchorArmorIndex: anchor.armorIndex,
    anchorPartIndex: anchor.partIndex,
    timestamp: Date.now(),
  };
}

/**
 * 每一條在相位順序裡排第幾 —— **依 `(舞者, 部位)` 排序，不是選取順序**。
 *
 * 框選的順序取決於使用者從哪個角落開始拉（由下往上拉就整個反過來），而波要
 * 沿著隊形跑。用座標排序才是穩定的，而且和貼上的二維平移用同一組座標。
 *
 * @returns {Map<string, number>} `"armor-part"` → 名次（0 起算）
 */
export function phaseRanks(clipboard) {
  const ranks = new Map();
  if (!hasContent(clipboard)) return ranks;

  [...clipboard.parts]
    .sort(
      (a, b) =>
        a.armorIndex - b.armorIndex || a.partIndex - b.partIndex,
    )
    .forEach((part, index) => {
      ranks.set(`${part.armorIndex}-${part.partIndex}`, index);
    });

  return ranks;
}

/**
 * 這一條的相位偏移（毫秒），已對齊網格。
 *
 * ⚠️ **相位一律往後推，`phaseMs` 的正負只決定波往哪個方向跑。**
 *
 * 直覺寫法是 `名次 × phaseMs`，但那樣負相位會把後面幾條推到**游標之前**、
 * 甚至推到負時間去被丟掉，而滑鼠預覽的夾緊只顧得到一邊。改成負相位時以
 * **最後一名**當基準（`(名次 − (n−1)) × phaseMs`），整組就永遠落在游標之後，
 * 「游標指到哪，最早的那一條就落在哪」對兩個方向都成立。
 */
const phaseOf = (ranks, part, phaseMs, count) => {
  if (!phaseMs) return 0;
  const rank = ranks.get(`${part.armorIndex}-${part.partIndex}`) ?? 0;
  const base = phaseMs < 0 ? count - 1 : 0;
  return roundToTick((rank - base) * phaseMs);
};

/** 這份剪貼簿是不是這個版本認得的、而且有東西 */
export const hasContent = (clipboard) =>
  clipboard?.kind === CLIPBOARD_KIND && clipboard.parts?.length > 0;

/**
 * 剪貼簿裡的每一段落在哪一條軌、哪個時間 —— 給 Timeline 畫「複製來源」標記用。
 *
 * @returns {Array<{armorIndex, partIndex, segmentId}>}
 */
export const sourceSelections = (clipboard) =>
  hasContent(clipboard)
    ? clipboard.parts.flatMap(({ armorIndex, partIndex, segments }) =>
        segments.map((segment) => ({
          armorIndex,
          partIndex,
          segmentId: segment.id,
        })),
      )
    : [];

/**
 * 算出貼上之後每一條軌的新內容。
 *
 * @param {Array} table 整張光表
 * @param {object} clipboard 剪貼簿
 * @param {object} target 落點 `{armorIndex, partIndex, timeOffset}`
 * @returns {Array<{armorIndex, partIndex, segments, pasted}>}
 *   `segments` 是那一條的新內容（可直接餵給 `updateParts`），
 *   `pasted` 是這一條上新貼進去的段（給「貼完選取它們」用）
 */
export function planPaste(table, clipboard, target) {
  if (!hasContent(clipboard) || !Array.isArray(table)) return [];

  const armorShift = target.armorIndex - clipboard.anchorArmorIndex;
  const partShift = target.partIndex - clipboard.anchorPartIndex;
  const offset = roundToTick(target.timeOffset ?? 0);
  const ranks = phaseRanks(clipboard);

  const plans = [];

  for (const part of clipboard.parts) {
    const armorIndex = part.armorIndex + armorShift;
    const partIndex = part.partIndex + partShift;

    // 平移出光表範圍就整條丟掉（不夾回邊界，見檔頭）
    const existing = table[armorIndex]?.[partIndex];
    if (!Array.isArray(existing)) continue;

    /*
     * ⚠️ **落在那位舞者沒有的部位也整條丟掉。**
     *
     * 光表是 7×22 的滿陣列，所以上面那個 `Array.isArray` 對 22 個部位全部為真
     * ——它擋的是「平移出表外」，擋不到「這位舞者沒帶那件道具」。於是把七位
     * 舞者的 acc3 一起複製、往下貼一格，資料就會落在沒有那件道具的人身上。
     *
     * 那種錯完全沒有症狀：編輯器裡看得到色塊、上傳成功、清單正常，只有演出
     * 當天那盞不存在的燈不會亮。`buildPlayers` 那邊有最後一道防線（載入舊
     * 光表也可能帶進這種資料），但擋在這裡才看得出來——呼叫端會知道「有幾條
     * 沒貼上」，而寫進去之後就只是資料裡多了一塊沒有人會發現的東西。
     */
    if (!isPartAllowed(armorIndex, partIndex)) continue;

    // 跑馬燈：這一條再往後推「名次 × phaseMs」
    const shift =
      offset + phaseOf(ranks, part, target.phaseMs, clipboard.parts.length);

    const pasted = part.segments
      .map((segment) => ({
        ...segment,
        // 貼上的是**副本**：沿用舊 id 會讓選取與 undo diff 同時指到兩個地方
        id: createId(),
        start: roundToTick(segment.start + shift),
        end: roundToTick(segment.end + shift),
      }))
      .filter((segment) => segment.end > segment.start && segment.start >= 0);

    if (pasted.length === 0) continue;

    const from = pasted[0].start;
    const to = pasted[pasted.length - 1].end;

    plans.push({
      armorIndex,
      partIndex,
      segments: [...clearRange(existing, from, to), ...pasted].sort(
        (a, b) => a.start - b.start,
      ),
      pasted,
    });
  }

  return plans;
}

/**
 * 整條覆蓋（Shift+V）的落點，語意與 `planPaste` 相同但**不保留目標原本的內容**。
 *
 * 時間不平移：整條複製整條蓋，錯開時間就不叫「覆蓋這一條」了。
 */
export function planOverwrite(table, clipboard, target) {
  if (!hasContent(clipboard) || !Array.isArray(table)) return [];

  const armorShift = target.armorIndex - clipboard.anchorArmorIndex;
  const partShift = target.partIndex - clipboard.anchorPartIndex;

  const plans = [];

  for (const part of clipboard.parts) {
    const armorIndex = part.armorIndex + armorShift;
    const partIndex = part.partIndex + partShift;
    // 和 planPaste 同一套：出表外、或那位舞者沒有這個部位，都整條丟掉
    if (!Array.isArray(table[armorIndex]?.[partIndex])) continue;
    if (!isPartAllowed(armorIndex, partIndex)) continue;

    const pasted = part.segments.map((segment) => ({
      ...segment,
      id: createId(),
    }));

    plans.push({ armorIndex, partIndex, segments: pasted, pasted });
  }

  return plans;
}

/**
 * 貼上之後每一段會落在哪一條軌、哪一段時間 —— **給滑鼠預覽用**。
 *
 * 和 `planPaste` 算的是同一個落點，但**不碰光表**：預覽在滑鼠移動時每一幀都要
 * 算一次，而 `planPaste` 會對每一條目標軌跑一次 `clearRange` 並產生新陣列。
 * 預覽只需要知道「框要畫在哪」，不需要知道合併之後長什麼樣。
 *
 * 順序與 `planPaste` 的 `pasted` 攤平之後一致（同樣逐 part、逐 segment），
 * 所以呼叫端可以用固定數量的 DOM 節點對應。
 *
 * @returns {Array<{armorIndex, partIndex, start, end}>}
 */
export function landingSpans(clipboard, target) {
  if (!hasContent(clipboard)) return [];

  const armorShift = target.armorIndex - clipboard.anchorArmorIndex;
  const partShift = target.partIndex - clipboard.anchorPartIndex;
  const offset = roundToTick(target.timeOffset ?? 0);
  const ranks = phaseRanks(clipboard);

  const spans = [];
  for (const part of clipboard.parts) {
    const shift =
      offset + phaseOf(ranks, part, target.phaseMs, clipboard.parts.length);
    for (const segment of part.segments) {
      const start = roundToTick(segment.start + shift);
      const end = roundToTick(segment.end + shift);
      if (end <= start || start < 0) continue;
      spans.push({
        armorIndex: part.armorIndex + armorShift,
        partIndex: part.partIndex + partShift,
        start,
        end,
      });
    }
  }
  return spans;
}

/** 剪貼簿裡總共有幾段（預覽要準備幾個 DOM 節點） */
export const segmentCount = (clipboard) =>
  hasContent(clipboard)
    ? clipboard.parts.reduce((sum, part) => sum + part.segments.length, 0)
    : 0;

/**
 * 剪貼簿內容的時間長度。滑鼠預覽用它把落點夾在表演範圍內
 * ——貼到一半跑出時間軸外面的話，那幾段會被 `planPaste` 丟掉，
 * 而畫面上只看得到「怎麼少貼了幾塊」。
 */
export const clipboardSpanMs = (clipboard, phaseMs = 0) => {
  if (!hasContent(clipboard)) return 0;
  // 相位會把最後一條往後推，整份內容因此變長。不算進去的話滑鼠可以把落點推到
  // 時間軸外面，那幾條會被 planPaste 丟掉——而畫面上只看得到「怎麼少貼了幾塊」
  const spread = Math.abs(phaseMs) * Math.max(0, clipboard.parts.length - 1);
  return clipboard.endTime - clipboard.startTime + spread;
};

/** 時間軸最小刻度，供呼叫端對齊用（避免各自 import 兩個常數） */
export { TICK_MS };
