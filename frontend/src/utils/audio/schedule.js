/**
 * 把「音訊 clip 的時間軸」換算成 Web Audio 的排程參數。
 *
 * 一個 clip 是一段擺在表演時間軸上的音檔：
 *
 * ```js
 * { id, start, end, sourceFile, sourceOffset, gain, fadeIn, fadeOut }
 * ```
 *
 * `start`/`end` 是**表演時間**（ms，跟燈光色塊同一條軸），`sourceOffset` 是
 * 「從音檔的第幾秒開始取」。目前的單曲就是一個 `{start: 0, end: duration,
 * sourceOffset: 0}` 的 clip，所以這套東西涵蓋現況，不是只為未來寫的。
 *
 * ## 為什麼要事先排好，而不是播完一首再啟動下一首
 *
 * 直覺寫法是等 `onended` 再 `start()` 下一個 clip。那一定會有縫：中間隔了一次
 * JS event loop 加上排程延遲，在安靜的接縫上聽得出來喀一聲，而且 JS 一卡
 * （例如剛好在重繪 154 條時間軸）縫就會變大。
 *
 * `source.start(when, offset, duration)` 的 `when` 是 `AudioContext` 的時間軸，
 * 排程發生在**音訊執行緒**上，接縫是取樣精度的，JS 卡住也不影響。所以按下播放
 * 的當下就把所有 clip 一次排好。
 *
 * ## 三個座標系不要搞混
 *
 * | 座標 | 單位 | 誰在用 |
 * |---|---|---|
 * | 表演時間 | ms | clip 的 start/end、燈光色塊、紅線 |
 * | 音檔內部 | 秒 | `sourceOffset`、`start()` 的 `offset` 與 `duration` |
 * | context 時鐘 | 秒（牆上時間） | `start()` 的 `when` |
 *
 * 倍速只影響**表演時間 ↔ 牆上時間**的換算：2 倍速時表演走 2 秒只花 1 秒牆上
 * 時間。音檔內部的 offset/duration **不受倍速影響**（`playbackRate` 已經替你
 * 處理了），這是最容易寫錯的一點——多除或多乘一次 rate，接縫就會愈跑愈歪。
 */

/** 速率必須是正的有限數，否則當 1（與 clock.js 同一個規則） */
const safeRate = (rate) => (Number.isFinite(rate) && rate > 0 ? rate : 1);

/** 表演時間（ms）→ 牆上時間（秒）。倍速只在這裡出現一次 */
const toWallSeconds = (ms, rate) => ms / 1000 / safeRate(rate);

/** 整場表演有多長 = 最後一個 clip 的結尾 */
export function totalDuration(clips) {
  if (!Array.isArray(clips) || clips.length === 0) return 0;
  return clips.reduce((max, clip) => Math.max(max, clip?.end ?? 0), 0);
}

/** 某個時間點正在響的 clip（接縫重疊時會有兩個） */
export function clipsAt(clips, timeMs) {
  if (!Array.isArray(clips)) return [];
  return clips.filter((clip) => clip.start <= timeMs && clip.end > timeMs);
}

/**
 * 從 `fromMs` 開始播，每個 clip 該用什麼參數 `start()`。
 *
 * @param {Array} clips 音訊 clip（允許在接縫處短暫重疊）
 * @param {object} params
 *   fromMs: 從表演時間的哪裡開始；rate: 播放速率；
 *   contextTime: 現在的 `AudioContext.currentTime`（秒）
 * @returns {Array} `[{clip, when, offset, duration}]`
 *   when: 幾秒後啟動（context 時間軸，絕對值）
 *   offset / duration: 音檔內部的秒數，**不受倍速影響**
 *
 * 已經播完的 clip 不會出現在結果裡；正在播到一半的 clip 會被裁成「剩下的部分」。
 */
export function scheduleFrom(clips, { fromMs = 0, rate = 1, contextTime = 0 } = {}) {
  if (!Array.isArray(clips)) return [];

  const scheduled = [];

  for (const clip of clips) {
    if (!clip || !(clip.end > clip.start)) continue; // 零長度或壞掉的 clip
    if (clip.end <= fromMs) continue; // 已經播完了

    const sourceOffset = clip.sourceOffset ?? 0;

    if (clip.start >= fromMs) {
      // 還沒開始：等播放頭走到它那裡
      scheduled.push({
        clip,
        when: contextTime + toWallSeconds(clip.start - fromMs, rate),
        offset: sourceOffset,
        duration: (clip.end - clip.start) / 1000,
      });
      continue;
    }

    /*
     * 從這個 clip 的中間開始：立刻響，但要從音檔的對應位置取。
     *
     * `offset` 往前推的量是**表演時間的差**除以 1000，不再除 rate——
     * 音檔內部的座標與倍速無關。
     */
    const into = fromMs - clip.start;
    scheduled.push({
      clip,
      when: contextTime,
      offset: sourceOffset + into / 1000,
      duration: (clip.end - fromMs) / 1000,
    });
  }

  return scheduled;
}

/**
 * 淡入淡出在**這個時間點**的音量倍率。
 *
 * 接縫的短暫重疊靠這個：前一個 clip 的尾巴淡出、後一個的開頭淡入，兩段疊在
 * 一起就是交叉淡入淡出。
 *
 * 用線性而不是等功率（equal-power）曲線：等功率在「兩段是不同素材」時比較好聽，
 * 但接縫處通常是同一首歌的收尾接下一首的開頭，線性夠用而且算得出來、測得到。
 * 之後真的需要再換，這裡是唯一要改的地方。
 */
export function fadeGainAt(clip, timeMs) {
  const base = clip?.gain ?? 1;
  if (!clip) return base;

  const fadeIn = clip.fadeIn ?? 0;
  const fadeOut = clip.fadeOut ?? 0;

  if (timeMs <= clip.start) return fadeIn > 0 ? 0 : base;
  if (timeMs >= clip.end) return fadeOut > 0 ? 0 : base;

  let factor = 1;

  if (fadeIn > 0) {
    const into = timeMs - clip.start;
    if (into < fadeIn) factor = Math.min(factor, into / fadeIn);
  }

  if (fadeOut > 0) {
    const left = clip.end - timeMs;
    if (left < fadeOut) factor = Math.min(factor, left / fadeOut);
  }

  return base * factor;
}

/**
 * 一個 clip 的音量包絡要排哪幾個點（context 時間軸，秒）。
 *
 * 回傳 `[{when, value}]`，呼叫端逐點呼叫 `gain.linearRampToValueAtTime`。
 * 從中間開始播時，第一個點是**當下該有的音量**——不補這個點的話，seek 到
 * 淡出的一半會從滿音量開始重新淡出，聽起來像音量突然跳上去。
 */
export function fadeEnvelope(clip, { fromMs = 0, rate = 1, contextTime = 0 } = {}) {
  if (!clip) return [];

  const base = clip.gain ?? 1;
  const fadeIn = clip.fadeIn ?? 0;
  const fadeOut = clip.fadeOut ?? 0;
  const startAt = Math.max(clip.start, fromMs);

  const at = (timeMs) => contextTime + toWallSeconds(timeMs - fromMs, rate);

  // 沒有淡入淡出就是一個固定值，不必排包絡
  if (fadeIn <= 0 && fadeOut <= 0) return [{ when: at(startAt), value: base }];

  const points = [{ when: at(startAt), value: fadeGainAt(clip, startAt) }];

  const fadeInEnd = clip.start + fadeIn;
  if (fadeIn > 0 && fadeInEnd > startAt && fadeInEnd < clip.end) {
    points.push({ when: at(fadeInEnd), value: base });
  }

  const fadeOutStart = clip.end - fadeOut;
  if (fadeOut > 0 && fadeOutStart > startAt) {
    points.push({ when: at(fadeOutStart), value: base });
  }

  if (fadeOut > 0) points.push({ when: at(clip.end), value: 0 });

  return points;
}
