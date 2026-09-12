import { describe, expect, it } from "vitest";

import { anchorFor, positionAt } from "../clock.js";

/** 在 `contextTime` 開始播、位置是 `positionMs`，然後過 `elapsed` 秒 */
const playFrom = ({ startedAt = 100, positionMs, rate, elapsed }) => {
  const anchor = anchorFor({ contextTime: startedAt, positionMs, rate });
  return positionAt({ contextTime: startedAt + elapsed, anchor, rate });
};

describe("播放時鐘", () => {
  it("1 倍速從頭播：牆上時間就是音檔位置", () => {
    expect(playFrom({ positionMs: 0, rate: 1, elapsed: 5 })).toBeCloseTo(5000);
  });

  it("1 倍速從中間播：加上起始位置", () => {
    expect(playFrom({ positionMs: 10000, rate: 1, elapsed: 5 })).toBeCloseTo(15000);
  });

  it("2 倍速從頭播：音檔走得比牆上時間快一倍", () => {
    expect(playFrom({ positionMs: 0, rate: 2, elapsed: 5 })).toBeCloseTo(10000);
  });

  /*
   * 這一項就是舊公式錯的地方。
   *
   * 舊版錨點是 `now - offset`（沒有除以 rate），代進 `(t - anchor) × rate`
   * 得到 `(Δt + offset) × rate` = (5 + 10) × 2 = 30 秒。
   * 正確答案是 offset + Δt × rate = 10 + 10 = 20 秒。
   */
  it("2 倍速從第 10 秒播 5 秒 → 20 秒（舊公式會給 30 秒）", () => {
    expect(playFrom({ positionMs: 10000, rate: 2, elapsed: 5 })).toBeCloseTo(20000);
  });

  it("0.5 倍速從第 10 秒播 4 秒 → 12 秒", () => {
    expect(playFrom({ positionMs: 10000, rate: 0.5, elapsed: 4 })).toBeCloseTo(12000);
  });

  it("剛設好錨點的那一刻，位置就是指定的位置", () => {
    for (const rate of [0.5, 1, 2, 3]) {
      expect(playFrom({ positionMs: 7350, rate, elapsed: 0 })).toBeCloseTo(7350);
    }
  });

  it("錨點與位置互為反函數", () => {
    const contextTime = 42.5;
    for (const rate of [0.25, 1, 1.5, 4]) {
      for (const positionMs of [0, 1, 12345, 300000]) {
        const anchor = anchorFor({ contextTime, positionMs, rate });
        expect(positionAt({ contextTime, anchor, rate })).toBeCloseTo(positionMs);
      }
    }
  });

  /*
   * 播放中改速度：先問現在播到哪，再用新速率重設錨點。位置必須連續——
   * 換速度的瞬間跳一下的話，紅線會抖、預覽的顏色也會跳一格。
   */
  it("播放中改速度，位置是連續的", () => {
    const rate1 = 1;
    const anchor1 = anchorFor({ contextTime: 0, positionMs: 0, rate: rate1 });
    const atSwitch = positionAt({ contextTime: 8, anchor: anchor1, rate: rate1 });
    expect(atSwitch).toBeCloseTo(8000);

    const rate2 = 2;
    const anchor2 = anchorFor({ contextTime: 8, positionMs: atSwitch, rate: rate2 });
    // 換速度的當下位置不變
    expect(positionAt({ contextTime: 8, anchor: anchor2, rate: rate2 })).toBeCloseTo(8000);
    // 之後以新速率前進
    expect(positionAt({ contextTime: 11, anchor: anchor2, rate: rate2 })).toBeCloseTo(14000);
  });

  it("時間往前走，位置就往前走", () => {
    const anchor = anchorFor({ contextTime: 0, positionMs: 0, rate: 1 });
    let previous = -1;
    for (let t = 0; t < 10; t += 0.5) {
      const now = positionAt({ contextTime: t, anchor, rate: 1 });
      expect(now).toBeGreaterThan(previous);
      previous = now;
    }
  });
});

describe("壞掉的輸入", () => {
  it("速率是 0 或負數時當成 1，不會讓時間停住或倒退", () => {
    for (const rate of [0, -1, NaN, undefined, null]) {
      expect(playFrom({ positionMs: 0, rate, elapsed: 3 })).toBeCloseTo(3000);
    }
  });

  it("context 時間還沒有的時候回傳 0，不是 NaN", () => {
    expect(positionAt({ contextTime: undefined, anchor: 0, rate: 1 })).toBe(0);
    expect(positionAt({ contextTime: 1, anchor: NaN, rate: 1 })).toBe(0);
  });

  it("位置是 undefined 時當成 0", () => {
    expect(anchorFor({ contextTime: 5, positionMs: undefined, rate: 1 })).toBe(5);
  });

  it("算出來的一律是有限數", () => {
    const anchor = anchorFor({ contextTime: NaN, positionMs: NaN, rate: NaN });
    expect(Number.isFinite(anchor)).toBe(true);
    expect(Number.isFinite(positionAt({ contextTime: 1, anchor, rate: NaN }))).toBe(true);
  });
});
