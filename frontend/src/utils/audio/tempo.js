import { TICK_MS } from "../../constants/time.js";

/**
 * 節拍格線 —— **形狀與運算的唯一定義處**。
 *
 * ## 速度掛在歌上，不掛在時間上
 *
 * 每首歌一個速度（`clip.bpm`），第一拍落在這首歌開始後的第幾毫秒
 * （`clip.beatAnchor`），幾拍一小節（`clip.beatsPerBar`）。
 *
 * 關鍵在於 **`beatAnchor` 是相對於這個 clip 的**，不是表演時間的絕對毫秒。
 * 歌單可以重排，絕對時間的速度表在使用者把第三首和第四首對調的瞬間就會整片
 * 對到別首歌——而畫面上不會有任何異常，波形照畫、格線照畫，只是每一條都錯了。
 * 位置由 `clip.start + beatAnchor` 推導，和 `fadeIn`/`fadeOut` 同一個做法。
 *
 * 「同一個音檔中途變速」不支援（使用者拍板）。真的遇到的話把那個檔案切成兩個
 * clip 就是了——那本來就是這個資料模型表達得出來的事。
 *
 * ## ⚠️ 50ms 網格才是真相，格線只是輔助線
 *
 * 韌體吃 `floor(ms/TICK_MS)`，而 128 BPM 一拍是 468.75ms、四分之一拍
 * 117.19ms，**都不是 50 的倍數**。所以「一拍長」的色塊不是固定的格數：拍點落在
 * 0、450、950、1400、1900…，相鄰間隔在 9 格和 10 格之間跳，平均下來才是對的。
 *
 * 因此任何「每拍重複一次」的功能都必須**從格線逐點取位置**，不能拿一個固定的
 * 間隔一直加——加法會累積誤差，八小節之後就偏掉半格以上。這裡回傳的是實際的
 * 毫秒位置清單，就是為了讓呼叫端沒有機會自己去加。
 */

/** 沒指定時用的速度 */
export const DEFAULT_BPM = 120;

/** 一小節幾拍 */
export const DEFAULT_BEATS_PER_BAR = 4;

/** 合理的速度範圍。超出的話多半是打錯字，不是真的有那麼快的曲子 */
export const MIN_BPM = 20;
export const MAX_BPM = 300;

/**
 * 格線的層級，由粗到細。使用者拍板**最細到四分之一拍**（三連音先略過）。
 *
 * `perBeat` 是這個層級一拍切幾格；`bar` 是特例，它的間隔由 `beatsPerBar` 決定。
 */
export const LEVELS = ["bar", "beat", "half", "quarter"];

/** 每個層級一拍切幾格（`bar` 另外處理） */
const STEPS_PER_BEAT = { beat: 1, half: 2, quarter: 4 };

/** 相鄰兩條格線至少要隔這麼多像素，否則畫出來是一片實心 */
export const MIN_GAP_PX = 10;

/** 一次最多畫幾條線。密度規則已經擋住了，這是壞資料的最後一道保險 */
const MAX_LINES = 4000;

/** BPM → 一拍幾毫秒 */
export const beatLengthMs = (bpm) => {
  const value = Number(bpm);
  return Number.isFinite(value) && value > 0 ? 60000 / value : 0;
};

/** 把使用者輸入的速度收進合理範圍（壞值退回預設，不是 NaN） */
export function clampBpm(bpm) {
  const value = Number(bpm);
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

/** 一小節幾拍（至少 1，否則小節線會除以零） */
export function clampBeatsPerBar(beats) {
  const value = Number(beats);
  if (!Number.isFinite(value)) return DEFAULT_BEATS_PER_BAR;
  return Math.min(32, Math.max(1, Math.round(value)));
}

/** 第一拍落在這首歌開始後第幾毫秒（負值沒有意義，對齊到網格） */
export function clampAnchor(anchor) {
  const value = Number(anchor);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value / TICK_MS) * TICK_MS;
}

/**
 * 這個縮放程度下，最細畫得到哪一層。
 *
 * 規則和 `TimeRuler` 的刻度密度同一套：由「相鄰兩條至少隔多少像素」推導，
 * 不是寫死「縮放 4 倍以上才畫四分之一拍」——後者換一個視窗寬度就不成立了。
 *
 * @returns {string|null} 最細的層級；連小節線都擠在一起時回傳 `null`（整片不畫）
 */
export function pickLevel({ bpm, beatsPerBar = DEFAULT_BEATS_PER_BAR, pxPerMs }) {
  const beat = beatLengthMs(bpm);
  if (!(beat > 0) || !(pxPerMs > 0)) return null;

  const bars = clampBeatsPerBar(beatsPerBar);

  // 由細到粗找第一個擠得下的
  for (const level of ["quarter", "half", "beat"]) {
    if ((beat / STEPS_PER_BEAT[level]) * pxPerMs >= MIN_GAP_PX) return level;
  }
  if (beat * bars * pxPerMs >= MIN_GAP_PX) return "bar";

  return null;
}

/**
 * 一首歌在指定時間範圍內的格線。
 *
 * @param {object} clip 帶著 `start`/`end`/`bpm`/`beatAnchor`/`beatsPerBar`
 * @param {object} range `{from, to}` 表演時間（ms）
 * @param {string} level `pickLevel` 挑出來的層級
 * @returns {Array<{time: number, level: string, clipId: string}>} 依時間遞增
 *
 * 每一條線都標上它**自己**的層級（落在小節線上的就是 `bar`），呼叫端據此決定
 * 粗細。所以畫四分之一拍時，小節線仍然是小節線——不會變成一排一模一樣的細線。
 */
export function beatLinesForClip(clip, { from = 0, to = Infinity }, level) {
  if (!clip || !level) return [];

  const beat = beatLengthMs(clip.bpm);
  if (!(beat > 0)) return [];

  const beatsPerBar = clampBeatsPerBar(clip.beatsPerBar);
  const perBeat = level === "bar" ? 1 / beatsPerBar : STEPS_PER_BEAT[level];
  const step = beat / perBeat;
  if (!(step > 0)) return [];

  const origin = clip.start + clampAnchor(clip.beatAnchor);
  const lo = Math.max(from, clip.start);
  const hi = Math.min(to, clip.end);
  if (!(hi > lo)) return [];

  /*
   * 從 origin 往兩邊推，不是從 clip.start 開始數。
   *
   * 第一拍幾乎不會剛好落在歌的起點（前奏、淡入），而 origin 之前那一段仍然
   *在這首歌裡、仍然有拍——只從 origin 往後畫的話那一段會是空白。
   */
  const firstIndex = Math.ceil((lo - origin) / step - 1e-9);
  const lastIndex = Math.floor((hi - origin) / step + 1e-9);

  const lines = [];
  for (let i = firstIndex; i <= lastIndex && lines.length < MAX_LINES; i++) {
    const time = origin + i * step;

    // 這一條實際上是第幾拍？（可能是負的，代表在第一拍之前）
    const beatIndex = level === "bar" ? i * beatsPerBar : i / perBeat;
    const onBeat = Number.isInteger(beatIndex);
    // 取模對負數要先補正，否則第一拍之前的小節線判不出來
    const inBar = onBeat
      ? ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar
      : -1;

    lines.push({
      time,
      level: inBar === 0 ? "bar" : onBeat ? "beat" : "sub",
      // 誰畫的。接縫重疊時兩首歌可能在**同一毫秒**各有一條線，呼叫端要拿它
      // 當 key 的一部分——只用時間的話 React 會抱怨重複的 key 並漏畫其中一條
      clipId: clip.id,
    });
  }

  return lines;
}

/**
 * 整場表演的格線。
 *
 * 逐首算再串起來——每首歌有自己的速度與相位，所以這是唯一正確的算法。接縫
 * 重疊的那一段兩首的格線都會出現，那是實話：那段時間兩首確實都在響。
 *
 * @param {Array} clips 已經排好位置的 clip 清單
 * @param {object} view `{from, to, pxPerMs}`
 */
export function beatLines(clips, { from = 0, to = Infinity, pxPerMs = 0 } = {}) {
  if (!Array.isArray(clips) || clips.length === 0) return [];

  const out = [];
  for (const clip of clips) {
    const level = pickLevel({
      bpm: clip.bpm,
      beatsPerBar: clip.beatsPerBar,
      pxPerMs,
    });
    out.push(...beatLinesForClip(clip, { from, to }, level));
  }

  return out.sort((a, b) => a.time - b.time);
}
