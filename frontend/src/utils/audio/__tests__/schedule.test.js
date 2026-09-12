import { describe, expect, it } from "vitest";

import {
  clipsAt,
  fadeEnvelope,
  fadeGainAt,
  scheduleFrom,
  totalDuration,
} from "../schedule.js";

const clip = (over = {}) => ({
  id: "c1",
  start: 0,
  end: 10000,
  sourceFile: "a.mp3",
  sourceOffset: 0,
  ...over,
});

/** 三首歌接續：0–10s、10–20s、20–35s */
const showClips = [
  clip({ id: "a", start: 0, end: 10000 }),
  clip({ id: "b", start: 10000, end: 20000, sourceFile: "b.mp3" }),
  clip({ id: "c", start: 20000, end: 35000, sourceFile: "c.mp3" }),
];

describe("整場長度", () => {
  it("是最後一個 clip 的結尾", () => {
    expect(totalDuration(showClips)).toBe(35000);
  });

  it("沒有 clip 就是 0", () => {
    expect(totalDuration([])).toBe(0);
    expect(totalDuration(undefined)).toBe(0);
  });
});

describe("排程", () => {
  it("從頭播：第一首立刻響，後面的排在各自的時間點", () => {
    const plan = scheduleFrom(showClips, { fromMs: 0, rate: 1, contextTime: 100 });
    expect(plan.map((p) => [p.clip.id, p.when, p.offset, p.duration])).toEqual([
      ["a", 100, 0, 10],
      ["b", 110, 0, 10],
      ["c", 120, 0, 15],
    ]);
  });

  it("已經播完的 clip 不會被排進來", () => {
    const plan = scheduleFrom(showClips, { fromMs: 25000, contextTime: 0 });
    expect(plan.map((p) => p.clip.id)).toEqual(["c"]);
  });

  it("從一首歌的中間開始：立刻響，並從音檔的對應位置取", () => {
    // 第 15 秒 = 第二首的第 5 秒
    const [plan] = scheduleFrom(showClips, { fromMs: 15000, contextTime: 50 });
    expect(plan.clip.id).toBe("b");
    expect(plan.when).toBe(50); // 立刻
    expect(plan.offset).toBe(5); // 音檔的第 5 秒
    expect(plan.duration).toBe(5); // 還剩 5 秒
  });

  it("sourceOffset 會加上去（clip 只取音檔的一段）", () => {
    const trimmed = [clip({ start: 0, end: 5000, sourceOffset: 30 })];
    const [plan] = scheduleFrom(trimmed, { fromMs: 2000, contextTime: 0 });
    expect(plan.offset).toBe(32); // 音檔第 30 秒起，已經播了 2 秒
    expect(plan.duration).toBe(3);
  });

  /*
   * 倍速最容易寫錯的地方：它只影響「表演時間 ↔ 牆上時間」的換算。
   * 音檔內部的 offset / duration 由 playbackRate 自己處理，多除一次 rate
   * 接縫就會愈跑愈歪。
   */
  it("2 倍速：啟動時間對半，但音檔的 offset/duration 不變", () => {
    const plan = scheduleFrom(showClips, { fromMs: 0, rate: 2, contextTime: 0 });
    expect(plan.map((p) => p.when)).toEqual([0, 5, 10]); // 10s 的表演 = 5s 牆上時間
    expect(plan.map((p) => p.offset)).toEqual([0, 0, 0]);
    expect(plan.map((p) => p.duration)).toEqual([10, 10, 15]);
  });

  it("0.5 倍速：啟動時間拉長一倍", () => {
    const plan = scheduleFrom(showClips, { fromMs: 0, rate: 0.5, contextTime: 0 });
    expect(plan.map((p) => p.when)).toEqual([0, 20, 40]);
  });

  it("倍速加上從中間開始，兩件事互不干擾", () => {
    const plan = scheduleFrom(showClips, { fromMs: 15000, rate: 2, contextTime: 0 });
    expect(plan.map((p) => p.clip.id)).toEqual(["b", "c"]);
    expect(plan[0]).toMatchObject({ when: 0, offset: 5, duration: 5 });
    // c 從表演的第 20 秒開始，離現在 5 秒的表演時間 = 2.5 秒牆上時間
    expect(plan[1]).toMatchObject({ when: 2.5, offset: 0, duration: 15 });
  });

  it("接縫重疊時兩個 clip 都排得進來", () => {
    const overlapping = [
      clip({ id: "a", start: 0, end: 10000 }),
      clip({ id: "b", start: 9500, end: 20000 }), // 重疊 500ms
    ];
    const plan = scheduleFrom(overlapping, { fromMs: 0, contextTime: 0 });
    expect(plan.map((p) => p.when)).toEqual([0, 9.5]);
  });

  it("壞掉的 clip 直接跳過，不會排出負長度的東西", () => {
    const broken = [
      clip({ id: "zero", start: 5000, end: 5000 }),
      clip({ id: "reversed", start: 8000, end: 3000 }),
      clip({ id: "ok", start: 0, end: 1000 }),
    ];
    expect(scheduleFrom(broken, { fromMs: 0 }).map((p) => p.clip.id)).toEqual(["ok"]);
  });

  it("速率壞掉時當成 1", () => {
    for (const rate of [0, -2, NaN, undefined]) {
      const plan = scheduleFrom(showClips, { fromMs: 0, rate, contextTime: 0 });
      expect(plan[1].when).toBe(10);
    }
  });

  it("沒有 clip 就沒有東西要排", () => {
    expect(scheduleFrom([], { fromMs: 0 })).toEqual([]);
    expect(scheduleFrom(undefined, { fromMs: 0 })).toEqual([]);
  });
});

describe("接縫上有哪些 clip", () => {
  it("一般情況只有一個", () => {
    expect(clipsAt(showClips, 5000).map((c) => c.id)).toEqual(["a"]);
  });

  it("重疊處有兩個", () => {
    const overlapping = [
      clip({ id: "a", start: 0, end: 10000 }),
      clip({ id: "b", start: 9500, end: 20000 }),
    ];
    expect(clipsAt(overlapping, 9700).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("邊界是半開區間，接縫上不會重複算", () => {
    expect(clipsAt(showClips, 10000).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("淡入淡出", () => {
  const fading = clip({ start: 1000, end: 5000, fadeIn: 1000, fadeOut: 2000 });

  it("淡入期間逐漸變大", () => {
    expect(fadeGainAt(fading, 1000)).toBe(0);
    expect(fadeGainAt(fading, 1500)).toBeCloseTo(0.5);
    expect(fadeGainAt(fading, 2000)).toBeCloseTo(1);
  });

  it("淡出期間逐漸變小", () => {
    expect(fadeGainAt(fading, 3000)).toBeCloseTo(1);
    expect(fadeGainAt(fading, 4000)).toBeCloseTo(0.5);
    expect(fadeGainAt(fading, 5000)).toBe(0);
  });

  it("沒有淡入淡出時整段都是基礎音量", () => {
    const flat = clip({ gain: 0.8 });
    expect(fadeGainAt(flat, 0)).toBe(0.8);
    expect(fadeGainAt(flat, 5000)).toBe(0.8);
  });

  it("基礎音量會乘進去", () => {
    const quiet = clip({ start: 0, end: 4000, fadeIn: 2000, gain: 0.5 });
    expect(fadeGainAt(quiet, 1000)).toBeCloseTo(0.25);
  });

  it("淡入淡出重疊時取比較小的那個（很短的 clip）", () => {
    const tiny = clip({ start: 0, end: 1000, fadeIn: 800, fadeOut: 800 });
    // 中點：淡入算 0.625、淡出算 0.625，不會超過 1
    expect(fadeGainAt(tiny, 500)).toBeLessThanOrEqual(1);
    expect(fadeGainAt(tiny, 500)).toBeGreaterThan(0);
  });
});

describe("音量包絡", () => {
  it("沒有淡入淡出就只排一個固定值", () => {
    const points = fadeEnvelope(clip({ gain: 0.7 }), { fromMs: 0, contextTime: 0 });
    expect(points).toEqual([{ when: 0, value: 0.7 }]);
  });

  it("完整的淡入 → 平原 → 淡出", () => {
    const fading = clip({ start: 0, end: 10000, fadeIn: 1000, fadeOut: 2000 });
    const points = fadeEnvelope(fading, { fromMs: 0, contextTime: 0 });
    expect(points).toEqual([
      { when: 0, value: 0 },
      { when: 1, value: 1 },
      { when: 8, value: 1 },
      { when: 10, value: 0 },
    ]);
  });

  /*
   * 從淡出的中間 seek 進去：第一個點必須是**當下該有的音量**。
   * 少了它的話音量會從滿檔重新淡出，聽起來像突然跳上去再掉下來。
   */
  it("從淡出中間開始播，第一個點是當下的音量", () => {
    const fading = clip({ start: 0, end: 10000, fadeOut: 2000 });
    const points = fadeEnvelope(fading, { fromMs: 9000, contextTime: 0 });
    expect(points[0]).toEqual({ when: 0, value: 0.5 });
    expect(points[points.length - 1]).toEqual({ when: 1, value: 0 });
  });

  it("倍速會壓縮包絡的時間，但不改音量值", () => {
    const fading = clip({ start: 0, end: 10000, fadeIn: 1000, fadeOut: 2000 });
    const points = fadeEnvelope(fading, { fromMs: 0, rate: 2, contextTime: 0 });
    expect(points.map((p) => p.when)).toEqual([0, 0.5, 4, 5]);
    expect(points.map((p) => p.value)).toEqual([0, 1, 1, 0]);
  });

  it("每個點的時間都是遞增的（linearRampToValueAtTime 的要求）", () => {
    const fading = clip({ start: 2000, end: 12000, fadeIn: 1500, fadeOut: 3000 });
    for (const fromMs of [0, 2000, 3000, 5000, 9500]) {
      const points = fadeEnvelope(fading, { fromMs, contextTime: 0 });
      for (let i = 1; i < points.length; i++) {
        expect(points[i].when).toBeGreaterThan(points[i - 1].when);
      }
    }
  });
});
