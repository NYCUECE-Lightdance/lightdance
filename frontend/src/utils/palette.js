import { cloneColor } from "./segments/color.js";

/**
 * 調色盤的形狀與不變式 —— **最愛色與最近使用色的唯一定義處**。
 *
 * 兩份清單長得很像但語意相反：
 *
 * | | 最愛色 | 最近使用 |
 * |---|---|---|
 * | 誰決定內容 | 使用者明確存的 | 系統自動記的 |
 * | 空格 | `null`（還沒存） | 不會有（不夠就是短的） |
 * | 順序 | 使用者放哪就在哪（快捷鍵 1~6 靠這個） | 最新的在最前面 |
 *
 * 空格用 `null` 而不是白色是這一版才改的。先前補的是
 * `{R:255,G:255,B:255,A:1}`，於是「還沒存過的格子」與「刻意存了白色」
 * 在畫面上完全一樣——而白色是最常用的燈色之一，不能拿它當哨兵。
 */

/** 最愛色的格數。1~6 的快捷鍵直接對應這六格，所以改這個數字要一起改 keymap */
export const FAVORITE_SLOTS = 6;

/** 最近使用保留幾筆。多於一列會把下面的控制項推出這一欄（只有 200px 寬） */
export const RECENT_SLOTS = 6;

/** `#RRGGBB`（大小寫皆可）才算合法，避免半途輸入就去改顏色 */
export const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value ?? 0)));

/** `{R,G,B}` → `#RRGGBB`（大寫）。alpha 是亮度，不進色碼 */
export const rgbToHex = (color) =>
  `#${["R", "G", "B"]
    .map((key) => clampChannel(color?.[key]).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

/** `#RRGGBB` → `{R,G,B}`。不合法時回傳 null，呼叫端自己決定要不要忽略 */
export const hexToRgb = (hex) => {
  if (!HEX_PATTERN.test(hex ?? "")) return null;
  return {
    R: parseInt(hex.slice(1, 3), 16),
    G: parseInt(hex.slice(3, 5), 16),
    B: parseInt(hex.slice(5, 7), 16),
  };
};

/**
 * 只比色相，不比亮度。
 *
 * 「最近使用」用這個去重：拉亮度滑桿時每一格都會 dispatch 一次
 * `UPDATECHOSENCOLOR`，若連 alpha 一起比，拉一次就會把整份清單塞滿
 * 同一個顏色的十幾種亮度，把真正用過的別的顏色擠掉。
 */
export const sameRgb = (a, b) =>
  (a?.R ?? 0) === (b?.R ?? 0) &&
  (a?.G ?? 0) === (b?.G ?? 0) &&
  (a?.B ?? 0) === (b?.B ?? 0);

/**
 * 把一個顏色推到「最近使用」的最前面。
 *
 * 已經在清單裡的話是**移到最前面並更新亮度**，不是新增一筆——否則同一個
 * 顏色會佔掉好幾格。內容完全沒變時回傳原陣列，讓 reducer 可以用 reference
 * 判斷要不要換 state（拉滑桿時每一格都會走到這裡）。
 */
export const pushRecentColor = (list, color, limit = RECENT_SLOTS) => {
  if (!color) return Array.isArray(list) ? list : [];
  const current = Array.isArray(list) ? list : [];
  const next = cloneColor(color);

  const head = current[0];
  if (head && sameRgb(head, next) && (head.A ?? 1) === next.A) return current;

  return [next, ...current.filter((item) => !sameRgb(item, next))].slice(
    0,
    limit,
  );
};

/**
 * 把存起來的最愛色收成固定長度的一維陣列，空格是 `null`。
 *
 * 靠形狀辨認舊資料，不看版本號（和 `utils/worksets.js` 同一套做法）：
 * 舊版存的是二維 `[[c, c, c, c, c, c]]`，因為色票曾經排成 4×2 與 2×3。
 * 攤平之後那個維度就沒有意義了——格數與排版是 CSS 的事，資料只需要「第幾格」。
 *
 * 舊資料裡真的存在的白色會原樣保留：白色是合法的燈色，不能事後把它當成空格
 * 清掉（那等於刪掉使用者存的東西）。
 */
export const normalizeFavorites = (stored, slots = FAVORITE_SLOTS) => {
  const flat = Array.isArray(stored) ? stored.flat() : [];
  return Array.from({ length: slots }, (_, i) => {
    const item = flat[i];
    return item && typeof item === "object" ? cloneColor(item) : null;
  });
};

/** 已經是正規形狀的話回傳 true，讓呼叫端跳過不必要的 dispatch */
export const isNormalizedFavorites = (stored, slots = FAVORITE_SLOTS) =>
  Array.isArray(stored) &&
  stored.length === slots &&
  stored.every((item) => item === null || (!!item && !Array.isArray(item)));

/** 寫入某一格；`color` 傳 null 就是清空那一格 */
export const setFavoriteSlot = (list, index, color) => {
  const current = normalizeFavorites(list);
  if (index < 0 || index >= current.length) return current;
  const next = current.slice();
  next[index] = color ? cloneColor(color) : null;
  return next;
};

/**
 * 快捷鍵 1~6 要套的顏色。
 *
 * 超出格數或那一格是空的就回傳 null（呼叫端跳過）。先前這段邏輯在
 * audioplayer 裡用 `favoriteColor[row % rows][col]` 換算二維座標，色票收成
 * 一列六格之後 **7 與 8 會繞回第 1、2 格**——按 7 套到的是第 1 格的顏色，
 * 而畫面上沒有任何東西顯示這件事。
 */
export const favoriteColorAt = (stored, index) => {
  const flat = normalizeFavorites(stored);
  return flat[index] ?? null;
};
