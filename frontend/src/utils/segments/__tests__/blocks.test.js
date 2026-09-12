import { describe, it, expect } from "vitest";

import { buildTimelineBlocks } from "../blocks.js";

/**
 * 視覺色塊的排版契約。
 *
 * Timeline 用 flex 百分比寬度排版，所以這些性質不是潔癖而是正確性：
 * 只要 block 序列出現空洞或總長超出 duration，畫面上的色塊就會和紅線錯位
 * ——那正是 2026-05-06 修過的那個 bug。
 */

const RED = { R: 255, G: 0, B: 0, A: 1 };
const BLUE = { R: 0, G: 0, B: 255, A: 1 };

const segment = (id, start, end, color, extra = {}) => ({
  id,
  start,
  end,
  colorStart: color,
  colorEnd: color,
  linear: 0,
  ...extra,
});

/** 所有 block 首尾相接、涵蓋 [0, duration)，沒有空洞也沒有溢出 */
const expectCoversTimeline = (blocks, duration) => {
  let cursor = 0;
  blocks.forEach((block, index) => {
    expect(block.startTime, `block ${index} 沒有接上前一個`).toBe(cursor);
    expect(block.durationTime, `block ${index} 長度非正`).toBeGreaterThan(0);
    cursor += block.durationTime;
  });
  expect(cursor, "總長必須剛好等於 duration").toBe(duration);
};

describe("buildTimelineBlocks", () => {
  it("空的時間軸就是一整條空隙", () => {
    const blocks = buildTimelineBlocks([], 10000);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      segmentId: null,
      startTime: 0,
      durationTime: 10000,
    });
    expectCoversTimeline(blocks, 10000);
  });

  it("segment 前後的空隙都會補成 block", () => {
    const blocks = buildTimelineBlocks([segment("a", 2000, 3000, RED)], 10000);

    expect(
      blocks.map((b) => [b.segmentId, b.startTime, b.durationTime]),
    ).toEqual([
      [null, 0, 2000],
      ["a", 2000, 1000],
      [null, 3000, 7000],
    ]);
    expectCoversTimeline(blocks, 10000);
  });

  it("緊鄰的兩個 segment 之間不會插入空隙", () => {
    const blocks = buildTimelineBlocks(
      [segment("a", 0, 2000, RED), segment("b", 2000, 4000, BLUE)],
      4000,
    );

    expect(blocks.map((b) => b.segmentId)).toEqual(["a", "b"]);
    expectCoversTimeline(blocks, 4000);
  });

  it("同色的相鄰 segment 不會被合併（它們是兩個色塊）", () => {
    // 舊模型會把顏色相同的相鄰 block 合成一塊，那是關鍵格模型的產物。
    // segment 世界裡兩段就是兩段，合併會讓 id 對不上、也不能分別拖曳。
    const blocks = buildTimelineBlocks(
      [segment("a", 0, 2000, RED), segment("b", 2000, 4000, RED)],
      4000,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.segmentId)).toEqual(["a", "b"]);
  });

  it("帶著漸變資訊，渲染不必再去問鄰居", () => {
    const blocks = buildTimelineBlocks(
      [segment("a", 0, 1000, RED, { colorEnd: BLUE, linear: 1 })],
      1000,
    );

    expect(blocks[0]).toMatchObject({
      linear: 1,
      color: RED,
      colorEnd: BLUE,
    });
  });

  it("超出 duration 的部分會被截斷，不會產生負寬度", () => {
    const blocks = buildTimelineBlocks([segment("a", 3000, 9000, RED)], 5000);

    expect(
      blocks.map((b) => [b.segmentId, b.startTime, b.durationTime]),
    ).toEqual([
      [null, 0, 3000],
      ["a", 3000, 2000],
    ]);
    expectCoversTimeline(blocks, 5000);
  });

  it("完全落在 duration 之後的 segment 被忽略", () => {
    const blocks = buildTimelineBlocks(
      [segment("a", 1000, 2000, RED), segment("b", 8000, 9000, BLUE)],
      5000,
    );

    expect(blocks.map((b) => b.segmentId)).toEqual([null, "a", null]);
    expectCoversTimeline(blocks, 5000);
  });

  it("duration 無效時回傳空陣列而不是壞掉的排版", () => {
    expect(buildTimelineBlocks([segment("a", 0, 1000, RED)], 0)).toEqual([]);
    expect(buildTimelineBlocks([segment("a", 0, 1000, RED)], NaN)).toEqual([]);
  });

  it("segments 不是陣列時當作全空", () => {
    expect(buildTimelineBlocks(undefined, 1000)).toHaveLength(1);
    expect(buildTimelineBlocks(undefined, 1000)[0].segmentId).toBe(null);
  });
});
