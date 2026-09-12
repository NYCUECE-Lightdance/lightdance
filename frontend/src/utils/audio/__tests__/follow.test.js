/**
 * 跟隨紅線的測試。
 *
 * 這件事壞掉時畫面上看不出是壞的——紅線就是安靜地跑出視窗，看起來像
 * 「播放停了」或「怎麼跳走了」。而且它的反面同樣糟：跟得太黏的話，
 * 播放中想看別的地方會被一直扯回來。所以兩個方向都要測。
 */
import { describe, it, expect } from "vitest";

import { followScroll } from "../follow.js";

/** 視窗 1000 寬、內容 10000 寬的預設場景 */
const view = (lineX, scrollLeft = 0) => ({
  lineX,
  scrollLeft,
  viewportWidth: 1000,
  contentWidth: 10000,
});

describe("followScroll", () => {
  it("紅線還在視窗中間時完全不捲", () => {
    expect(followScroll(view(500))).toBeNull();
    expect(followScroll(view(3500, 3000))).toBeNull();
  });

  it("紅線快要從右邊離開時推一頁", () => {
    // 視窗 [3000, 4000)，邊界留 32px，所以 3968 之後就要推
    const next = followScroll(view(3980, 3000));

    expect(next).not.toBeNull();
    // 推完紅線落在視窗左側 12.5% 的地方
    expect(next).toBe(3980 - 125);
  });

  it("往回 seek 到視窗左邊時也會跟過去", () => {
    const next = followScroll(view(1000, 3000));

    expect(next).toBe(1000 - 125);
  });

  it("⚠️ 已經捲到底時回傳 null，不是回傳同一個數字", () => {
    /*
     * 最後幾秒紅線會超出右緣而捲動位置已經到頂。每一幀都回傳 max 的話，
     * 呼叫端每一幀都寫一次 scrollLeft——使用者在那段時間根本捲不動畫面，
     * 一放手就被扯回去。
     */
    const max = 10000 - 1000;
    expect(followScroll(view(9990, max))).toBeNull();
  });

  it("整條都看得到時不捲（1 倍率）", () => {
    expect(
      followScroll({
        lineX: 500,
        scrollLeft: 0,
        viewportWidth: 1000,
        contentWidth: 800,
      }),
    ).toBeNull();
  });

  it("捲動結果不會超出兩端", () => {
    // 紅線在最前面：不能捲到負的
    expect(followScroll(view(10, 5000))).toBe(0);
    // 紅線在最後面：不能超過 contentWidth - viewportWidth
    expect(followScroll(view(9999, 0))).toBe(9000);
  });

  it("視窗很窄時邊界不會吃掉半個畫面", () => {
    // 視窗只有 40px，固定 32px 的邊界會讓任何位置都算「要離開了」
    const narrow = {
      lineX: 520,
      scrollLeft: 500,
      viewportWidth: 40,
      contentWidth: 10000,
    };
    expect(followScroll(narrow)).toBeNull();
  });

  it("數字不對時不做事，不要讓 NaN 流進捲動位置", () => {
    expect(followScroll(view(NaN, 0))).toBeNull();
    expect(followScroll({ ...view(500), viewportWidth: 0 })).toBeNull();
  });
});
