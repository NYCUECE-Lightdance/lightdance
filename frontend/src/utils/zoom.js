/**
 * 時間軸的縮放級別 —— **形狀與換算的唯一定義處**。
 *
 * ## 為什麼要一個檔案來放這個
 *
 * 縮放是**乘法**的：從 1 倍到 2 倍與從 50 倍到 100 倍，看起來是同一件事
 * （寬度都變兩倍）。但舊版整條路徑都是加法：
 *
 * - `+` / `-` 每次加減 `0.05`。從 1 倍走到 100 倍要按 **1980 次**，而在
 *   50 倍時按一下只變 0.1%，畫面上根本看不出來
 * - 滑桿是線性的 1..100，寬度約 100px，所以**一個像素 ≈ 一倍**。而且
 *   `handleZoom` 還做了 `Math.floor`，於是低倍率那一端只走得到 1、2、3
 *   ——「1 倍變 2 倍」是整整放大一倍，拖曳時完全停不到想要的地方
 *
 * 兩個症狀（按鈕太鈍、滑桿太跳）是**同一個根因**：控制項是線性的，而縮放
 * 是幾何的。把兩者都換成幾何級數之後，「每一步的感覺一樣大」在整個範圍內成立。
 *
 * ## 換算
 *
 * 滑桿的位置 `t ∈ [0, 1]` 與縮放 `z` 的關係是
 *
 * ```
 * z = MIN × (MAX / MIN)^t
 * t = log(z / MIN) / log(MAX / MIN)
 * ```
 *
 * 也就是「滑桿位置與 log(縮放) 成正比」。拖到一半就是幾何中點（10 倍），
 * 而不是算術中點（50 倍）——後者會把大半條滑桿浪費在肉眼分不出差別的高倍率上。
 */

/** 最小縮放：整場表演剛好填滿畫面 */
export const MIN_ZOOM = 1;

/** 最大縮放。再放大下去一個 50ms 的格子會比整個畫面還寬 */
export const MAX_ZOOM = 100;

/**
 * 按一次 `+` / `-` 變化的比例。
 *
 * 1.25 表示每按一次寬度變成 1.25 倍。走完 1 → 100 需要
 * `log(100) / log(1.25) ≈ 21` 次——舊版是 1980 次。
 *
 * 選 1.25 而不是 2：後者只要 7 次就到底，但每按一次畫面會跳掉一半的內容，
 * 對不上原本在看的地方。1.25 是「看得出來變了、但還認得出是同一段」的量。
 */
export const ZOOM_RATIO = 1.25;

const clamp = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/** 縮放級別在合理範圍內，而且不是 NaN（分母為 0 的除法會流出 NaN） */
export const normalizeZoom = (zoom) =>
  Number.isFinite(zoom) ? clamp(zoom) : MIN_ZOOM;

/** 放大一格 */
export const zoomIn = (zoom) => clamp(normalizeZoom(zoom) * ZOOM_RATIO);

/** 縮小一格 */
export const zoomOut = (zoom) => clamp(normalizeZoom(zoom) / ZOOM_RATIO);

/** 縮放 → 滑桿位置（0..1） */
export const zoomToSlider = (zoom) =>
  Math.log(normalizeZoom(zoom) / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM);

/** 滑桿位置（0..1）→ 縮放 */
export const sliderToZoom = (position) => {
  const t = Number.isFinite(position) ? Math.min(1, Math.max(0, position)) : 0;
  return clamp(MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** t);
};

/**
 * 顯示用的字串。
 *
 * 沒有讀數的話「現在是幾倍」只能靠滑桿的位置猜，而幾何滑桿的中點是 10 倍
 * 不是 50 倍——猜不出來。低倍率保留一位小數（1.3 與 1.6 的差別看得出來），
 * 10 倍以上取整（10.4 與 10 在畫面上沒有差別）。
 */
export const formatZoom = (zoom) => {
  const value = normalizeZoom(zoom);
  return value < 10 ? `${value.toFixed(1)}×` : `${Math.round(value)}×`;
};
