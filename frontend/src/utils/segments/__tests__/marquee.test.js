import { describe, expect, it } from "vitest";

import {
  MARQUEE_MIN_PX,
  isMarquee,
  normalizeRange,
  segmentsInMarquee,
} from "../marquee.js";

/** 1px = 10ms，方便心算 */
const timeAt = (px) => px * 10;

const seg = (id, start, end) => ({ id, start, end });

/**
 * 三軌，各佔 100px 高：
 *   row0  y   0..100   舞者 0 的部位 0：0..1000ms、2000..3000ms
 *   row1  y 100..200   舞者 0 的部位 1：500..1500ms
 *   row2  y 200..300   舞者 1 的部位 0：（空的）
 */
const rows = [
  {
    armorIndex: 0,
    partIndex: 0,
    top: 0,
    bottom: 100,
    segments: [seg("a", 0, 1000), seg("b", 2000, 3000)],
  },
  {
    armorIndex: 0,
    partIndex: 1,
    top: 100,
    bottom: 200,
    segments: [seg("c", 500, 1500)],
  },
  { armorIndex: 1, partIndex: 0, top: 200, bottom: 300, segments: [] },
];

const idsIn = (rect) =>
  segmentsInMarquee(rows, rect, timeAt).map((hit) => hit.segment.id);

describe("框選", () => {
  it("框到哪幾軌就選哪幾軌 —— 跨軌是這個功能的重點", () => {
    // x 50..60 → 500..600ms；y 50..150 蓋到 row0 與 row1
    expect(idsIn({ x1: 50, y1: 50, x2: 60, y2: 150 })).toEqual(["a", "c"]);
  });

  it("只框到一軌時不會掃到隔壁", () => {
    expect(idsIn({ x1: 50, y1: 10, x2: 60, y2: 90 })).toEqual(["a"]);
  });

  it("碰到一部分就算選中，不必整段被框住", () => {
    // 800..900ms 只碰到 a 的尾巴與 c 的中段
    expect(idsIn({ x1: 80, y1: 0, x2: 90, y2: 200 })).toEqual(["a", "c"]);
  });

  it("往左上拉也成立（框可以往任何方向）", () => {
    expect(idsIn({ x1: 60, y1: 150, x2: 50, y2: 50 })).toEqual(["a", "c"]);
  });

  it("框住整個範圍時全部選中", () => {
    expect(idsIn({ x1: 0, y1: 0, x2: 300, y2: 300 })).toEqual(["a", "b", "c"]);
  });

  it("空白處的框什麼都不選", () => {
    // 1600..1900ms，a 已結束、b 還沒開始、c 也結束了
    expect(idsIn({ x1: 160, y1: 0, x2: 190, y2: 200 })).toEqual([]);
  });

  it("沒有軌道時回傳空陣列而不是炸掉", () => {
    expect(segmentsInMarquee([], { x1: 0, y1: 0, x2: 9, y2: 9 }, timeAt)).toEqual([]);
    expect(segmentsInMarquee(undefined, { x1: 0, y1: 0, x2: 9, y2: 9 }, timeAt)).toEqual([]);
  });

  it("回傳的資料帶得出位置，呼叫端才組得出選取項目", () => {
    const hits = segmentsInMarquee(rows, { x1: 50, y1: 50, x2: 60, y2: 150 }, timeAt);
    expect(hits[1]).toMatchObject({ armorIndex: 0, partIndex: 1 });
    expect(hits[1].segment.id).toBe("c");
  });

  /*
   * 邊界：segment 是半開區間 [start, end)，首尾相接的兩段共用一個時間點。
   * 若把「碰到端點」算成相交，在接縫上按一下會同時選中前後兩段。
   */
  it("只碰到端點不算相交", () => {
    const touching = [
      {
        armorIndex: 0,
        partIndex: 0,
        top: 0,
        bottom: 100,
        segments: [seg("x", 0, 1000), seg("y", 1000, 2000)],
      },
    ];
    // 零寬度的框正好落在接縫 1000ms 上
    const hits = segmentsInMarquee(
      touching,
      { x1: 100, y1: 10, x2: 100, y2: 90 },
      timeAt,
    );
    expect(hits).toEqual([]);
  });

  it("軌道邊界貼齊時不會多選到下一軌", () => {
    // y 恰好 0..100 = row0 的範圍，不該碰到從 100 開始的 row1
    expect(idsIn({ x1: 50, y1: 0, x2: 60, y2: 100 })).toEqual(["a"]);
  });
});

describe("拉得夠遠才算框選", () => {
  it("點擊時的手抖不算", () => {
    expect(isMarquee({ x1: 10, y1: 10, x2: 12, y2: 11 })).toBe(false);
  });

  it("任何一軸拉超過門檻就算", () => {
    expect(isMarquee({ x1: 10, y1: 10, x2: 10 + MARQUEE_MIN_PX, y2: 10 })).toBe(true);
    expect(isMarquee({ x1: 10, y1: 10, x2: 10, y2: 10 + MARQUEE_MIN_PX })).toBe(true);
  });

  it("往回拉也算（用絕對值）", () => {
    expect(isMarquee({ x1: 100, y1: 10, x2: 10, y2: 10 })).toBe(true);
  });
});

describe("範圍正規化", () => {
  it("不管誰大誰小都收成 min/max", () => {
    expect(normalizeRange(9, 3)).toEqual({ min: 3, max: 9 });
    expect(normalizeRange(3, 9)).toEqual({ min: 3, max: 9 });
  });
});
