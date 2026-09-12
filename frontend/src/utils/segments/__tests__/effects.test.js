import { describe, expect, it } from "vitest";

import {
  BLINK,
  blinkColorAt,
  blinkPeriodOf,
  blinkPulseCount,
  expandBlink,
  expandEffects,
  makeBlink,
  withoutEffect,
} from "../effects.js";
import { getColorAt } from "../color.js";
import { segmentsToKeyframes } from "../convert.js";

const red = { R: 255, G: 0, B: 0, A: 1 };
const blue = { R: 0, G: 0, B: 255, A: 1 };

/** 一個 0..1000ms 的紅色塊，週期 250ms（= 亮 200、滅 50，共四個脈衝） */
const blinking = (over = {}) => ({
  id: "s1",
  start: 0,
  end: 1000,
  colorStart: red,
  colorEnd: red,
  linear: 0,
  effect: { type: BLINK, period: 250 },
  ...over,
});

let counter = 0;
const makeId = () => `p${++counter}`;

describe("建立頻閃 metadata", () => {
  it("必須是 tick 的倍數", () => {
    expect(makeBlink(250)).toEqual({ type: BLINK, period: 250 });
    expect(makeBlink(230)).toBeNull();
  });

  it("一個週期至少要兩格，否則整段都是熄滅的", () => {
    expect(makeBlink(50)).toBeNull();
    expect(makeBlink(100)).toEqual({ type: BLINK, period: 100 });
  });

  it("不是數字就回傳 null", () => {
    expect(makeBlink("")).toBeNull();
    expect(makeBlink(null)).toBeNull();
    expect(makeBlink("abc")).toBeNull();
  });
});

describe("展開成脈衝", () => {
  it("一個週期 = 亮 period-tick、滅一格", () => {
    const pulses = expandBlink(blinking(), { makeId });
    expect(pulses).toHaveLength(4);
    expect(pulses.map((p) => [p.start, p.end])).toEqual([
      [0, 200],
      [250, 450],
      [500, 700],
      [750, 950],
    ]);
  });

  it("每個脈衝都是固定色（脈衝內部不漸變）", () => {
    const pulses = expandBlink(blinking(), { makeId });
    expect(pulses.every((p) => p.linear === 0)).toBe(true);
    expect(pulses[0].colorStart).toEqual(pulses[0].colorEnd);
  });

  it("漸變段的每個脈衝取起點在曲線上的顏色", () => {
    const pulses = expandBlink(
      blinking({ linear: 1, colorStart: red, colorEnd: blue }),
      { makeId },
    );
    // 0 / 250 / 500 / 750 ms → 比例 0 / 0.25 / 0.5 / 0.75
    expect(pulses.map((p) => p.colorStart.R)).toEqual([255, 191, 128, 64]);
    expect(pulses.map((p) => p.colorStart.B)).toEqual([0, 64, 128, 191]);
  });

  it("尾巴不足一個完整週期的部分不產生脈衝", () => {
    // 0..900 放得下 3 個 250ms 的完整週期，剩 150ms 維持熄滅
    const pulses = expandBlink(blinking({ end: 900 }), { makeId });
    expect(pulses).toHaveLength(3);
    expect(pulses[2].end).toBe(700);
  });

  it("裝不下一個週期時原樣回傳，不會產生零長度的東西", () => {
    const segment = blinking({ end: 200 });
    expect(expandBlink(segment, { makeId })).toEqual([segment]);
  });

  it("沒有效果的段原樣回傳（reference 相同）", () => {
    const plain = withoutEffect(blinking());
    expect(expandBlink(plain, { makeId })[0]).toBe(plain);
  });

  it("第一個脈衝沿用原本的 id，其餘另發 —— 選取才不會整個掉", () => {
    const pulses = expandBlink(blinking(), { makeId });
    expect(pulses[0].id).toBe("s1");
    expect(new Set(pulses.map((p) => p.id)).size).toBe(4);
  });

  /*
   * openEnded 是 v1 資料「一路亮到最後、從來沒有熄滅點」的標記。脈衝一定在段的
   * 結尾之前就熄滅，帶著那個旗標會讓壓平時少發一個熄滅點。
   */
  it("openEnded 不會傳給脈衝", () => {
    const pulses = expandBlink(blinking({ openEnded: true }), { makeId });
    expect(pulses.some((p) => p.openEnded)).toBe(false);
  });
});

describe("整條時間軸的展開", () => {
  it("沒有任何效果時回傳原陣列（壓平路徑每個部位都會呼叫一次）", () => {
    const segments = [withoutEffect(blinking())];
    expect(expandEffects(segments)).toBe(segments);
  });

  it("只展開帶效果的那些段，其他原樣", () => {
    const plain = {
      id: "s2",
      start: 2000,
      end: 3000,
      colorStart: blue,
      colorEnd: blue,
      linear: 0,
    };
    const out = expandEffects([blinking(), plain], { makeId });
    expect(out).toHaveLength(5);
    expect(out[4]).toBe(plain);
  });

  it("展開後仍然排序且不重疊", () => {
    const out = expandEffects([blinking()], { makeId });
    for (let i = 1; i < out.length; i++) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end);
    }
  });
});

describe("預覽取色", () => {
  const segment = blinking();

  it("亮的那一段拿得到顏色", () => {
    expect(blinkColorAt(segment, 0)).toEqual(red);
    expect(blinkColorAt(segment, 150)).toEqual(red);
    expect(blinkColorAt(segment, 250)).toEqual(red);
  });

  it("熄滅的那一格回傳 null", () => {
    expect(blinkColorAt(segment, 200)).toBeNull();
    expect(blinkColorAt(segment, 240)).toBeNull();
  });

  it("尾巴不足一個週期的部分也是暗的", () => {
    expect(blinkColorAt(blinking({ end: 900 }), 850)).toBeNull();
  });

  it("不是頻閃段時回傳 undefined，讓呼叫端走原本的邏輯", () => {
    expect(blinkColorAt(withoutEffect(segment), 0)).toBeUndefined();
  });

  it("getColorAt 直接看得到頻閃 —— 播放預覽就會閃", () => {
    expect(getColorAt([segment], 100)).toEqual(red);
    expect(getColorAt([segment], 220)).toEqual({ R: 0, G: 0, B: 0, A: 1 });
  });
});

describe("壓平成韌體格式", () => {
  /*
   * 這一項是這次改動的重點：韌體不認得 effect 欄位，所以壓平時必須攤成
   * 舊模型看得懂的樣子，而且要跟「直接生一堆小色塊」的舊版逐格相同。
   */
  it("頻閃展開成一串亮/滅的關鍵格", () => {
    const frames = segmentsToKeyframes([blinking()], { duration: 1000 });
    expect(frames.map((f) => f.time)).toEqual([
      0, 200, 250, 450, 500, 700, 750, 950, 1000,
    ]);
    // 偶數位是亮的、奇數位是黑的
    expect(frames[0].color).toEqual(red);
    expect(frames[1].color).toEqual({ R: 0, G: 0, B: 0, A: 1 });
  });

  it("和舊版「直接生一堆小色塊」壓出來的結果完全相同", () => {
    const asPulses = expandBlink(blinking(), { makeId });
    expect(segmentsToKeyframes([blinking()], { duration: 1000 })).toEqual(
      segmentsToKeyframes(asPulses, { duration: 1000 }),
    );
  });

  it("沒有效果的資料壓出來的東西一個位元都沒變", () => {
    const plain = [withoutEffect(blinking())];
    expect(segmentsToKeyframes(plain, { duration: 1000 })).toEqual([
      { time: 0, color: red, linear: 0 },
      { time: 1000, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
    ]);
  });
});

describe("查詢與移除", () => {
  it("讀得出週期與脈衝數", () => {
    expect(blinkPeriodOf(blinking())).toBe(250);
    expect(blinkPulseCount(blinking())).toBe(4);
    expect(blinkPeriodOf({ id: "x" })).toBeNull();
    expect(blinkPulseCount({ id: "x" })).toBe(0);
  });

  it("移除效果之後就是一個普通色塊", () => {
    expect(withoutEffect(blinking()).effect).toBeUndefined();
  });

  it("本來就沒有效果時回傳原物件", () => {
    const plain = withoutEffect(blinking());
    expect(withoutEffect(plain)).toBe(plain);
  });
});
