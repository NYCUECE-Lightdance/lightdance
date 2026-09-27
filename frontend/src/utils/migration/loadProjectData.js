import { PART_COUNT, PLAYER_COUNT } from "../../constants/parts.js";
import { migrateClips } from "../audio/clips.js";
import { normalizeActionTable } from "../actionTable/normalizeActionTable.js";
import { actionTableToSegments } from "../segments/convert.js";
import { validateSegments } from "../segments/core.js";

/**
 * 專案資料的**單一載入入口**。
 *
 * 光表可以從三個地方進來，每一條都可能帶著舊格式：
 *
 * | 來源 | 位置 |
 * |---|---|
 * | redux-persist rehydrate | `redux/store.js`（persist key `root_v2`） |
 * | 伺服器的 `raw_data` | `pages/Dashboard.jsx` 的 `loadProject` |
 * | IndexedDB 本地備份 | `utils/indexedDB.js` |
 *
 * 三條路徑都必須經過這裡，store 裡才能保證只有 segment 一種形狀。
 *
 * ## 為什麼用「看形狀」而不是只信 schemaVersion
 *
 * `schemaVersion` 是寫入時才加上的欄位，redux-persist 存的是 state 快照、
 * 沒有 envelope，舊備份也不會有。**靠版號判斷等於賭每一條寫入路徑都記得加**，
 * 賭輸的代價是把 segment 當 keyframe 再轉一次（資料直接壞掉）。
 *
 * 形狀則是不會說謊的：keyframe 有 `time`，segment 有 `start`/`end`，兩者不可能混淆。
 * 所以這裡以形狀為準，`schemaVersion` 只當作交叉檢查用的提示。
 */

export const SCHEMA_VERSION = 2;

/** 一個 timeline 元素是 segment 還是 keyframe？ */
const looksLikeSegment = (entry) =>
  entry != null &&
  typeof entry === "object" &&
  Number.isFinite(entry.start) &&
  Number.isFinite(entry.end);

/**
 * 判斷整張表是不是 segment 格式。
 *
 * 空表（每個部位都沒東西）在兩種模型下長得一樣，回傳 true —— 當成 segment
 * 處理是安全的：空陣列轉過去還是空陣列。
 */
export function isSegmentTable(table) {
  const armors = Array.isArray(table) ? table : Object.values(table ?? {});

  for (const armor of armors) {
    const timelines = Array.isArray(armor) ? armor : Object.values(armor ?? {});
    for (const timeline of timelines) {
      if (Array.isArray(timeline) && timeline.length > 0) {
        return looksLikeSegment(timeline[0]);
      }
    }
  }

  return true; // 完全空的表：兩種模型無法區分，當作已經是 segment
}

/** 補齊成 7×22，缺的部位是空陣列（segment 世界的「全程熄滅」） */
export function normalizeSegmentTable(table) {
  return Array.from({ length: PLAYER_COUNT }, (_, armorIdx) =>
    Array.from({ length: PART_COUNT }, (_, partIdx) => {
      const segments = table?.[armorIdx]?.[partIdx];
      return Array.isArray(segments) ? segments : [];
    }),
  );
}

/**
 * 把任何來源的光表轉成 store 要用的 segment table。
 *
 * @param {Array|Object} table - v1 keyframe actionTable 或 v2 segment table
 * @param {{duration?: number}} options
 * @returns {Array} 7×22 的 segment table
 */
export function toSegmentTable(table, { duration = 0 } = {}) {
  if (isSegmentTable(table)) {
    return normalizeSegmentTable(table);
  }

  // v1：先跑和 app 完全相同的正規化（補齊 7×22、排序、頭尾黑點），
  // 再交給已通過閘門測試的轉換器。
  return normalizeSegmentTable(
    actionTableToSegments(normalizeActionTable(table, duration), { duration }),
  );
}

/**
 * 從伺服器 `raw_data` 或本地備份的 envelope 取出光表並轉成 segments。
 *
 * envelope 的歷史包袱：可能是 `{schemaVersion, actionTable, music_filename}`、
 * 可能只是 `{actionTable}`、也可能整包就是裸的 actionTable。
 *
 * @returns {{segmentTable: Array, musicFilename: string|undefined,
 *            audioClips: Array, overlapMs: number}}
 */
export function loadProjectData(payload, { duration = 0 } = {}) {
  const envelope =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : { actionTable: payload };

  const table = envelope.actionTable ?? envelope;

  if (
    envelope.schemaVersion != null &&
    envelope.schemaVersion >= SCHEMA_VERSION &&
    !isSegmentTable(table)
  ) {
    // 版號說是 v2、形狀卻是 keyframe。以形狀為準（見檔頭說明），但要留下痕跡。
    console.warn(
      `[loadProjectData] schemaVersion=${envelope.schemaVersion} 但資料形狀是 keyframe，以形狀為準`,
    );
  }

  const segmentTable = toSegmentTable(table, { duration });

  // 開發時把壞掉的部位印出來。刻意不 throw —— 載入路徑上炸掉等於使用者的
  // 光表打不開，比帶著一點髒資料繼續工作糟糕得多。
  if (import.meta.env?.DEV) {
    const problems = checkSegmentTable(segmentTable);
    if (problems.length > 0) {
      console.warn(
        `[loadProjectData] ${problems.length} 個部位不符合 segment 不變式`,
        problems.slice(0, 5),
      );
    }
  }

  /*
   * 音訊時間軸。舊的存檔只有一個 `music_filename`（單曲），新的帶著整份
   * `audioClips`——`migrateClips` 靠形狀分辨，和光表用同一套原則。
   *
   * 這件事一定要在這裡做：三條載入路徑各自處理的話，只要有一條忘了，
   * 五首歌的專案會被靜靜地載成一首（而且畫面看起來完全正常）。
   */
  return {
    segmentTable,
    musicFilename: envelope.music_filename,
    audioClips: migrateClips(envelope.audioClips, envelope.music_filename),
    overlapMs: Number(envelope.audioOverlapMs) || 0,
  };
}

/**
 * 開發期的健檢：跑一次不變式檢查，把壞掉的部位印出來。
 *
 * 刻意**不 throw** —— 載入路徑上炸掉等於使用者的光表打不開，比帶著一點髒資料
 * 繼續工作糟糕得多。回傳問題清單讓呼叫端決定要不要顯示。
 */
export function checkSegmentTable(segmentTable) {
  const problems = [];

  segmentTable.forEach((armor, armorIdx) => {
    armor.forEach((segments, partIdx) => {
      const errors = validateSegments(segments);
      if (errors.length > 0) {
        problems.push({ armorIdx, partIdx, errors });
      }
    });
  });

  return problems;
}
