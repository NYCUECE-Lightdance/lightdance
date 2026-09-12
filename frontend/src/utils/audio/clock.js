/**
 * 播放時鐘 —— 「現在播到第幾毫秒」的唯一算法。
 *
 * `AudioContext.currentTime` 是一個只會往前走的牆上時鐘（秒），它不知道我們從
 * 音檔的哪裡開始播、也不知道速率。要把它換算成「音檔裡的位置」需要一個錨點，
 * 而**錨點的慣例必須只有一種**。
 *
 * ## 慣例
 *
 * ```
 * position(t) = (t - anchor) × rate × 1000      // 毫秒
 * ```
 *
 * `anchor` 是「若一路以目前速率播放，音檔位置 0 會落在哪個 context 時間」。
 * 它不是真的開播時間——變速之後錨點會往前或往後挪，那是正常的。
 *
 * ## 為什麼要抽出來
 *
 * 抽出來之前這件事寫在兩個地方，而且**兩種慣例不一樣**：
 *
 * ```js
 * // 開播時（waveform.jsx）—— 錯的
 * setStartTime(now - offset);
 *
 * // 改速度時（waveform.jsx）—— 對的
 * setStartTime(now - (currentTime / 1000) / rate);
 * ```
 *
 * 把第一種代進 `position(t)`：開播後經過 Δt 秒會得到 `(Δt + offset) × rate`，
 * 而正確答案是 `offset + Δt × rate`。兩者只有在 **rate = 1 或 offset = 0**
 * 時才相等——也就是說「從中間某處開始、用非 1 倍速播放」時位置是錯的。
 * 從 10 秒處用 2 倍速播 5 秒，正確位置是 20 秒，舊公式給 30 秒。
 *
 * 後果不只是紅線畫錯：`currentTime` 是光衣預覽取色的依據，所以變速對拍時
 * **看到的燈光跟聽到的音樂對不上**。
 */

/** 速率必須是正的有限數，否則一律當 1（0 或負值會讓時間倒退或停住） */
const safeRate = (rate) =>
  Number.isFinite(rate) && rate > 0 ? rate : 1;

/**
 * 目前播到音檔的第幾毫秒。
 *
 * @param {object} params
 *   contextTime: `AudioContext.currentTime`（秒）；
 *   anchor: 錨點（秒，見上方慣例）；rate: 播放速率
 * @returns {number} 毫秒，永遠是有限數（算不出來時回傳 0）
 */
export function positionAt({ contextTime, anchor, rate = 1 }) {
  if (!Number.isFinite(contextTime) || !Number.isFinite(anchor)) return 0;
  return (contextTime - anchor) * safeRate(rate) * 1000;
}

/**
 * 反過來：想讓「此刻」的位置是 `positionMs`，錨點該設在哪。
 *
 * 開播、seek、變速三個時機都用這一個函式算錨點——先前開播與變速各算各的，
 * 而且慣例不同。
 */
export function anchorFor({ contextTime, positionMs, rate = 1 }) {
  if (!Number.isFinite(contextTime)) return 0;
  const position = Number.isFinite(positionMs) ? positionMs : 0;
  return contextTime - position / 1000 / safeRate(rate);
}
