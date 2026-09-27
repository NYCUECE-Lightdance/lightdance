/**
 * 舞者與部位定義 — **全專案唯一的來源**。
 *
 * ============================================================
 * 要改人數或部位，只需要動這個檔案
 * ============================================================
 *
 * ## 改舞者人數
 *
 * 改 `PLAYER_COUNT` 一個數字就好。其餘（初始光表、舞者顯示開關、
 * ControlPanel 的全選欄位、People 渲染幾套光衣）全部是從它推導出來的。
 *
 * ## 改部位
 *
 * 在 `PARTS` 增刪一列。`PART_COUNT` / `PART_KEYS` / `PART_LABELS` /
 * `BODY_PART_COUNT` 都會跟著變。三件事要一起想：
 *
 * 1. **韌體 ABI**：`PART_KEYS` 的順序就是上傳時每一列的欄位順序。
 *    韌體那端也要跟著改，否則解析會錯位。已由
 *    `buildPlayers.golden.test.js` 的「韌體 ABI」測試鎖定 ——
 *    改了以後那個測試會紅，**那是提醒不是阻礙**，確認韌體同步後更新 golden。
 *
 * 2. **`type: "body"` 的部位在光衣 SVG 上要有對應圖形**（`Armor.jsx`）。
 *    SVG 是手繪的，沒辦法自動生成。忘了畫的話 `partsConfig.test.js`
 *    會指出哪個部位沒有圖形。
 *
 * 3. **`type: "accessory"` 的部位歸 `config/accessoryConfig.js` 管**，
 *    那裡的 indices 必須落在飾品區間內，同樣有測試檢查。
 *
 * ## 為什麼集中
 *
 * 這份清單原本在 5 個檔案裡有 6 份複本（英文 key 兩份、中文 label 三份、
 * 外加一份過時的 7 部位版本），任何增減都得同步改好幾處，很容易漏。
 */

export const PARTS = [
  { key: "hat", label: "帽子", type: "body" },
  { key: "face", label: "臉", type: "body" },
  { key: "chestL", label: "左胸", type: "body" },
  { key: "chestR", label: "右胸", type: "body" },
  { key: "armL", label: "左手臂", type: "body" },
  { key: "armR", label: "右手臂", type: "body" },
  { key: "tie", label: "領帶", type: "body" },
  { key: "belt", label: "腰帶", type: "body" },
  { key: "gloveL", label: "左手套", type: "body" },
  { key: "gloveR", label: "右手套", type: "body" },
  { key: "legL", label: "左腿", type: "body" },
  { key: "legR", label: "右腿", type: "body" },
  { key: "shoeL", label: "左鞋", type: "body" },
  { key: "shoeR", label: "右鞋", type: "body" },
  { key: "acc0", label: "配件1", type: "accessory" },
  { key: "acc1", label: "配件2", type: "accessory" },
  { key: "acc2", label: "配件3", type: "accessory" },
  { key: "acc3", label: "配件4", type: "accessory" },
  { key: "acc4", label: "配件5", type: "accessory" },
  { key: "acc5", label: "配件6", type: "accessory" },
  { key: "acc6", label: "配件7", type: "accessory" },
  { key: "acc7", label: "配件8", type: "accessory" },
];

/** 舞者人數。改這一個數字就能增減舞者。 */
export const PLAYER_COUNT = 7;

// ── 以下全部由上面兩者推導，不要手動改 ──────────────────────

/** 韌體欄位名稱，順序即 ABI */
export const PART_KEYS = PARTS.map((part) => part.key);

/** UI 顯示用的中文名稱 */
export const PART_LABELS = PARTS.map((part) => part.label);

/** 每位舞者的部位數 */
export const PART_COUNT = PARTS.length;

/** 身體部位的數量，索引 >= 此值即為飾品燈 */
export const BODY_PART_COUNT = PARTS.filter(
  (part) => part.type === "body",
).length;

/** `[0, 1, 2, ... PLAYER_COUNT-1]`，取代散落各處的 `Array.from({length: 7})` */
export const PLAYER_INDICES = Array.from({ length: PLAYER_COUNT }, (_, i) => i);

/** `[0, 1, 2, ... PART_COUNT-1]` */
export const PART_INDICES = Array.from({ length: PART_COUNT }, (_, i) => i);

/** 某個部位是不是飾品燈（相對於身體部位） */
export const isAccessoryPart = (partIndex) => partIndex >= BODY_PART_COUNT;

/**
 * 產生一張空的光表：`PLAYER_COUNT × PART_COUNT`，每個部位一個空陣列。
 *
 * segment 模型的「全部熄滅」就是沒有任何 segment，不需要放黑點。
 * 初始化與「開新專案」共用這一份，避免兩邊的形狀走鐘。
 */
export const createEmptyActionTable = () =>
  Array.from({ length: PLAYER_COUNT }, () =>
    Array.from({ length: PART_COUNT }, () => []),
  );
