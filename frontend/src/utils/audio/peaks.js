/**
 * 波形峰值的運算 —— `waveform.jsx` 裡唯一有邏輯的部分，抽出來才測得到。
 *
 * `waveform.jsx` 是專案裡最後一個沒拆過的大檔（Phase 3 拆了 audioplayer，
 * 它留著沒動）。裡面混了四件事：解碼音檔、算峰值、畫 canvas、跑播放引擎。
 * 這個檔案先拿走**純運算**那一塊——它不碰 DOM、不碰 AudioContext、不碰 React，
 * 所以邊界條件可以在 jsdom 裡窮舉。
 *
 * 剩下三件事之後再拆；播放引擎（單一 `sourceNode`）是多軌音訊的唯一前置，
 * 動它的風險比這裡高得多，值得單獨一次。
 *
 * ## 兩層降取樣
 *
 * 音檔解碼出來是幾百萬個取樣點，畫面上只有一兩千個像素，所以要降兩次：
 *
 * 1. **解碼後一次**（`computePeaks`）：整首歌 → 20 萬個桶，存進 redux。
 *    這一份跟縮放無關，算一次就好。
 * 2. **每次重繪**（`visibleRange` + `resamplePeaks`）：從那 20 萬個裡取出
 *    目前捲到的那一段，再降到畫得下的柱數。
 *
 * ## 為什麼每個函式都要防除以零
 *
 * 靜音的音檔、還沒量到寬度的容器、捲動位置超出範圍——這些都會讓某個分母變成
 * 0，而 `0/0` 是 `NaN`，`NaN` 傳進 `fillRect` **不會報錯，只是什麼都不畫**。
 * 波形就這樣消失了，而 console 一片乾淨。這種安靜的失敗比丟例外難查得多，
 * 所以每個除法都明確處理分母為 0 的情形。
 */

/**
 * 從單聲道取樣資料算出峰值（每個桶取絕對值的最大值）。
 *
 * @param {Float32Array|Array} channelData 解碼後的取樣點
 * @param {number} buckets 要分成幾個桶
 * @returns {number[]} 每個桶的峰值，尚未正規化
 */
/**
 * 峰值容器的判斷 —— 一般陣列與 TypedArray 都算。
 *
 * `Array.isArray` 對 `Float32Array` 回傳 false，所以改用型別之後每一個
 * 守衛都要跟著換，不然整條路徑會靜靜地退化成「沒有峰值」而畫出空白波形。
 */
const isPeaks = (value) =>
  Array.isArray(value) || ArrayBuffer.isView(value);

export function computePeaks(channelData, buckets = 200000) {
  const length = channelData?.length ?? 0;
  if (!length || buckets <= 0) return [];

  const blockSize = length / buckets;
  /*
   * `Float32Array` 而不是一般陣列：峰值只是 0..1 的振幅，單精度綽綽有餘，
   * 而一般陣列每格 8 bytes。20 萬個桶就是 1.6MB → 0.8MB，一首歌省一半，
   * 而且掃描的迴圈跑在 typed array 上也比較快。
   */
  const peaks = new Float32Array(buckets);

  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * blockSize);
    // 桶比取樣點還細的時候 end 會等於 start，至少取一個點，否則整桶是 0
    const end = Math.max(Math.floor(start + blockSize), start + 1);

    let max = 0;
    for (let j = start; j < end && j < length; j++) {
      const value = Math.abs(channelData[j]);
      if (value > max) max = value;
    }
    peaks[i] = max;
  }

  return peaks;
}

/**
 * 把峰值等比縮放到 `[0, 1]`。
 *
 * 全部是 0（靜音的音檔）時原樣回傳一整排 0，**不要除下去**——那會得到一整排
 * `NaN`，而 `NaN` 傳進 `fillRect` 不會報錯，只是什麼都不畫。
 */
export function normalizePeaks(peaks) {
  if (!isPeaks(peaks) || peaks.length === 0) return [];

  let max = 0;
  for (const peak of peaks) if (peak > max) max = peak;
  if (max <= 0) return peaks.map(() => 0);

  return peaks.map((peak) => peak / max);
}

/** 解碼後走一次：整首歌 → 正規化的峰值陣列 */
export const peaksFromChannel = (channelData, buckets) =>
  normalizePeaks(computePeaks(channelData, buckets));

/**
 * 把多首歌的峰值依各自在時間軸上的位置拼成一條。
 *
 * 波形是**整場表演**的圖，不是「目前這首歌」的圖——五首歌接在一起時使用者要
 * 看到的是一條從 0 到全長的波形，接縫在哪裡一眼看得出來。
 *
 * @param {Array} pieces `[{peaks, start, lengthMs}]`，`start` 是表演時間（ms）
 * @param {object} options durationMs: 整場總長；buckets: 輸出幾個桶
 * @returns {number[]} 正規化後的峰值
 *
 * 接縫重疊處取**兩首的較大值**：那段時間兩首確實都在響，取大值畫出來的形狀
 * 才對得上聽到的東西（取平均會讓接縫憑空凹下去一塊）。
 */
export function stitchPeaks(pieces, { durationMs = 0, buckets = 200000 } = {}) {
  if (!Array.isArray(pieces) || pieces.length === 0) return [];
  if (!(durationMs > 0) || !(buckets > 0)) return [];

  // Float32Array 預設就是 0，不必再 fill 一次
  const out = new Float32Array(buckets);

  for (const piece of pieces) {
    const peaks = piece?.peaks;
    const lengthMs = piece?.lengthMs ?? 0;
    if (!isPeaks(peaks) || peaks.length === 0 || !(lengthMs > 0)) continue;

    /*
     * 桶的範圍由**起點與終點各自換算**，不是「起點 + 長度換算出來的桶數」。
     * 後者會在最後一首的尾巴留下一兩個沒被填到的桶（兩次四捨五入湊不齊），
     * 而沒填到就是 0 —— 波形的最右邊會憑空缺一小塊。
     */
    const start = piece.start ?? 0;
    const from = Math.max(
      0,
      Math.min(buckets, Math.floor((start / durationMs) * buckets)),
    );
    const to = Math.max(
      from + 1,
      Math.min(buckets, Math.round(((start + lengthMs) / durationMs) * buckets)),
    );
    const count = Math.min(buckets - from, to - from);
    if (count <= 0) continue;

    /*
     * 目標桶數可能比來源多（很短的歌），這時 `resamplePeaks` 會原樣回傳而不補值
     * ——直接用的話後面那一段會留著 0，波形上出現一塊憑空的空白。所以放大時
     * 改用最近鄰重複取樣。
     */
    const scaled =
      peaks.length >= count
        ? resamplePeaks(peaks, count)
        : Array.from(
            { length: count },
            (_, i) => peaks[Math.floor((i * peaks.length) / count)],
          );

    for (let i = 0; i < scaled.length; i++) {
      const at = from + i;
      if (at >= buckets) break;
      if (scaled[i] > out[at]) out[at] = scaled[i];
    }
  }

  return normalizePeaks(out);
}

/**
 * 目前捲到的那一段對應峰值陣列的哪一段。
 *
 * @param {object} view
 *   scrollLeft: 捲動位置（px）；viewportWidth: 看得到的寬度（px）；
 *   contentWidth: 整條波形的寬度（px，會隨縮放變大）；peakCount: 峰值總數
 * @returns {{start: number, end: number}} 半開區間，永遠落在 `[0, peakCount]`
 *   且 `end >= start`
 */
export function visibleRange({
  scrollLeft = 0,
  viewportWidth = 0,
  contentWidth = 0,
  peakCount = 0,
}) {
  // 容器還沒量到寬度（掛載的第一幀就會遇到）→ 除下去會得到 NaN，
  // 而 NaN 一路流到 slice 會得到空陣列、再流到 Math.max 會得到 -Infinity
  if (!(contentWidth > 0) || !(peakCount > 0)) return { start: 0, end: 0 };

  const clamp = (value) => Math.max(0, Math.min(peakCount, Math.floor(value)));

  const start = clamp((scrollLeft / contentWidth) * peakCount);
  const end = clamp(((scrollLeft + viewportWidth) / contentWidth) * peakCount);

  return { start, end: Math.max(start, end) };
}

/**
 * 把一段峰值降到指定的柱數（每根柱取該區間的平均）。
 *
 * 取平均而不是取最大：畫面上柱子很密的時候，取最大會讓整片波形貼齊上緣，
 * 看不出強弱。
 *
 * 來源比目標還短時（放得很大的時候）不會補值，回傳的長度就是來源長度——
 * 呼叫端依實際長度分配柱寬即可。
 */
export function resamplePeaks(peaks, targetCount) {
  if (!isPeaks(peaks) || peaks.length === 0 || targetCount <= 0) return [];
  if (peaks.length <= targetCount) return peaks.slice();

  const factor = peaks.length / targetCount;
  const out = new Float32Array(targetCount);

  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * factor);
    const end = Math.max(Math.floor((i + 1) * factor), start + 1);

    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      sum += peaks[j];
      count++;
    }
    out[i] = count ? sum / count : 0;
  }

  return out;
}

/**
 * 一次算完「這一幀要畫哪些柱子」。
 *
 * 把 `visibleRange` → `slice` → `resamplePeaks` → 再正規化一次串起來，
 * 讓繪圖那一端只剩「拿數字畫方塊」。最後那次正規化是為了讓安靜的段落也看得見
 * 起伏——不重新正規化的話，整首歌最大聲的地方決定了所有段落的高度，
 * 放大看某個小聲的段落時會是一條貼著中線的細線。
 */
export function peaksForViewport(peaks, view, targetCount = 1000) {
  const { start, end } = visibleRange({ ...view, peakCount: peaks?.length ?? 0 });
  if (end <= start) return [];
  return normalizePeaks(resamplePeaks(peaks.slice(start, end), targetCount));
}
