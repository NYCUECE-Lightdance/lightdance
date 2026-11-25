/**
 * 演出年份。每一年的光表存在各自的資料庫（見 `backend/seasons.py`）。
 *
 * `state.profiles.season` 是 `null` 時代表「今年」。⚠️ **前端不自己算年份**：
 * 沒選的時候請求就不帶 `year`，由後端決定今年是哪一年。「7 月起算隔年的演出」
 * 這條規則只定義在後端一個地方，兩邊各算一次遲早會對不上——而對不上的症狀是
 * 存檔成功、清單卻看不到，因為存進了另一年。
 */

/** 在網址後面接上 `year=`；`season` 是 null（今年）就原樣回傳 */
export function withSeason(url, season) {
  if (season == null) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}year=${encodeURIComponent(season)}`;
}

/** 目前選的演出年份；`null` = 今年 */
export const selectSeason = (state) => state.profiles.season ?? null;
