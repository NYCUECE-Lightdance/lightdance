/**
 * 播放時時間軸要不要跟著紅線捲動 —— **唯一的判斷處**。
 *
 * ## 為什麼需要
 *
 * 舊版的捲動 effect 讀了 `currentTime`，但相依陣列是
 * `[zoomValue, canvasWidth, duration, scrollRef]`——`currentTime` **不在裡面**。
 * 所以它只在縮放改變的那一瞬間用當下的位置置中一次，播放時完全不跟。
 * 1 倍率下看不出來（整場都在畫面上），放大到 20 倍時紅線幾秒鐘就跑出視窗，
 * 而那正是使用者在對拍的時候。
 *
 * ## 為什麼不是「一直置中」
 *
 * 無條件跟隨會讓「播放中想看別的地方」變成拉走又被拉回來，使用者根本捲不動。
 * 所以是 DAW 的做法：**只在紅線快要離開視窗時推一頁**，平常完全不碰捲動位置。
 * 推完紅線落在視窗偏左的地方，剩下的寬度就是接下來看得到的內容。
 *
 * 「使用者自己捲過就不要再跟」那一段由呼叫端負責（它才知道一次捲動是誰發的），
 * 這裡只回答「以現在的位置，該不該捲、捲到哪」。
 */

/** 紅線離視窗邊緣多近就算要離開了（像素） */
const EDGE_PX = 32;

/** 推一頁之後紅線落在視窗的哪裡（0 = 貼左、0.5 = 置中） */
const LANDING = 0.125;

/**
 * @param {object} view
 * @param {number} view.lineX 紅線在內容座標系裡的位置（px）
 * @param {number} view.scrollLeft 目前捲動位置
 * @param {number} view.viewportWidth 看得到的寬度
 * @param {number} view.contentWidth 內容總寬度
 * @returns {number|null} 新的 scrollLeft；不需要捲時回傳 **null**
 */
export function followScroll({
  lineX,
  scrollLeft,
  viewportWidth,
  contentWidth,
}) {
  // 整條都看得到就沒有「跟」這回事（1 倍率時就是這個情況）
  if (!(viewportWidth > 0) || !(contentWidth > viewportWidth)) return null;
  if (!Number.isFinite(lineX) || !Number.isFinite(scrollLeft)) return null;

  // 視窗很窄時 32px 可能比半個視窗還寬，那樣永遠都算「要離開了」
  const edge = Math.min(EDGE_PX, viewportWidth / 4);

  const stillVisible =
    lineX >= scrollLeft + edge && lineX <= scrollLeft + viewportWidth - edge;
  if (stillVisible) return null;

  const max = contentWidth - viewportWidth;
  const next = Math.max(0, Math.min(lineX - viewportWidth * LANDING, max));

  /*
   * ⚠️ **已經捲到底就回傳 null，不要回傳同一個數字。**
   *
   * 一首歌的最後幾秒紅線會超出右緣，但捲動位置已經到頂了。不擋的話這裡每一幀
   * 都會回傳「捲到 max」，呼叫端每一幀都寫一次 `scrollLeft`——使用者在那段
   * 時間完全沒辦法把畫面捲到別的地方，一放手就被扯回去。
   */
  return Math.abs(next - scrollLeft) < 1 ? null : next;
}

export default followScroll;
