import { isPartAllowed } from "../../config/accessoryConfig.js";
import { clearRange } from "./core.js";

/**
 * 整張光表層級的操作 —— **「一次編輯多條時間軸」的唯一定義處**。
 *
 * ## 為什麼需要這一層
 *
 * 選取從框選做出來之後就是**跨軌**的：使用者拉一個矩形，一次選到七位舞者
 * 身上的同一個樂句。但那時只有刪除與改色跟著改成跨軌，其餘的操作（亮度、
 * 漸變、頻閃、複製貼上、拖曳）全部停在
 *
 * ```js
 * const activePart = multiSelectedBlocks[0];        // 只看第一筆
 * const activeSegments = table[activePart.armorIndex][activePart.partIndex];
 * ```
 *
 * ——選了七條，只有一條會動，而且**不會報錯也沒有任何提示**，畫面上只是
 * 「怎麼其他六條沒變」。`TrackToolbar.jsx` 裡甚至還留著一行寫著
 * 「選取一定落在同一個部位上（Timeline 的多選不跨軌）」的註解，那是框選
 * 做出來之前寫的。
 *
 * 而唯二做對的那兩個各自手寫了一遍同樣的迴圈（依部位分組 → 逐條算新內容
 * → 逐層重建表並維持 reference）。兩份重複就是第三份的起點，所以收成這裡。
 *
 * ## 結構共享是硬性要求，不是最佳化
 *
 * 逐部位訂閱（`useSegmentPartTimeline`）與 `React.memo` 全都靠 reference
 * 判斷「我這條有沒有變」。重建整張表時若每一層都產生新陣列，一次編輯會讓
 * 154 條 Timeline 與 7 個 Armor 全部重繪——功能上看不出差別，手感上就是
 * 拖曳開始卡頓。所以這裡的每個函式都遵守同一條規則：
 *
 * **沒有變的東西回傳原本那個 reference**（segments、armor 那一列、整張表）。
 *
 * 整張表沒變時回傳原表，呼叫端的 `commit` 會判斷成 no-op 而不佔一格 undo。
 */

/**
 * 把幾條時間軸的新內容併回整張表。
 *
 * @param {Array} table 整張光表 `table[armorIndex][partIndex] = segments`
 * @param {Array<{armorIndex:number, partIndex:number, segments:Array}>} updates
 *   要換掉的部位。同一個部位出現多次時以最後一次為準
 * @returns {Array} 新表；沒有任何一條改變時回傳**原表**
 */
export function updateParts(table, updates) {
  if (!Array.isArray(table) || !updates?.length) return table;

  // 先收成 armorIndex → (partIndex → segments)，同一位舞者只重建一次
  const byArmor = new Map();
  for (const { armorIndex, partIndex, segments } of updates) {
    const current = table[armorIndex]?.[partIndex];
    if (current === undefined) continue; // 指到不存在的部位就跳過，不要長出新欄位
    if (segments === current) continue; // 這一條沒變

    if (!byArmor.has(armorIndex)) byArmor.set(armorIndex, new Map());
    byArmor.get(armorIndex).set(partIndex, segments);
  }

  if (byArmor.size === 0) return table;

  return table.map((armor, a) => {
    const parts = byArmor.get(a);
    if (!parts) return armor; // 這位舞者完全沒被動到，整列沿用
    return armor.map((segments, p) =>
      parts.has(p) ? parts.get(p) : segments,
    );
  });
}

/**
 * 對選取涵蓋的每一條時間軸各跑一次 `fn`，結果併回整張表。
 *
 * 這是「把一個單軌操作原地升級成跨軌操作」的標準做法：原本寫在
 * `activeSegments` 上的那段邏輯原封不動搬進 `fn`，其餘的事這裡處理。
 *
 * @param {Array} table 整張光表
 * @param {Array<{armorIndex:number, partIndex:number, segmentIds:Set<string>}>} groups
 *   通常來自 `groupSelectionsByPart(multiSelectedBlocks)`
 * @param {(segments:Array, ids:Set<string>, where:{armorIndex:number, partIndex:number}) => Array} fn
 *   回傳這一條的新 segments。**沒有變更時要回傳收到的那個陣列**
 * @returns {Array} 新表；沒有任何一條改變時回傳原表
 */
export function mapSelectedParts(table, groups, fn) {
  if (!Array.isArray(table) || !groups?.length) return table;

  const updates = [];
  for (const group of groups) {
    const { armorIndex, partIndex, segmentIds } = group;
    const segments = table[armorIndex]?.[partIndex];
    if (!segments) continue;

    const next = fn(segments, segmentIds, { armorIndex, partIndex });
    if (next !== segments) updates.push({ armorIndex, partIndex, segments: next });
  }

  return updateParts(table, updates);
}

/**
 * 選取涵蓋的每一條時間軸，附上它的 segments。
 *
 * 給「要先看過內容才知道怎麼改」的操作用（複製、拖曳的可動範圍）。
 * 指不到的部位直接略過——選取可能是舊的（undo 之後那條軌已經沒有那些段）。
 *
 * @returns {Array<{armorIndex, partIndex, segmentIds, segments}>}
 */
export function partsOfSelection(table, groups) {
  if (!Array.isArray(table) || !groups?.length) return [];

  return groups
    .map((group) => ({
      ...group,
      segments: table[group.armorIndex]?.[group.partIndex],
    }))
    .filter((group) => Array.isArray(group.segments));
}


/**
 * 換軌拖曳時，時間上還能移多遠。
 *
 * ⚠️ **和同軌拖曳的規則不一樣，這是刻意的。** 同軌拖曳撞到鄰居就停
 * （`movableRange`），因為那條軌上的其他色塊是使用者要保留的；換軌拖曳則是
 * **覆蓋**——落點上原本有什麼就被裁掉，語意與貼上一致。所以這裡唯一的限制
 * 是「不要跑出表演的時間範圍」。
 *
 * 兩種規則混在一起會很難解釋，但分開之後各自都只有一句話：
 * 「同一條軌上不會互相擠掉」與「搬到別條軌就是蓋過去」。
 */
export function trackMoveRange(groups, { duration } = {}) {
  let earliest = Infinity;
  let latest = -Infinity;

  for (const { segments, segmentIds } of groups) {
    for (const segment of segments) {
      if (!segmentIds.has(segment.id)) continue;
      earliest = Math.min(earliest, segment.start);
      latest = Math.max(latest, segment.end);
    }
  }

  if (earliest === Infinity) return null;

  const limit = Number.isFinite(duration) ? duration : Infinity;
  return {
    min: Math.min(0, -earliest),
    max: Math.max(0, limit - latest),
  };
}

/**
 * 把幾條軌上被選到的段**搬**到別的軌（可同時平移時間）。
 *
 * 搬走而不是複製，所以：
 *
 * - 段的 `id` **保持原樣**。它已經不在來源那一條上了，不會撞名，而且選取
 *   可以直接跟著走——換新 id 的話拖完之後選取就掉了
 * - 落點上原本的內容被裁掉（`clearRange`），與貼上同一套碰撞規則
 *
 * ⚠️ **先全部移除、再全部插入。** 來源與目標會重疊（把兩條一起往下拖一格時，
 * 第二條同時是第一條的目標與它自己的來源）。邊移邊插的話後處理的那一條會把
 * 前一條剛搬進來的東西當成「落點上原本就有的」再裁一次。
 *
 * @param {Array} table 整張光表
 * @param {Array<{armorIndex, partIndex, segmentIds, segments, to:{armorIndex, partIndex}}>} moves
 * @param {object} options `deltaMs` 同時平移的時間（已夾好）
 * @returns {{table: Array, selections: Array}} 沒有任何改變時 `table` 是原表
 */
export function moveSegmentsToTracks(table, moves, { deltaMs = 0 } = {}) {
  if (!Array.isArray(table) || !moves?.length) {
    return { table, selections: [] };
  }

  // 第一階段：把要搬走的段從來源移除
  const removals = [];
  const landings = [];

  for (const { armorIndex, partIndex, segmentIds, segments, to } of moves) {
    const moving = segments.filter((segment) => segmentIds.has(segment.id));
    if (moving.length === 0) continue;

    /*
     * ⚠️ **目標能不能收，要在移除之前就問清楚。**
     *
     * 移除是第一階段、插入是第二階段，所以「插入那邊放棄」等於**段被刪掉了**
     * ——來源已經清掉，而落點沒有接住。使用者看到的是「我拖了一下，色塊消失了」。
     *
     * 兩個條件：目標部位要存在於光表裡，而且那位舞者真的有那個部位
     * （`isPartAllowed`；光表是 7×22 的滿陣列，所以只檢查陣列存不存在的話，
     * 沒帶道具的舞者也會照單全收，而那些燈永遠不會亮）。
     */
    const target = table[to?.armorIndex]?.[to?.partIndex];
    if (!Array.isArray(target) || !isPartAllowed(to.armorIndex, to.partIndex)) {
      continue;
    }

    removals.push({
      armorIndex,
      partIndex,
      segments: segments.filter((segment) => !segmentIds.has(segment.id)),
    });

    landings.push({
      to,
      segments: moving.map((segment) => ({
        ...segment,
        start: segment.start + deltaMs,
        end: segment.end + deltaMs,
      })),
    });
  }

  if (landings.length === 0) return { table, selections: [] };

  const stripped = updateParts(table, removals);

  // 第二階段：插進目標軌，蓋掉衝突的部分
  const inserts = [];
  const selections = [];

  for (const { to, segments } of landings) {
    // 目標的合法性在第一階段就問過了（見上面的註解），這裡不必再檢查一次
    const existing = stripped[to.armorIndex][to.partIndex];
    const from = segments[0].start;
    const until = segments[segments.length - 1].end;

    inserts.push({
      armorIndex: to.armorIndex,
      partIndex: to.partIndex,
      segments: [...clearRange(existing, from, until), ...segments].sort(
        (a, b) => a.start - b.start,
      ),
    });

    for (const segment of segments) {
      selections.push({
        armorIndex: to.armorIndex,
        partIndex: to.partIndex,
        segmentId: segment.id,
      });
    }
  }

  return { table: updateParts(stripped, inserts), selections };
}
