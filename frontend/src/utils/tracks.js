/**
 * 軌道高度 —— 尺寸與夾緊規則的單一定義處。
 *
 * ## 為什麼從百分比改成像素
 *
 * 舊版是 `flex: 0 0 ${100 / 軌道數}%`：軌道少的時候每條長得很高，超過 7 條
 * 之後改成寫死的 14%。這代表**高度由軌道數決定，使用者說了不算**——加一條
 * 軌道，其他每一條都會變矮。而且左側的軌名欄與右側的時間軸各自算自己的
 * 百分比，兩邊的容器只要有一點高度差，捲動時就會逐漸對不齊。
 *
 * 改成像素之後高度是使用者指定的，加軌只是讓內容變長（容器本來就會捲動），
 * 而且左右兩欄吃同一個數字，對齊是結構上保證的。
 *
 * ## 逐軌覆寫
 *
 * `track.height` 有值時蓋過全域的 `rowHeight`——正在細修的那一條拉高，
 * 其他縮成一條輪廓。沒有這個欄位就跟著全域走。
 */

/** 預設行高。約等於改版前 3 條軌道時的實際高度，換過去不會突然變樣 */
export const DEFAULT_ROW_H = 120;

/** 再矮就連色塊都看不出顏色了 */
export const MIN_ROW_H = 24;

/** 再高一條軌道就佔滿整個編輯區，失去「同時看好幾軌」的意義 */
export const MAX_ROW_H = 320;

/**
 * 低於這個高度時，軌名列收起次要按鈕。
 *
 * 上下移是兩顆 28px 的按鈕疊在一起（56px），低於這個高度它們會被擠爆——
 * 畫得出來但點不到，正是版面稽核第一項在抓的那種東西。
 */
export const COMPACT_ROW_H = 64;

export const clampRowHeight = (height) => {
  const value = Number(height);
  if (!Number.isFinite(value)) return DEFAULT_ROW_H;
  return Math.round(Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, value)));
};

/** 這一條軌道實際要用的高度（逐軌覆寫優先） */
export const trackHeight = (track, rowHeight) =>
  clampRowHeight(track?.height ?? rowHeight);

/** 這個高度要不要收起次要按鈕 */
export const isCompactHeight = (height) => height < COMPACT_ROW_H;

/** 把某一條軌道的高度覆寫成 `height`；傳 null 代表取消覆寫、跟回全域 */
export const withTrackHeight = (tracks, trackId, height) =>
  tracks.map((track) => {
    if (track.id !== trackId) return track;
    if (height === null) {
      const { height: _dropped, ...rest } = track;
      return rest;
    }
    return { ...track, height: clampRowHeight(height) };
  });
