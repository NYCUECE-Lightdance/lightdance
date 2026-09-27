/**
 * 光表層級操作的測試。
 *
 * 這一層的正確性有兩面：**改對了東西**，以及**沒改到的東西 reference 不變**。
 * 後者不是最佳化——逐部位訂閱與 `React.memo` 全靠 reference 判斷「我這條有沒有
 * 變」，一次編輯若讓整張表逐層重建，154 條 Timeline 與 7 個 Armor 會全部重繪。
 * 那在功能測試裡完全看不出來，只有手感上會發現拖曳開始卡。
 */
import { describe, it, expect } from "vitest";

import {
  updateParts,
  mapSelectedParts,
  partsOfSelection,
  trackMoveRange,
  moveSegmentsToTracks,
} from "../table.js";

/** 3 位舞者 × 4 個部位，每格放一個可辨識的 segment */
const makeTable = () =>
  Array.from({ length: 3 }, (_, a) =>
    Array.from({ length: 4 }, (_, p) => [
      { id: `s-${a}-${p}`, start: 0, end: 1000, colorStart: { A: 1 } },
    ]),
  );

const group = (armorIndex, partIndex, ...ids) => ({
  armorIndex,
  partIndex,
  segmentIds: new Set(ids),
});

describe("updateParts", () => {
  it("換掉指定的部位，其餘保持原 reference", () => {
    const table = makeTable();
    const next = updateParts(table, [
      { armorIndex: 1, partIndex: 2, segments: [] },
    ]);

    expect(next[1][2]).toEqual([]);
    // 同一位舞者的其他部位：陣列本身沒換
    expect(next[1][0]).toBe(table[1][0]);
    // 完全沒被動到的舞者：整列沿用
    expect(next[0]).toBe(table[0]);
    expect(next[2]).toBe(table[2]);
  });

  it("一次換好幾條，包含同一位舞者的兩個部位", () => {
    const table = makeTable();
    const next = updateParts(table, [
      { armorIndex: 0, partIndex: 1, segments: [] },
      { armorIndex: 0, partIndex: 3, segments: [] },
      { armorIndex: 2, partIndex: 0, segments: [] },
    ]);

    expect(next[0][1]).toEqual([]);
    expect(next[0][3]).toEqual([]);
    expect(next[2][0]).toEqual([]);
    expect(next[0][0]).toBe(table[0][0]);
    expect(next[1]).toBe(table[1]);
  });

  it("沒有任何一條真的改變時回傳原表", () => {
    const table = makeTable();

    expect(updateParts(table, [])).toBe(table);
    // 傳的是原本那個陣列 = 沒變
    expect(
      updateParts(table, [
        { armorIndex: 0, partIndex: 0, segments: table[0][0] },
      ]),
    ).toBe(table);
  });

  it("指到不存在的部位時跳過，不會長出新欄位", () => {
    const table = makeTable();
    const next = updateParts(table, [
      { armorIndex: 9, partIndex: 0, segments: [] },
      { armorIndex: 0, partIndex: 99, segments: [] },
    ]);

    expect(next).toBe(table);
    expect(next.length).toBe(3);
    expect(next[0].length).toBe(4);
  });
});

describe("mapSelectedParts", () => {
  it("選取跨軌時，每一條各跑一次", () => {
    const table = makeTable();
    const seen = [];

    const next = mapSelectedParts(
      table,
      [group(0, 0, "s-0-0"), group(2, 3, "s-2-3")],
      (segments, ids, where) => {
        seen.push(where);
        return segments.filter((segment) => !ids.has(segment.id));
      },
    );

    expect(seen).toEqual([
      { armorIndex: 0, partIndex: 0 },
      { armorIndex: 2, partIndex: 3 },
    ]);
    expect(next[0][0]).toEqual([]);
    expect(next[2][3]).toEqual([]);
    // 沒被選到的那幾條完全沒動
    expect(next[1]).toBe(table[1]);
    expect(next[0][1]).toBe(table[0][1]);
  });

  it("fn 回傳原陣列的那幾條不算改變", () => {
    const table = makeTable();
    const next = mapSelectedParts(
      table,
      [group(0, 0, "s-0-0"), group(1, 1, "s-1-1")],
      (segments, ids, where) =>
        where.armorIndex === 0 ? [] : segments, // 只有第一條真的改
    );

    expect(next[0][0]).toEqual([]);
    expect(next[1]).toBe(table[1]);
  });

  it("每一條都沒變時回傳原表（呼叫端才不會佔一格 undo）", () => {
    const table = makeTable();
    expect(
      mapSelectedParts(table, [group(0, 0, "s-0-0")], (segments) => segments),
    ).toBe(table);
  });

  it("沒有選取時回傳原表", () => {
    const table = makeTable();
    expect(mapSelectedParts(table, [], () => [])).toBe(table);
  });

  it("id 集合是空的（只選了軌、沒選色塊）時 fn 照樣收到那一條", () => {
    const table = makeTable();
    const seen = [];

    mapSelectedParts(table, [group(0, 2)], (segments, ids, where) => {
      seen.push({ ...where, size: ids.size });
      return segments;
    });

    // 「在播放頭放一個色塊」要的是部位而不是色塊，所以空集合不能被濾掉
    expect(seen).toEqual([{ armorIndex: 0, partIndex: 2, size: 0 }]);
  });
});

describe("partsOfSelection", () => {
  it("附上每一條的內容", () => {
    const table = makeTable();
    const parts = partsOfSelection(table, [group(1, 1, "s-1-1")]);

    expect(parts).toHaveLength(1);
    expect(parts[0].segments).toBe(table[1][1]);
  });

  it("指不到的部位直接略過（選取可能是 undo 之前的）", () => {
    const table = makeTable();
    expect(partsOfSelection(table, [group(9, 9, "x")])).toEqual([]);
  });
});

describe("trackMoveRange", () => {
  /*
   * ⚠️ 換軌拖曳的規則和同軌**刻意不一樣**：同軌撞到鄰居就停，換軌是覆蓋，
   * 所以唯一的限制是不要跑出表演的時間範圍。
   */
  const groups = [
    {
      segments: [
        { id: "a", start: 1000, end: 2000 },
        { id: "other", start: 5000, end: 6000 },
      ],
      segmentIds: new Set(["a"]),
    },
    {
      segments: [{ id: "b", start: 3000, end: 4000 }],
      segmentIds: new Set(["b"]),
    },
  ];

  it("往左到最早那一段的起點，往右到最晚那一段的終點", () => {
    expect(trackMoveRange(groups, { duration: 10000 })).toEqual({
      min: -1000, // 最早的 a 從 1000 起
      max: 6000, // 最晚的 b 到 4000，離 10000 還有 6000
    });
  });

  it("不看未選取的鄰居——那正是換軌與同軌的差別", () => {
    // 同一條軌上的 `other` 就在 5000，同軌拖曳會被它擋住；換軌不會
    expect(trackMoveRange(groups, { duration: 10000 }).max).toBe(6000);
  });

  it("表演長度還沒載入時往右不設限，但不會流出 NaN", () => {
    const range = trackMoveRange(groups, {});
    expect(range.min).toBe(-1000);
    expect(range.max).toBe(Infinity);
  });

  it("一段都沒選到時回傳 null", () => {
    expect(
      trackMoveRange([{ segments: [{ id: "a", start: 0, end: 1 }], segmentIds: new Set() }], {}),
    ).toBeNull();
  });
});

describe("moveSegmentsToTracks", () => {
  const table = () => [
    [
      [{ id: "a", start: 1000, end: 2000 }],
      [{ id: "b", start: 1000, end: 2000 }],
      [],
    ],
  ];

  const move = (from, to, ids, segments) => ({
    armorIndex: 0,
    partIndex: from,
    segmentIds: new Set(ids),
    segments,
    to: { armorIndex: 0, partIndex: to },
  });

  it("搬過去之後來源就沒有了", () => {
    const before = table();
    const { table: after } = moveSegmentsToTracks(before, [
      move(0, 2, ["a"], before[0][0]),
    ]);

    expect(after[0][0]).toEqual([]);
    expect(after[0][2].map((s) => s.id)).toEqual(["a"]);
  });

  it("id 保持原樣：選取才跟得過去", () => {
    const before = table();
    const { table: after, selections } = moveSegmentsToTracks(before, [
      move(0, 2, ["a"], before[0][0]),
    ]);

    expect(after[0][2][0].id).toBe("a");
    expect(selections).toEqual([
      { armorIndex: 0, partIndex: 2, segmentId: "a" },
    ]);
  });

  it("落點上原本的內容被裁掉（和貼上同一套碰撞規則）", () => {
    const before = [[[{ id: "a", start: 1000, end: 2000 }], [{ id: "old", start: 0, end: 10000 }]]];
    const { table: after } = moveSegmentsToTracks(before, [
      move(0, 1, ["a"], before[0][0]),
    ]);

    expect(after[0][1].map((s) => [s.start, s.end])).toEqual([
      [0, 1000],
      [1000, 2000],
      [2000, 10000],
    ]);
  });

  it("時間也可以同時平移", () => {
    const before = table();
    const { table: after } = moveSegmentsToTracks(
      before,
      [move(0, 2, ["a"], before[0][0])],
      { deltaMs: 3000 },
    );

    expect(after[0][2].map((s) => [s.start, s.end])).toEqual([[4000, 5000]]);
  });

  it("⚠️ 來源與目標重疊時不會互相吃掉（先全部移除、再全部插入）", () => {
    /*
     * 兩條一起往下拖一格：第二條同時是第一條的目標與它自己的來源。
     * 邊移邊插的話，後處理的那一條會把前一條剛搬進來的東西當成
     * 「落點上原本就有的」再裁一次——而那看起來只是「怎麼少了一段」。
     */
    const before = table();
    const { table: after } = moveSegmentsToTracks(before, [
      move(0, 1, ["a"], before[0][0]),
      move(1, 2, ["b"], before[0][1]),
    ]);

    expect(after[0][0]).toEqual([]);
    expect(after[0][1].map((s) => s.id)).toEqual(["a"]);
    expect(after[0][2].map((s) => s.id)).toEqual(["b"]);
  });

  it("沒有東西要搬時回傳原表", () => {
    const before = table();
    expect(moveSegmentsToTracks(before, []).table).toBe(before);
  });
});

describe("換軌落在舞者沒有的部位上", () => {
  /*
   * ⚠️ 這一組守的是**資料會不會憑空消失**，不只是「有沒有擋下來」。
   *
   * `moveSegmentsToTracks` 是兩階段的：先把段從來源移除，再插進目標。
   * 所以「插入那邊放棄」等於段被刪掉了——來源已經清空，落點沒有接住，
   * 而使用者看到的是「我拖了一下，色塊不見了」。目標的合法性必須在移除
   * 之前就問完。
   *
   * `ACCESSORY_CONFIGS`：舞者 0 與 5 沒帶道具、舞者 6 是匕首（14-18）、
   * 舞者 3 是刀（14-21 全有）。
   */
  const fullTable = () =>
    Array.from({ length: 7 }, () => Array.from({ length: 22 }, () => []));

  const withSegment = (armorIndex, partIndex) => {
    const table = fullTable();
    table[armorIndex][partIndex] = [{ id: "x", start: 1000, end: 2000 }];
    return table;
  };

  const moveTo = (table, from, to) => ({
    armorIndex: from.armorIndex,
    partIndex: from.partIndex,
    segmentIds: new Set(["x"]),
    segments: table[from.armorIndex][from.partIndex],
    to,
  });

  it("目標是那位舞者沒有的部位時整個放棄，來源不會被清掉", () => {
    const before = withSegment(3, 14); // 舞者 3 的刀身
    const { table: after } = moveSegmentsToTracks(before, [
      moveTo(before, { armorIndex: 3, partIndex: 14 }, { armorIndex: 0, partIndex: 14 }),
    ]);

    // 沒搬成 → 原本那一段要還在原地，不能不見
    expect(after[3][14].map((s) => s.id)).toEqual(["x"]);
    expect(after[0][14]).toEqual([]);
    expect(after).toBe(before); // 什麼都沒變，連 reference 都不該換
  });

  it("舞者 6 只有 14-18，搬到 19 會被擋下來", () => {
    const before = withSegment(6, 18);
    const { table: after } = moveSegmentsToTracks(before, [
      moveTo(before, { armorIndex: 6, partIndex: 18 }, { armorIndex: 6, partIndex: 19 }),
    ]);

    expect(after[6][18].map((s) => s.id)).toEqual(["x"]);
    expect(after[6][19]).toEqual([]);
  });

  it("合法的目標照常搬，選取跟著走", () => {
    const before = withSegment(6, 18);
    const { table: after, selections } = moveSegmentsToTracks(before, [
      moveTo(before, { armorIndex: 6, partIndex: 18 }, { armorIndex: 6, partIndex: 17 }),
    ]);

    expect(after[6][18]).toEqual([]);
    expect(after[6][17].map((s) => s.id)).toEqual(["x"]);
    expect(selections).toEqual([
      { armorIndex: 6, partIndex: 17, segmentId: "x" },
    ]);
  });
});
