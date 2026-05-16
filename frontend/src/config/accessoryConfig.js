// 各舞者配件設定（armorIndex 從 0 開始，舞者N = armorIndex N-1）
export const ACCESSORY_CONFIGS = {
  1: {
    name: "雨傘",
    groups: [
      { label: "傘", indices: [14, 15] },
    ],
  },
  2: {
    name: "螢光繩",
    groups: [
      { label: "繩", indices: [14, 15] },
    ],
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

// 判斷某舞者的某 part 是否可編輯
export const isPartAllowed = (armorIndex, partIndex) => {
  if (partIndex < 14) return true;
  const config = ACCESSORY_CONFIGS[armorIndex];
  if (!config) return false;
  return config.groups.some((g) => g.indices.includes(partIndex));
};
