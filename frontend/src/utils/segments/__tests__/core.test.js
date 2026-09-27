import { describe, it, expect } from "vitest";

import {
  ceilToTick,
  roundToTick,
  floorToTick,
  findSegmentAt,
  findSegmentIndexAt,
  findNearestSegment,
  findSegmentsInRange,
  validateSegments,
  clearRange,
  insertSegment,
} from "../core.js";

/**
 * segment 核心的測試。
 *
 * 刻意**不使用任何色彩欄位**——核心只認得 id/start/end，payload 是不透明的。
 * 這些測試同時是「核心真的 payload-agnostic」的證據：未來音訊 segment
 * 會帶完全不同的 payload，這裡的行為必須一模一樣。
 */

// payload 故意用一個與燈光無關的欄位，證明核心不在乎內容
const seg = (id, start, end, payload = {}) => ({ id, start, end, ...payload });

let idCounter = 0;
const makeId = () => `new-${++idCounter}`;

describe("網格對齊", () => {
  it("ceil / round / floor 各自對齊到 50ms", () => {
    expect(ceilToTick(1017)).toBe(1050);
    expect(roundToTick(1017)).toBe(1000);
    expect(floorToTick(1017)).toBe(1000);
    // 已在網格上的值不變
    expect(ceilToTick(1000)).toBe(1000);
  });

  it("可指定其他 tick（TICK_MS 未來可調）", () => {
    expect(ceilToTick(101, 25)).toBe(125);
    expect(floorToTick(101, 25)).toBe(100);
  });
});

describe("查詢", () => {
  const segments = [seg("a", 0, 1000), seg("b", 2000, 3000)];

  it("findSegmentAt 用半開區間 [start, end)", () => {
    expect(findSegmentAt(segments, 0)?.id).toBe("a");
    expect(findSegmentAt(segments, 999)?.id).toBe("a");
    // end 不屬於該段
    expect(findSegmentAt(segments, 1000)).toBeNull();
    expect(findSegmentAt(segments, 2500)?.id).toBe("b");
  });

  it("落在空隙或範圍外回傳 null", () => {
    expect(findSegmentAt(segments, 1500)).toBeNull();
    expect(findSegmentAt(segments, 5000)).toBeNull();
    expect(findSegmentIndexAt(segments, -1)).toBe(-1);
  });

  it("findSegmentsInRange 回傳所有有交集的段", () => {
    expect(findSegmentsInRange(segments, 500, 2500).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
    expect(findSegmentsInRange(segments, 1000, 2000)).toEqual([]);
  });
});

describe("validateSegments", () => {
  it("符合不變式時回傳空陣列", () => {
    expect(validateSegments([seg("a", 0, 1000), seg("b", 1000, 2000)])).toEqual(
      [],
    );
  });

  it("抓出重疊", () => {
    const problems = validateSegments([seg("a", 0, 1000), seg("b", 500, 2000)]);
    expect(problems.join()).toContain("重疊");
  });

  it("抓出未對齊網格", () => {
    expect(validateSegments([seg("a", 0, 1017)]).join()).toContain("未對齊");
  });

  it("抓出零長度或負長度", () => {
    expect(validateSegments([seg("a", 1000, 1000)]).join()).toContain(
      "長度非正",
    );
  });

  it("抓出未排序", () => {
    expect(
      validateSegments([seg("a", 2000, 3000), seg("b", 0, 1000)]).join(),
    ).toContain("未依 start 排序");
  });
});

describe("clearRange（trim 碰撞）", () => {
  it("完全被覆蓋的段整個移除", () => {
    const result = clearRange([seg("a", 1000, 2000)], 500, 2500, { makeId });
    expect(result).toEqual([]);
  });

  it("右側被覆蓋時縮短尾端", () => {
    const result = clearRange([seg("a", 1000, 2000)], 1500, 2500, { makeId });
    expect(result).toEqual([seg("a", 1000, 1500)]);
  });

  it("左側被覆蓋時推遲開頭", () => {
    const result = clearRange([seg("a", 1000, 2000)], 500, 1500, { makeId });
    expect(result).toEqual([seg("a", 1500, 2000)]);
  });

  it("中間被挖空時 split 成兩段，後半段拿到新 id", () => {
    const result = clearRange([seg("a", 1000, 3000)], 1500, 2000, { makeId });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "a", start: 1000, end: 1500 });
    expect(result[1]).toMatchObject({ start: 2000, end: 3000 });
    expect(result[1].id).not.toBe("a");
  });

  it("沒有交集的段原封不動", () => {
    const segments = [seg("a", 0, 1000), seg("b", 3000, 4000)];
    expect(clearRange(segments, 1500, 2500, { makeId })).toEqual(segments);
  });

  it("payload 在裁切後保留（核心不認得內容）", () => {
    const result = clearRange(
      [seg("a", 1000, 3000, { sourceFile: "x.mp3", volume: 0.8 })],
      2000,
      2500,
      { makeId },
    );
    for (const segment of result) {
      expect(segment.sourceFile).toBe("x.mp3");
      expect(segment.volume).toBe(0.8);
    }
  });
});

describe("insertSegment", () => {
  it("插入後仍符合不變式且已排序", () => {
    const segments = [seg("a", 0, 1000), seg("b", 2000, 3000)];
    const result = insertSegment(segments, seg("new", 500, 2500), { makeId });

    expect(validateSegments(result)).toEqual([]);
    expect(result.map((s) => [s.start, s.end])).toEqual([
      [0, 500],
      [500, 2500],
      [2500, 3000],
    ]);
  });

  it("插進空隙時不動到其他段", () => {
    const segments = [seg("a", 0, 1000), seg("b", 3000, 4000)];
    const result = insertSegment(segments, seg("new", 1500, 2000), { makeId });

    expect(result.map((s) => s.id)).toEqual(["a", "new", "b"]);
  });
});

describe("findNearestSegment", () => {
  const segments = [seg("a", 1000, 2000), seg("b", 5000, 6000)];

  it("落在段內就回傳那一段", () => {
    expect(findNearestSegment(segments, 1500)).toBe(segments[0]);
  });

  it("落在空隙時回傳最接近的那一段", () => {
    // 2000~5000 是空隙：靠近前面選 a、靠近後面選 b
    expect(findNearestSegment(segments, 2400)).toBe(segments[0]);
    expect(findNearestSegment(segments, 4600)).toBe(segments[1]);
  });

  it("在所有段之前/之後也找得到最近的", () => {
    expect(findNearestSegment(segments, 0)).toBe(segments[0]);
    expect(findNearestSegment(segments, 99999)).toBe(segments[1]);
  });

  it("距離相同時取比較早的那一段", () => {
    // 3500 距離 a 的尾端與 b 的開頭都是 1500
    expect(findNearestSegment(segments, 3500)).toBe(segments[0]);
  });

  it("沒有任何段時回傳 null", () => {
    expect(findNearestSegment([], 1000)).toBe(null);
    expect(findNearestSegment(undefined, 1000)).toBe(null);
  });
});
