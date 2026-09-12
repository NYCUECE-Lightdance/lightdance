/**
 * RGBA 顏色的基本運算 —— segment 色彩層最底下的一塊。
 *
 * 從 `color.js` 拆出來的理由是**避免循環相依**：`effects.js`（頻閃展開）需要
 * 顏色插值，而 `color.js` 的 `getColorAt` 需要問 `effects.js`「這一格是亮是滅」。
 * 兩邊互相 import 在 ES module 下雖然跑得起來（都只在函式裡呼叫，不在模組層），
 * 但那是靠時序矇混過去的，換一個打包器或多一個 import 就可能踩到 TDZ。
 * 把兩邊都需要的東西放到共同的下層，依賴方向就永遠是單向的：
 *
 * ```
 * rgba.js  ←  color.js
 *    ↑            ↓
 *    └───── effects.js
 * ```
 *
 * `color.js` 會把這裡的東西原樣 re-export，所以既有的 import 路徑不必改。
 *
 * ⚠️ 這裡的 `A` 是 **LED 亮度**，不是繪圖用的透明度。它會被打包成 7-bit
 * （`(A*127)<<1`），所以保持浮點數到最後一刻，不要提早四捨五入。
 */

export const BLACK = Object.freeze({ R: 0, G: 0, B: 0, A: 1 });

/** 複製一份顏色並補齊預設值，避免呼叫端共用同一個物件 */
export const cloneColor = (color) => ({
  R: color?.R ?? 0,
  G: color?.G ?? 0,
  B: color?.B ?? 0,
  A: color?.A ?? 1,
});

export const isBlackColor = (color) =>
  (color?.R ?? 0) === 0 && (color?.G ?? 0) === 0 && (color?.B ?? 0) === 0;

export const sameColor = (a, b) =>
  (a?.R ?? 0) === (b?.R ?? 0) &&
  (a?.G ?? 0) === (b?.G ?? 0) &&
  (a?.B ?? 0) === (b?.B ?? 0) &&
  (a?.A ?? 1) === (b?.A ?? 1);

/**
 * 兩色之間線性插值，`ratio` 為 0 時回傳 `from`、1 時回傳 `to`。
 *
 * RGB 四捨五入成整數（韌體吃的是 8-bit 通道），alpha 保持浮點——
 * 它在打包時才會被量化成 7-bit。等同 C++ 的 `std::lerp` 逐通道版本。
 */
export const lerpColor = (from, to, ratio) => {
  const t = Math.max(0, Math.min(1, ratio));
  return {
    R: Math.round((from?.R ?? 0) * (1 - t) + (to?.R ?? 0) * t),
    G: Math.round((from?.G ?? 0) * (1 - t) + (to?.G ?? 0) * t),
    B: Math.round((from?.B ?? 0) * (1 - t) + (to?.B ?? 0) * t),
    A: (from?.A ?? 1) * (1 - t) + (to?.A ?? 1) * t,
  };
};
