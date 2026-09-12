import { describe, it, expect } from "vitest";

import {
  findSegmentById,
  isSameSelection,
  isSelectionOnPart,
  makeSelection,
  resolveSelections,
  selectedIdsOnPart,
} from "../selection.js";

/**
 * 選取契約的測試。
 *
 * 重點是 id 相對於索引的那個性質：**編輯不會讓選取悄悄指向別的色塊**。
 * 索引會，而且不會報錯——Phase 4 連續踩到三次。
 */

const RED = { R: 255, G: 0, B: 0, A: 1 };

const segment = (id, start, end) => ({
  id,
  start,
  end,
  colorStart: RED,
  colorEnd: RED,
  linear: 0,
});

const SEGMENTS = [segment("a", 0, 1000), segment("b", 2000, 3000)];

describe("makeSelection", () => {
  it("只帶 segmentId，不帶任何索引", () => {
    expect(
      makeSelection({ armorIndex: 1, partIndex: 2, segment: SEGMENTS[0] }),
    ).toEqual({ armorIndex: 1, partIndex: 2, segmentId: "a" });
  });

  it("沒有 segment 時 segmentId 是 null，而不是 undefined", () => {
    // undefined 在 JSON 往返後會消失，null 不會——選取會進 redux-persist
    expect(makeSelection({ armorIndex: 0, partIndex: 0 }).segmentId).toBe(null);
  });
});

describe("findSegmentById", () => {
  it("找得到就回傳那一段", () => {
    expect(findSegmentById(SEGMENTS, "b")).toBe(SEGMENTS[1]);
  });

  it("找不到回傳 null（不是 undefined，呼叫端要能明確判斷）", () => {
    expect(findSegmentById(SEGMENTS, "nope")).toBe(null);
    expect(findSegmentById(SEGMENTS, null)).toBe(null);
    expect(findSegmentById(undefined, "a")).toBe(null);
  });
});

describe("id 不會因為鄰居被編輯而指錯人", () => {
  it("刪掉前面的色塊後，選取仍指向同一段", () => {
    const before = SEGMENTS;
    const selection = makeSelection({
      armorIndex: 0,
      partIndex: 0,
      segment: before[1],
    });

    const after = before.slice(1); // 刪掉 "a"

    // 這一段從索引 1 變成索引 0，但 id 沒動
    expect(findSegmentById(after, selection.segmentId)).toBe(after[0]);
  });

  it("被 undo 掉的色塊會解析成找不到，而不是靜默選到別人", () => {
    const selection = makeSelection({
      armorIndex: 0,
      partIndex: 0,
      segment: segment("ghost", 5000, 6000),
    });

    expect(findSegmentById(SEGMENTS, selection.segmentId)).toBe(null);
  });
});

describe("isSameSelection / isSelectionOnPart", () => {
  const base = { armorIndex: 0, partIndex: 1, segmentId: "a" };

  it("三個欄位都相同才算同一筆", () => {
    expect(isSameSelection(base, { ...base })).toBe(true);
    expect(isSameSelection(base, { ...base, segmentId: "b" })).toBe(false);
    expect(isSameSelection(base, { ...base, partIndex: 9 })).toBe(false);
  });

  it("缺一邊時是 false 而不是丟例外", () => {
    expect(isSameSelection(base, null)).toBe(false);
    expect(isSameSelection(undefined, base)).toBe(false);
  });

  it("isSelectionOnPart 只看位置", () => {
    expect(isSelectionOnPart(base, 0, 1)).toBe(true);
    expect(isSelectionOnPart(base, 0, 2)).toBe(false);
    expect(isSelectionOnPart(null, 0, 1)).toBe(false);
  });
});

describe("selectedIdsOnPart", () => {
  const selections = [
    { armorIndex: 0, partIndex: 0, segmentId: "a" },
    { armorIndex: 0, partIndex: 0, segmentId: "b" },
    { armorIndex: 1, partIndex: 0, segmentId: "c" },
    { armorIndex: 0, partIndex: 0, segmentId: null },
  ];

  it("只收指定部位的 id", () => {
    expect(selectedIdsOnPart(selections, 0, 0)).toEqual(new Set(["a", "b"]));
  });

  it("其他部位拿到空集合", () => {
    expect(selectedIdsOnPart(selections, 5, 5).size).toBe(0);
    expect(selectedIdsOnPart(undefined, 0, 0).size).toBe(0);
  });
});

describe("resolveSelections", () => {
  it("解析成 segment 並依起始時間排序", () => {
    const resolved = resolveSelections(
      [
        { armorIndex: 0, partIndex: 0, segmentId: "b" },
        { armorIndex: 0, partIndex: 0, segmentId: "a" },
      ],
      SEGMENTS,
    );

    expect(resolved.map((entry) => entry.segment.id)).toEqual(["a", "b"]);
  });

  it("濾掉已經不存在的選取", () => {
    const resolved = resolveSelections(
      [
        { armorIndex: 0, partIndex: 0, segmentId: "a" },
        { armorIndex: 0, partIndex: 0, segmentId: "ghost" },
      ],
      SEGMENTS,
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].segment.id).toBe("a");
  });
});
