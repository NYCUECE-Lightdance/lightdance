/**
 * 對齊與分佈的測試。
 *
 * 這三個動作的價值就在**準**——用拖曳做得到但做不準。所以測試幾乎全部是在
 * 檢查算出來的數字，加上兩件「壞掉時看不出來」的事：結果要落在 50ms 網格上
 * （不然不變式破了，而畫面上還是看得好好的），以及選取彼此重疊時要整條放棄
 * 而不是靜靜吃掉一段。
 */
import { describe, it, expect } from "vitest";

import {
  alignStarts,
  distributeEvenly,
  earliestStart,
  matchLengths,
} from "../arrange.js";

const seg = (id, start, end) => ({
  id,
  start,
  end,
  colorStart: { R: 255, G: 0, B: 0, A: 1 },
  colorEnd: { R: 255, G: 0, B: 0, A: 1 },
  linear: 0,
});

const groupOf = (armorIndex, partIndex, segments, selectedIds) => ({
  armorIndex,
  partIndex,
  segments,
  segmentIds: new Set(selectedIds ?? segments.map((s) => s.id)),
});

/** 某一條軌算出來的新內容（找不到就是沒被改到） */
const trackOf = (result, armorIndex, partIndex = 0) =>
  result.updates.find(
    (u) => u.armorIndex === armorIndex && u.partIndex === partIndex,
  )?.segments;

const spans = (segments) => segments.map((s) => [s.start, s.end]);

describe("earliestStart", () => {
  it("跨軌取最早的起點", () => {
    const groups = [
      groupOf(0, 0, [seg("a", 2000, 3000)]),
      groupOf(1, 0, [seg("b", 1500, 2500)]),
    ];
    expect(earliestStart(groups)).toBe(1500);
  });

  it("只看被選到的那些", () => {
    const groups = [
      groupOf(0, 0, [seg("early", 500, 600), seg("b", 2000, 3000)], ["b"]),
    ];
    expect(earliestStart(groups)).toBe(2000);
  });

  it("一段都沒選到時回傳 null", () => {
    expect(earliestStart([groupOf(0, 0, [seg("a", 0, 100)], [])])).toBeNull();
  });
});

describe("alignStarts", () => {
  it("跨軌把起點對齊，長度不變", () => {
    // 七位舞者的同一個樂句手放得參差不齊，這是主要用途
    const groups = [
      groupOf(0, 0, [seg("a", 1050, 2050)]),
      groupOf(1, 0, [seg("b", 1150, 1900)]),
      groupOf(2, 0, [seg("c", 900, 2400)]),
    ];

    const result = alignStarts(groups, 1000);

    expect(spans(trackOf(result, 0))).toEqual([[1000, 2000]]); // 長度 1000 不變
    expect(spans(trackOf(result, 1))).toEqual([[1000, 1750]]); // 長度 750 不變
    expect(spans(trackOf(result, 2))).toEqual([[1000, 2500]]); // 長度 1500 不變
    expect(result.skipped).toEqual([]);
  });

  it("已經對齊的那一條不算改變（不佔一格 undo）", () => {
    const groups = [groupOf(0, 0, [seg("a", 1000, 2000)])];
    expect(alignStarts(groups, 1000).updates).toEqual([]);
  });

  it("擠掉的是沒被選到的鄰居（與貼上同一套讓位規則）", () => {
    const segments = [seg("wall", 0, 1200), seg("a", 2000, 3000)];
    const result = alignStarts([groupOf(0, 0, segments, ["a"])], 1000);

    expect(spans(trackOf(result, 0))).toEqual([
      [0, 1000], // 原本到 1200，讓給搬過來的
      [1000, 2000],
    ]);
  });

  it("⚠️ 同一條軌上兩段都被選到時整條放棄，不會靜靜吃掉一段", () => {
    /*
     * 兩段對齊到同一個起點，要留哪一段？意圖本身就有歧義。讓後者蓋掉前者
     * 的話畫面上只是「怎麼少了一塊」——這個專案最想避免的那種錯。
     */
    const segments = [seg("a", 1000, 2000), seg("b", 3000, 4000)];
    const result = alignStarts([groupOf(0, 0, segments)], 1000);

    expect(result.updates).toEqual([]);
    expect(result.skipped).toEqual([{ armorIndex: 0, partIndex: 0 }]);
  });

  it("對齊到負時間時整條放棄", () => {
    const result = alignStarts([groupOf(0, 0, [seg("a", 1000, 2000)])], -500);
    expect(result.updates).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });
});

describe("matchLengths", () => {
  it("保持起點，長度換成基準值", () => {
    const groups = [
      groupOf(0, 0, [seg("a", 1000, 1300)]),
      groupOf(1, 0, [seg("b", 2000, 2350)]),
    ];

    const result = matchLengths(groups, 500);

    expect(spans(trackOf(result, 0))).toEqual([[1000, 1500]]);
    expect(spans(trackOf(result, 1))).toEqual([[2000, 2500]]);
  });

  it("拉長撞到同一條軌上另一段選取時整條放棄", () => {
    const segments = [seg("a", 1000, 1200), seg("b", 1500, 1700)];
    const result = matchLengths([groupOf(0, 0, segments)], 1000);

    expect(result.updates).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it("長度不合法時什麼都不做", () => {
    const groups = [groupOf(0, 0, [seg("a", 1000, 2000)])];
    expect(matchLengths(groups, 0).updates).toEqual([]);
    expect(matchLengths(groups, -100).updates).toEqual([]);
    expect(matchLengths(groups, NaN).updates).toEqual([]);
  });
});

describe("distributeEvenly", () => {
  it("保留頭尾，中間的平均攤開", () => {
    const segments = [
      seg("a", 0, 200),
      seg("b", 700, 900), // 歪掉的那一個
      seg("c", 2000, 2200),
      seg("d", 3000, 3200),
    ];
    const result = distributeEvenly([groupOf(0, 0, segments)]);

    // 頭 0、尾 3000，四段 → 每 1000 一個
    expect(trackOf(result, 0).map((s) => s.start)).toEqual([0, 1000, 2000, 3000]);
  });

  it("結果落在 50ms 網格上", () => {
    /*
     * 步長幾乎不會是 50 的倍數（這裡是 2000/3 = 666.67）。破了不變式的話畫面上
     * 完全正常，要到壓平輸出時才會發現時間格對不上。
     */
    const segments = [
      seg("a", 0, 100),
      seg("b", 500, 600),
      seg("c", 1200, 1300),
      seg("d", 2000, 2100),
    ];
    const result = distributeEvenly([groupOf(0, 0, segments)]);

    for (const segment of trackOf(result, 0)) {
      expect(segment.start % 50).toBe(0);
      expect(segment.end % 50).toBe(0);
    }
  });

  it("⚠️ 逐軌進行，不跨軌", () => {
    /*
     * 不同軌上的段各自在自己的時間軸上，把它們一起分佈只會全部疊在一起。
     * 所以每一條軌各自需要至少三段。
     */
    const groups = [
      groupOf(0, 0, [seg("a", 0, 100), seg("b", 900, 1000), seg("c", 2000, 2100)]),
      groupOf(1, 0, [seg("d", 5000, 5100)]), // 只有一段，跳過
    ];
    const result = distributeEvenly(groups);

    expect(trackOf(result, 0).map((s) => s.start)).toEqual([0, 1000, 2000]);
    expect(trackOf(result, 1)).toBeUndefined();
    expect(result.skipped).toEqual([{ armorIndex: 1, partIndex: 0 }]);
  });

  it("少於三段時那一條跳過（頭尾就是全部，沒有中間可以攤）", () => {
    const groups = [groupOf(0, 0, [seg("a", 0, 100), seg("b", 900, 1000)])];
    const result = distributeEvenly(groups);

    expect(result.updates).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it("已經平均分佈時不算改變", () => {
    const segments = [
      seg("a", 0, 100),
      seg("b", 1000, 1100),
      seg("c", 2000, 2100),
    ];
    expect(distributeEvenly([groupOf(0, 0, segments)]).updates).toEqual([]);
  });
});
