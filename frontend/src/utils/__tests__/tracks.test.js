import { describe, it, expect } from "vitest";

import {
  DEFAULT_ROW_H,
  MAX_ROW_H,
  MIN_ROW_H,
  clampRowHeight,
  isCompactHeight,
  trackHeight,
  withTrackHeight,
} from "../tracks.js";

const tracks = () => [
  { id: 1, armorIndex: 0, partIndex: 0 },
  { id: 2, armorIndex: 1, partIndex: 0, height: 200 },
];

describe("clampRowHeight", () => {
  it("夾在上下界之間", () => {
    expect(clampRowHeight(0)).toBe(MIN_ROW_H);
    expect(clampRowHeight(9999)).toBe(MAX_ROW_H);
    expect(clampRowHeight(100)).toBe(100);
  });

  it("非數字回到預設值，不要讓 NaN 變成行高", () => {
    // 拖曳過程的像素運算只要有一步是 undefined，整條軌道會消失
    expect(clampRowHeight(undefined)).toBe(DEFAULT_ROW_H);
    expect(clampRowHeight(NaN)).toBe(DEFAULT_ROW_H);
    expect(clampRowHeight("abc")).toBe(DEFAULT_ROW_H);
  });

  it("回傳整數（半像素會讓相鄰兩軌的邊線忽粗忽細）", () => {
    expect(clampRowHeight(100.6)).toBe(101);
  });
});

describe("trackHeight", () => {
  it("沒有逐軌覆寫時跟著全域", () => {
    expect(trackHeight(tracks()[0], 90)).toBe(90);
  });

  it("有覆寫時蓋過全域", () => {
    expect(trackHeight(tracks()[1], 90)).toBe(200);
  });

  it("覆寫值一樣要夾緊", () => {
    expect(trackHeight({ height: 9999 }, 90)).toBe(MAX_ROW_H);
  });
});

describe("withTrackHeight", () => {
  it("只改指定的那一條", () => {
    const before = tracks();
    const next = withTrackHeight(before, 1, 150);

    expect(next[0].height).toBe(150);
    expect(next[1]).toBe(before[1]);
  });

  it("傳 null 取消覆寫，欄位整個消失而不是留一個 undefined", () => {
    // 留 undefined 的話 persist 之後會變成 null，`?? rowHeight` 就短路不了
    const next = withTrackHeight(tracks(), 2, null);
    expect(next[1]).not.toHaveProperty("height");
  });

  it("找不到 id 時原樣回傳每一條的 reference", () => {
    const before = tracks();
    const next = withTrackHeight(before, 99, 150);
    expect(next[0]).toBe(before[0]);
    expect(next[1]).toBe(before[1]);
  });
});

describe("isCompactHeight", () => {
  it("矮到放不下上下移那疊按鈕時收起來", () => {
    expect(isCompactHeight(MIN_ROW_H)).toBe(true);
    expect(isCompactHeight(DEFAULT_ROW_H)).toBe(false);
  });
});
