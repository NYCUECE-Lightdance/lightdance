/**
 * 拖曳與 resize 的邊界測試。
 *
 * 這段邏輯原本內嵌在 Timeline 的滑鼠事件處理器裡，跟 DOM 綁死，
 * jsdom 量不到版面所以**一行測試都沒有**。抽成純函式之後才有辦法窮舉邊界，
 * 而邊界正是手勢最容易寫錯的地方。
 */
import { describe, it, expect } from "vitest";
import {
  moveSegment,
  moveSegments,
  movableRange,
  movableRangeAcross,
  moveAcross,
  resizeSegment,
  MIN_BLOCK_GAP_MS,
  MIN_SEGMENT_MS,
} from "../gestures.js";

const DURATION = 10_000;

/** 兩個色塊：A 1000~2000、B 4000~5000 */
const makeSegments = () => [
  { id: "a", start: 1000, end: 2000, colorStart: {}, colorEnd: {}, linear: 0 },
  { id: "b", start: 4000, end: 5000, colorStart: {}, colorEnd: {}, linear: 0 },
];

const opts = { duration: DURATION };

describe("moveSegment", () => {
  it("往右平移，長度不變", () => {
    const next = moveSegment(makeSegments(), "a", 500, opts);
    expect(next[0]).toMatchObject({ start: 1500, end: 2500 });
  });

  it("往左平移", () => {
    const next = moveSegment(makeSegments(), "a", -500, opts);
    expect(next[0]).toMatchObject({ start: 500, end: 1500 });
  });

  it("位移量對齊網格（拖到哪都會吸附）", () => {
    const next = moveSegment(makeSegments(), "a", 137, opts);
    expect(next[0].start % 50).toBe(0);
    expect(next[0]).toMatchObject({ start: 1150, end: 2150 });
  });

  it("往右撞到鄰居時停在「鄰居起點 − 長度 − 間距」", () => {
    const next = moveSegment(makeSegments(), "a", 99_999, opts);
    // B 從 4000 開始，A 長 1000，最小間距 50 → 最遠只能到 2950
    expect(next[0]).toMatchObject({ start: 4000 - 1000 - MIN_BLOCK_GAP_MS });
    expect(next[0].end).toBeLessThanOrEqual(4000 - MIN_BLOCK_GAP_MS);
  });

  it("往左不會越過 0", () => {
    const next = moveSegment(makeSegments(), "a", -99_999, opts);
    expect(next[0]).toMatchObject({ start: 0, end: 1000 });
  });

  it("最後一段往右不會超過總長", () => {
    const next = moveSegment(makeSegments(), "b", 99_999, opts);
    expect(next[1].end).toBe(DURATION);
    expect(next[1].start).toBe(DURATION - 1000);
  });

  it("被左右夾死時整個不動（不會算出負的可用範圍）", () => {
    // 真正的「夾死」是前後都已經首尾相接——再動就會重疊。
    // （這裡刻意不是「前後各隔 50ms」：那是有一格空間可以走的，
    //   舊版把它也當成夾死，正是「看得到空隙卻推不動」那個 bug。）
    const tight = [
      { id: "l", start: 0, end: 1000 },
      { id: "m", start: 1000, end: 2000 },
      { id: "r", start: 2000, end: 3000 },
    ];
    expect(moveSegment(tight, "m", 500, opts)).toBe(tight);
  });

  it("⚠️ 只隔一格時仍然推得動（最後一格不可以是拖不到的）", () => {
    // 迴歸測試：`MIN_BLOCK_GAP_MS` 曾經等於 `TICK_MS`，於是「與鄰居至少留
    // 一格」正好把唯一剩下的那一步吃掉——使用者看得到 50ms 的空隙，
    // 卻連一格都推不過去，而擋住他的東西在 1 倍率下只有 0.25px。
    const oneTick = [
      { id: "l", start: 0, end: 1000 },
      { id: "m", start: 1050, end: 2000 },
      { id: "r", start: 2050, end: 3000 },
    ];
    const next = moveSegment(oneTick, "m", 500, opts);
    expect(next[1]).toMatchObject({ start: 1100, end: 2050 });
  });

  it("沒有實際位移時回傳原陣列（reference 相同 → 不會佔一格 undo）", () => {
    const segments = makeSegments();
    expect(moveSegment(segments, "a", 0, opts)).toBe(segments);
    // 20ms 的位移對齊網格之後還是原位
    expect(moveSegment(segments, "a", 20, opts)).toBe(segments);
  });

  it("找不到 id 時回傳原陣列", () => {
    const segments = makeSegments();
    expect(moveSegment(segments, "nope", 500, opts)).toBe(segments);
  });

  it("不會動到其他段的 reference", () => {
    const segments = makeSegments();
    const next = moveSegment(segments, "a", 500, opts);
    expect(next[1]).toBe(segments[1]);
  });
});

describe("resizeSegment", () => {
  it("拉長右緣", () => {
    const next = resizeSegment(makeSegments(), "a", "right", 500, opts);
    expect(next[0]).toMatchObject({ start: 1000, end: 2500 });
  });

  it("縮短右緣", () => {
    const next = resizeSegment(makeSegments(), "a", "right", -500, opts);
    expect(next[0]).toMatchObject({ start: 1000, end: 1500 });
  });

  it("右緣最多拉到「鄰居起點 − 間距」", () => {
    const next = resizeSegment(makeSegments(), "a", "right", 99_999, opts);
    expect(next[0].end).toBe(4000 - MIN_BLOCK_GAP_MS);
  });

  it("最後一段的右緣最多拉到總長", () => {
    const next = resizeSegment(makeSegments(), "b", "right", 99_999, opts);
    expect(next[1].end).toBe(DURATION);
  });

  it("右緣不會縮到比最小長度還短", () => {
    const next = resizeSegment(makeSegments(), "a", "right", -99_999, opts);
    expect(next[0].end).toBe(1000 + MIN_SEGMENT_MS);
    expect(next[0].end).toBeGreaterThan(next[0].start);
  });

  it("拉長左緣（往左長）", () => {
    const next = resizeSegment(makeSegments(), "a", "left", -500, opts);
    expect(next[0]).toMatchObject({ start: 500, end: 2000 });
  });

  it("左緣最多退到「前一段結尾 + 間距」", () => {
    const next = resizeSegment(makeSegments(), "b", "left", -99_999, opts);
    expect(next[1].start).toBe(2000 + MIN_BLOCK_GAP_MS);
  });

  it("第一段的左緣最多退到 0", () => {
    const next = resizeSegment(makeSegments(), "a", "left", -99_999, opts);
    expect(next[0].start).toBe(0);
  });

  it("左緣不會超過「結尾 − 最小長度」", () => {
    const next = resizeSegment(makeSegments(), "a", "left", 99_999, opts);
    expect(next[0].start).toBe(2000 - MIN_SEGMENT_MS);
    expect(next[0].start).toBeLessThan(next[0].end);
  });

  it("兩個邊都會對齊網格", () => {
    const right = resizeSegment(makeSegments(), "a", "right", 137, opts);
    expect(right[0].end % 50).toBe(0);
    const left = resizeSegment(makeSegments(), "a", "left", -137, opts);
    expect(left[0].start % 50).toBe(0);
  });

  it("沒有實際改變時回傳原陣列", () => {
    const segments = makeSegments();
    expect(resizeSegment(segments, "a", "right", 0, opts)).toBe(segments);
    expect(resizeSegment(segments, "a", "left", 0, opts)).toBe(segments);
    expect(resizeSegment(segments, "nope", "right", 500, opts)).toBe(segments);
  });

  it("任何操作之後 end 都嚴格大於 start", () => {
    // 窮舉一批位移量，確保不會產生零長度或反向的段
    for (const delta of [-9999, -2000, -137, -50, 0, 50, 137, 2000, 9999]) {
      for (const edge of ["left", "right"]) {
        for (const id of ["a", "b"]) {
          const next = resizeSegment(makeSegments(), id, edge, delta, opts);
          for (const segment of next) {
            expect(segment.end).toBeGreaterThan(segment.start);
          }
        }
      }
    }
  });

  it("任何操作之後段與段都不重疊", () => {
    for (const delta of [-9999, -500, 137, 500, 9999]) {
      for (const edge of ["left", "right"]) {
        for (const id of ["a", "b"]) {
          const next = resizeSegment(makeSegments(), id, edge, delta, opts);
          for (let i = 1; i < next.length; i++) {
            expect(next[i].start).toBeGreaterThanOrEqual(next[i - 1].end);
          }
        }
      }
    }
  });
});

describe("movableRange", () => {
  /**
   * 這是拖曳的**單一真相**：像素預覽與放開後的 commit 都問它。
   * 兩邊各自算一次的話會出現「拖到底了但放開後又跳一點」。
   */
  it("單一色塊的可動範圍就是與前後鄰居的距離", () => {
    // A 1000~2000、B 4000~5000，總長 10000
    expect(movableRange(makeSegments(), ["a"], opts)).toEqual({
      min: -1000, // 往左頂到 0
      max: 2000, // 往右頂到與 B 貼齊（模型允許 a.end === b.start）
    });
  });

  it("整批選取時取所有段的交集", () => {
    const range = movableRange(makeSegments(), ["a", "b"], opts);
    // 往左由 A 決定（頂到 0），往右由 B 決定（頂到總長）
    expect(range).toEqual({ min: -1000, max: 5000 });
  });

  it("被夾死時收斂成 {0,0}，沒選到東西才回傳 null", () => {
    // 前後都貼齊 = 真的動不了（再動就重疊）
    const tight = [
      { id: "l", start: 0, end: 1000 },
      { id: "m", start: 1000, end: 2000 },
      { id: "r", start: 2000, end: 3000 },
    ];
    expect(movableRange(tight, ["m"], opts)).toEqual({ min: 0, max: 0 });
    expect(movableRange(tight, [], opts)).toBe(null);

    // 前後各隔一格 → 兩邊各還有一格可以走，不是夾死
    const oneTick = [
      { id: "l", start: 0, end: 1000 },
      { id: "m", start: 1050, end: 2000 },
      { id: "r", start: 2050, end: 3000 },
    ];
    expect(movableRange(oneTick, ["m"], opts)).toEqual({ min: -50, max: 50 });
  });

  it("色塊首尾相接時，拖 0 仍然是 0（不會自己彈開）", () => {
    // segment 模型允許 a.end === b.start（貼上與 trim 都會產生這種形狀）。
    // 這時「與鄰居至少留 50ms」算出來的下界是 +50，若不夾住 0，
    // 拖 0 像素會把色塊往右彈 50ms —— 使用者只是點了一下而已。
    const touching = [
      { id: "x", start: 0, end: 1000 },
      { id: "y", start: 1000, end: 2000 },
    ];
    expect(movableRange(touching, ["y"], opts).min).toBe(0);
    expect(moveSegments(touching, ["y"], 0, opts)).toBe(touching);
    expect(moveSegments(touching, ["y"], -200, opts)).toBe(touching);
  });

  it("沒給總長時往右視為無限，不會算出 NaN", () => {
    // 音檔還沒載入時 duration 是 undefined。舊版會讓 NaN 流進位移計算，
    // 把 start/end 寫成 NaN——那份光表之後怎麼看都是壞的。
    const range = movableRange(makeSegments(), ["b"], {});
    expect(range.max).toBe(Infinity);
    expect(Number.isNaN(range.min)).toBe(false);
  });
});

describe("moveSegments（多段一起搬）", () => {
  it("整批同一個位移量，相對位置不變", () => {
    const next = moveSegments(makeSegments(), ["a", "b"], 500, opts);
    expect(next[0]).toMatchObject({ start: 1500, end: 2500 });
    expect(next[1]).toMatchObject({ start: 4500, end: 5500 });
    // 段與段的間隔不變 —— 使用者搬完之後樂句的節奏要一樣
    expect(next[1].start - next[0].end).toBe(2000);
  });

  it("整批往右頂到總長就停，不會有人被推出去", () => {
    const next = moveSegments(makeSegments(), ["a", "b"], 99_999, opts);
    expect(next[1].end).toBe(DURATION);
    expect(next[0]).toMatchObject({ start: 6000, end: 7000 });
  });

  it("整批往左頂到 0 就停", () => {
    const next = moveSegments(makeSegments(), ["a", "b"], -99_999, opts);
    expect(next[0].start).toBe(0);
    expect(next[1]).toMatchObject({ start: 3000, end: 4000 });
  });

  it("中間夾著沒選到的色塊時，由最靠近它的那一段決定極限", () => {
    // A(sel) 0~1000、M(未選) 2000~3000、B(sel) 4000~5000
    const withMiddle = [
      { id: "a", start: 0, end: 1000 },
      { id: "m", start: 2000, end: 3000 },
      { id: "b", start: 4000, end: 5000 },
    ];
    const next = moveSegments(withMiddle, ["a", "b"], 99_999, opts);

    // A 只能推到與 M 貼齊（+1000），B 雖然還很空也只能跟著 +1000
    expect(next[0]).toMatchObject({ id: "a", start: 1000, end: 2000 });
    expect(next[1]).toBe(withMiddle[1]); // M 沒被選到，reference 都沒換
    expect(next[2]).toMatchObject({ id: "b", start: 5000, end: 6000 });

    // 夾緊保證整批不會越過未選取的鄰居，所以陣列不需要重排也仍然有序
    for (let i = 1; i < next.length; i++) {
      expect(next[i].start).toBeGreaterThanOrEqual(next[i - 1].end);
    }
  });

  it("沒有實際位移時回傳原陣列（不佔一格 undo）", () => {
    const segments = makeSegments();
    expect(moveSegments(segments, ["a", "b"], 0, opts)).toBe(segments);
    expect(moveSegments(segments, [], 500, opts)).toBe(segments);
    expect(moveSegments(segments, ["nope"], 500, opts)).toBe(segments);
  });

  it("接受 Set 或陣列", () => {
    const fromSet = moveSegments(makeSegments(), new Set(["a"]), 500, opts);
    const fromArray = moveSegments(makeSegments(), ["a"], 500, opts);
    expect(fromSet[0]).toEqual(fromArray[0]);
  });

  it("任何位移之後都不重疊、長度不變、都在 [0, duration] 內", () => {
    for (const delta of [-9999, -1234, -50, 50, 1234, 9999]) {
      for (const ids of [["a"], ["b"], ["a", "b"]]) {
        const before = makeSegments();
        const next = moveSegments(before, ids, delta, opts);

        next.forEach((segment, i) => {
          expect(segment.end - segment.start).toBe(
            before[i].end - before[i].start,
          );
          expect(segment.start).toBeGreaterThanOrEqual(0);
          expect(segment.end).toBeLessThanOrEqual(DURATION);
          expect(segment.start % 50).toBe(0);
          if (i > 0) {
            expect(segment.start).toBeGreaterThanOrEqual(next[i - 1].end);
          }
        });
      }
    }
  });
});

describe("moveSegment 的不變式", () => {
  it("任何位移之後都不重疊、都在 [0, duration] 內、長度不變", () => {
    for (const delta of [-9999, -1234, -50, 50, 1234, 9999]) {
      for (const id of ["a", "b"]) {
        const before = makeSegments();
        const next = moveSegment(before, id, delta, opts);
        const original = before.find((s) => s.id === id);
        const moved = next.find((s) => s.id === id);

        expect(moved.end - moved.start).toBe(original.end - original.start);
        expect(moved.start).toBeGreaterThanOrEqual(0);
        expect(moved.end).toBeLessThanOrEqual(DURATION);
        for (let i = 1; i < next.length; i++) {
          expect(next[i].start).toBeGreaterThanOrEqual(next[i - 1].end);
        }
      }
    }
  });
});

describe("movableRangeAcross / moveAcross（跨軌一起搬）", () => {
  const groupOf = (armorIndex, partIndex, segments, ids) => ({
    armorIndex,
    partIndex,
    segments,
    segmentIds: new Set(ids),
  });

  it("可動範圍是每一條各自範圍的交集", () => {
    /*
     * 第一條右邊很空，第二條右邊 3000 就有鄰居擋著。整批共用同一個位移量，
     * 所以整批的上限由被擋住的那一條決定。
     */
    const groups = [
      groupOf(0, 0, [{ id: "a", start: 1000, end: 2000 }], ["a"]),
      groupOf(1, 0, [
        { id: "b", start: 1000, end: 2000 },
        { id: "wall", start: 3000, end: 4000 },
      ], ["b"]),
    ];

    const range = movableRangeAcross(groups, { duration: 100000 });
    // 第二條只能移到與 wall 貼齊（3000）為止 → +1000
    expect(range.max).toBe(1000);
    expect(range.min).toBe(-1000);
  });

  it("整批套用同一個位移量，相對位置不變", () => {
    const groups = [
      groupOf(0, 0, [{ id: "a", start: 1000, end: 2000 }], ["a"]),
      groupOf(1, 0, [{ id: "b", start: 1500, end: 2500 }], ["b"]),
    ];

    const updates = moveAcross(groups, 500, { duration: 100000 });

    expect(updates[0].segments[0].start).toBe(1500);
    expect(updates[1].segments[0].start).toBe(2000);
    // 搬完之後兩條的相對關係還是差 500
    expect(
      updates[1].segments[0].start - updates[0].segments[0].start,
    ).toBe(500);
  });

  it("⚠️ 被擋住的那一條停下來時，其他條也一起停", () => {
    /*
     * 不要讓每一條各自再夾一次——那會讓限制最緊的那條停下而其他條繼續走，
     * 樂句就散開了，而畫面上只是「怎麼有幾條沒跟上」。
     */
    const groups = [
      groupOf(0, 0, [{ id: "a", start: 1000, end: 2000 }], ["a"]),
      groupOf(1, 0, [
        { id: "b", start: 1000, end: 2000 },
        { id: "wall", start: 3000, end: 4000 },
      ], ["b"]),
    ];

    const updates = moveAcross(groups, 5000, { duration: 100000 });

    // 兩條都只走了 1000（被第二條的鄰居夾住）
    expect(updates[0].segments[0].start).toBe(2000);
    expect(updates[1].segments.find((s) => s.id === "b").start).toBe(2000);
  });

  it("沒有實際位移時回傳空陣列（呼叫端才不會佔一格 undo）", () => {
    const groups = [
      groupOf(0, 0, [{ id: "a", start: 1000, end: 2000 }], ["a"]),
    ];
    expect(moveAcross(groups, 10, { duration: 100000 })).toEqual([]);
  });

  it("一條都沒選到東西時回傳 null / 空陣列", () => {
    const groups = [groupOf(0, 0, [{ id: "a", start: 0, end: 1000 }], [])];
    expect(movableRangeAcross(groups, {})).toBeNull();
    expect(moveAcross(groups, 500, {})).toEqual([]);
  });
});
