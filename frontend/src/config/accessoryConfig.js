import { BODY_PART_COUNT, PART_COUNT } from "../constants/parts.js";

/**
 * 各舞者的配件（武器）設定。
 *
 * `indices` 指的是 `PARTS` 裡的部位索引，必須落在**飾品區間**
 * `[BODY_PART_COUNT, PART_COUNT)` 內 —— 身體部位每位舞者都有，
 * 不需要也不該寫在這裡。
 *
 * 沒有列在這裡的舞者 = 沒有配件，飾品燈全部不可編輯。
 *
 * ⚠️ 改 `constants/parts.js` 的部位清單時，這裡的 indices 會跟著位移。
 *    `partsConfig.test.js` 會檢查每個 index 是否還落在合法範圍內。
 *
 * armorIndex 從 0 開始（舞者 N = armorIndex N−1）。
 */
export const ACCESSORY_CONFIGS = {
  1: {
    name: "雨傘",
    groups: [{ label: "傘", indices: [14, 15] }],
  },
  2: {
    name: "螢光繩",
    groups: [{ label: "繩", indices: [14, 15] }],
  },
  3: {
    name: "刀",
    groups: [
      { label: "刀身", indices: [14, 15, 16, 17] },
      { label: "握把", indices: [18, 19] },
      { label: "刀柄", indices: [20, 21] },
    ],
  },
  4: {
    name: "匕首",
    groups: [
      { label: "刀身", indices: [14, 15] },
      { label: "握把", indices: [16, 17] },
      { label: "刀柄", indices: [18] },
    ],
  },
  6: {
    name: "匕首",
    groups: [
      { label: "刀身", indices: [14, 15] },
      { label: "握把", indices: [16, 17] },
      { label: "刀柄", indices: [18] },
    ],
  },
};

/**
 * 某位舞者的某個部位是否可編輯。
 *
 * 身體部位每位舞者都有；飾品燈只有配置裡列出來的才有。
 */
export const isPartAllowed = (armorIndex, partIndex) => {
  // 邊界由 constants/parts.js 推導，不寫死 14——加減身體部位時會自動跟上
  if (partIndex < 0 || partIndex >= PART_COUNT) return false;
  if (partIndex < BODY_PART_COUNT) return true;

  const config = ACCESSORY_CONFIGS[armorIndex];
  if (!config) return false;
  return config.groups.some((group) => group.indices.includes(partIndex));
};
