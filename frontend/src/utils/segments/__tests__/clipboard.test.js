/**
 * 剪貼簿與貼上落點的測試。
 *
 * 這裡真正要守住的是**軌道怎麼平移**：貼錯軌不會報錯、不會壞掉，只是燈亮在
 * 別人身上——而排練時沒有人會逐軌對照，通常是彩排當天才發現。
 */
import { describe, it, expect } from "vitest";

import {
  CLIPBOARD_KIND,
  clipboardSpanMs,
  hasContent,
  landingSpans,
  packClipboard,
  phaseRanks,
  planOverwrite,
  planPaste,
  segmentCount,
  sourceSelections,
} from "../clipboard.js";

const seg = (id, start, end, extra = {}) => ({
  id,
  start,
  end,
  colorStart: { R: 255, G: 0, B: 0, A: 1 },
  colorEnd: { R: 255, G: 0, B: 0, A: 1 },
  linear: 0,
  ...extra,
});

/** 3 位舞者 × 4 個部位的空表 */
const emptyTable = () =>
  Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => []));

const groupOf = (armorIndex, partIndex, segments) => ({
  armorIndex,
  partIndex,
  segments,
  segmentIds: new Set(segments.map((s) => s.id)),
});

describe("packClipboard", () => {
  it("把跨軌的選取打包成一個矩形", () => {
    const packed = packClipboard(
      [
        groupOf(0, 0, [seg("a", 1000, 2000)]),
        groupOf(1, 0, [seg("b", 1000, 2000), seg("c", 3000, 4000)]),
      ],
      { armorIndex: 0, partIndex: 0 },
    );

    expect(packed.kind).toBe(CLIPBOARD_KIND);
    expect(packed.parts).toHaveLength(2);
    expect(packed.startTime).toBe(1000);
    expect(packed.endTime).toBe(4000);
  });

  it("startTime 是整份內容最早的起點，不是錨點那一條的", () => {
    /*
     * 七位舞者的同一個樂句起點可能差半拍。用錨點那一條當基準的話，Ctrl+V
     * 對齊之後整組會相對目標偏移那半拍——而使用者以為自己貼在選到的色塊上。
     */
    const packed = packClipboard(
      [
        groupOf(0, 0, [seg("late", 2000, 3000)]), // 錨點這一條比較晚
        groupOf(1, 0, [seg("early", 1000, 2000)]),
      ],
      { armorIndex: 0, partIndex: 0 },
    );

    expect(packed.startTime).toBe(1000);
  });

  it("一段都沒選到時回傳 null", () => {
    expect(packClipboard([groupOf(0, 0, [])], { armorIndex: 0, partIndex: 0 }))
      .toBeNull();
    expect(packClipboard([], { armorIndex: 0, partIndex: 0 })).toBeNull();
  });
});

describe("hasContent", () => {
  it("認不得舊格式", () => {
    // Phase 5e 的單軌剪貼簿
    expect(hasContent({ kind: "segments", segments: [seg("a", 0, 1000)] })).toBe(
      false,
    );
    expect(hasContent(null)).toBe(false);
    expect(hasContent({ kind: CLIPBOARD_KIND, parts: [] })).toBe(false);
  });
});

describe("planPaste：軌道的平移", () => {
  const clipboard = packClipboard(
    [
      groupOf(0, 0, [seg("a", 1000, 2000)]),
      groupOf(0, 1, [seg("b", 1000, 2000)]),
    ],
    { armorIndex: 0, partIndex: 0 },
  );

  it("錨點平移到哪，其餘每一條跟著平移同樣的量", () => {
    const plans = planPaste(emptyTable(), clipboard, {
      armorIndex: 2,
      partIndex: 0,
      timeOffset: 0,
    });

    // 來源是 (0,0) 與 (0,1)，錨點 (0,0) → (2,0)，所以差值是 +2 位舞者
    expect(plans.map((p) => [p.armorIndex, p.partIndex])).toEqual([
      [2, 0],
      [2, 1],
    ]);
  });

  it("平移的是二維座標，換部位一樣成立", () => {
    const plans = planPaste(emptyTable(), clipboard, {
      armorIndex: 0,
      partIndex: 2,
      timeOffset: 0,
    });

    expect(plans.map((p) => [p.armorIndex, p.partIndex])).toEqual([
      [0, 2],
      [0, 3],
    ]);
  });

  it("落在光表範圍外的那幾條整條丟掉，不夾回邊界", () => {
    /*
     * 夾回去的話兩條會疊在同一個部位上，後貼的默默蓋掉先貼的——而那看起來
     * 只是「怎麼少了一條」。丟掉至少是「這條沒貼到」。
     */
    const plans = planPaste(emptyTable(), clipboard, {
      armorIndex: 0,
      partIndex: 3, // (0,3) 收得下，(0,4) 收不下
      timeOffset: 0,
    });

    expect(plans.map((p) => [p.armorIndex, p.partIndex])).toEqual([[0, 3]]);
  });

  it("貼上的是副本：id 全部換新", () => {
    const plans = planPaste(emptyTable(), clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 5000,
    });

    const ids = plans.flatMap((p) => p.pasted.map((s) => s.id));
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("b");
    expect(new Set(ids).size).toBe(2);
  });

  it("時間跟著平移並對齊網格", () => {
    const plans = planPaste(emptyTable(), clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 5030, // 不是 50 的倍數
    });

    expect(plans[0].pasted[0].start).toBe(6050);
    expect(plans[0].pasted[0].end).toBe(7050);
  });

  it("平移到負時間的那些段丟掉，不會寫出 start < 0", () => {
    const plans = planPaste(emptyTable(), clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: -5000,
    });

    expect(plans).toEqual([]);
  });
});

describe("planPaste：與目標既有內容的碰撞", () => {
  it("蓋到的區間被裁掉（trim），沒蓋到的留著", () => {
    const table = emptyTable();
    table[0][0] = [seg("old", 0, 10000, { colorStart: { G: 255 } })];

    const clipboard = packClipboard(
      [groupOf(1, 0, [seg("new", 2000, 3000)])],
      { armorIndex: 1, partIndex: 0 },
    );

    const plans = planPaste(table, clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 0,
    });

    const result = plans[0].segments;
    // 原本的 0..10000 被切成 0..2000 與 3000..10000，中間讓給貼進來的
    expect(result.map((s) => [s.start, s.end])).toEqual([
      [0, 2000],
      [2000, 3000],
      [3000, 10000],
    ]);
  });
});

describe("planOverwrite（Shift+V）", () => {
  it("整條蓋掉，不保留目標原本的內容", () => {
    const table = emptyTable();
    table[2][0] = [seg("old", 0, 10000)];

    const clipboard = packClipboard(
      [groupOf(0, 0, [seg("a", 1000, 2000)])],
      { armorIndex: 0, partIndex: 0 },
    );

    const plans = planOverwrite(table, clipboard, {
      armorIndex: 2,
      partIndex: 0,
    });

    expect(plans[0].segments.map((s) => [s.start, s.end])).toEqual([
      [1000, 2000],
    ]);
  });
});

describe("sourceSelections", () => {
  it("攤平成選取格式，Timeline 才畫得出跨軌的來源標記", () => {
    const clipboard = packClipboard(
      [
        groupOf(0, 0, [seg("a", 0, 1000)]),
        groupOf(1, 2, [seg("b", 0, 1000), seg("c", 2000, 3000)]),
      ],
      { armorIndex: 0, partIndex: 0 },
    );

    expect(sourceSelections(clipboard)).toEqual([
      { armorIndex: 0, partIndex: 0, segmentId: "a" },
      { armorIndex: 1, partIndex: 2, segmentId: "b" },
      { armorIndex: 1, partIndex: 2, segmentId: "c" },
    ]);
  });

  it("空剪貼簿回傳空陣列", () => {
    expect(sourceSelections(null)).toEqual([]);
  });
});

describe("landingSpans（滑鼠預覽的落點）", () => {
  const clipboard = packClipboard(
    [
      groupOf(0, 0, [seg("a", 1000, 2000), seg("b", 3000, 3500)]),
      groupOf(1, 0, [seg("c", 1000, 2000)]),
    ],
    { armorIndex: 0, partIndex: 0 },
  );

  it("和 planPaste 算出同一個落點", () => {
    /*
     * ⚠️ 這一則是這組的重點：預覽畫在 A 而貼下去在 B 是最糟的一種錯——
     * 使用者按下去之前明明看到框在那裡。兩者必須永遠一致。
     */
    // 錨點 (0,0) → (1,0)，所以兩條分別落在 (1,0) 與 (2,0)，都在表內
    const target = { armorIndex: 1, partIndex: 0, timeOffset: 5000 };
    const spans = landingSpans(clipboard, target);
    const planned = planPaste(emptyTable(), clipboard, target).flatMap((p) =>
      p.pasted.map((s) => ({
        armorIndex: p.armorIndex,
        partIndex: p.partIndex,
        start: s.start,
        end: s.end,
      })),
    );

    expect(spans).toEqual(planned);
  });

  it("不需要光表也算得出來（每一幀都會呼叫，不能碰資料）", () => {
    const spans = landingSpans(clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 0,
    });

    expect(spans).toHaveLength(3);
    expect(spans[0]).toEqual({
      armorIndex: 0,
      partIndex: 0,
      start: 1000,
      end: 2000,
    });
  });

  it("不過濾「這個部位存不存在」——那是呼叫端的事", () => {
    /*
     * `landingSpans` 刻意不收光表（每一幀都要算）。所以平移出範圍的落點它照樣
     * 回報，由畫預覽的人決定畫不畫（`PastePreview` 找不到對應的可見軌道就
     * 收起那個框）。這個分工要寫清楚，否則會有人以為兩邊永遠等長。
     */
    const spans = landingSpans(clipboard, {
      armorIndex: 2, // 錨點 +2 → 第二條落在 (3,0)，3 位舞者的表裡沒有
      partIndex: 0,
      timeOffset: 0,
    });

    expect(spans.map((s) => s.armorIndex)).toEqual([2, 2, 3]);
    expect(
      planPaste(emptyTable(), clipboard, {
        armorIndex: 2,
        partIndex: 0,
        timeOffset: 0,
      }).map((p) => p.armorIndex),
    ).toEqual([2]); // planPaste 有表，所以它知道 (3,0) 不存在
  });

  it("空剪貼簿回傳空陣列", () => {
    expect(landingSpans(null, { armorIndex: 0, partIndex: 0 })).toEqual([]);
  });
});

describe("segmentCount / clipboardSpanMs", () => {
  const clipboard = packClipboard(
    [
      groupOf(0, 0, [seg("a", 1000, 2000), seg("b", 3000, 3500)]),
      groupOf(1, 0, [seg("c", 1000, 2000)]),
    ],
    { armorIndex: 0, partIndex: 0 },
  );

  it("數得出總共幾段（預覽要準備幾個 DOM 節點）", () => {
    expect(segmentCount(clipboard)).toBe(3);
    expect(segmentCount(null)).toBe(0);
  });

  it("整份內容的時間長度（預覽用它把落點夾在表演範圍內）", () => {
    expect(clipboardSpanMs(clipboard)).toBe(2500);
    expect(clipboardSpanMs(null)).toBe(0);
  });
});

describe("相位偏移（跑馬燈）", () => {
  /** 三位舞者的同一個部位，各有一個 1000~2000 的色塊 */
  const clipboard = packClipboard(
    [
      groupOf(0, 0, [seg("a", 1000, 2000)]),
      groupOf(1, 0, [seg("b", 1000, 2000)]),
      groupOf(2, 0, [seg("c", 1000, 2000)]),
    ],
    { armorIndex: 0, partIndex: 0 },
  );

  const table = () =>
    Array.from({ length: 4 }, () => Array.from({ length: 2 }, () => []));

  const startsByArmor = (plans) =>
    plans
      .slice()
      .sort((x, y) => x.armorIndex - y.armorIndex)
      .map((p) => p.pasted[0].start);

  it("每往下一條就再往後推一個 phaseMs", () => {
    const plans = planPaste(table(), clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 0,
      phaseMs: 100,
    });

    expect(startsByArmor(plans)).toEqual([1000, 1100, 1200]);
  });

  it("phaseMs 為 0 時和原本完全一樣", () => {
    const withZero = planPaste(table(), clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 0,
      phaseMs: 0,
    });
    const without = planPaste(table(), clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 0,
    });

    expect(startsByArmor(withZero)).toEqual(startsByArmor(without));
  });

  it("⚠️ 負相位是把波倒過來跑，整組仍然落在游標之後", () => {
    /*
     * 直覺寫法 `名次 × phaseMs` 會讓後面幾條跑到游標**之前**，甚至推到負時間
     * 被丟掉——而滑鼠預覽的夾緊只顧得到一邊，畫面上只看得到「怎麼少貼了幾塊」。
     */
    const plans = planPaste(table(), clipboard, {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 0,
      phaseMs: -100,
    });

    // 波從最後一位開始：第 3 位最早，第 1 位最晚，但都不早於原本的 1000
    expect(startsByArmor(plans)).toEqual([1200, 1100, 1000]);
    expect(Math.min(...startsByArmor(plans))).toBeGreaterThanOrEqual(1000);
  });

  it("名次依 (舞者, 部位) 排序，不是選取順序", () => {
    /*
     * 框選的順序取決於使用者從哪個角落開始拉（由下往上拉就整個反過來），
     * 而波要沿著隊形跑。
     */
    const reversed = packClipboard(
      [
        groupOf(2, 0, [seg("c", 1000, 2000)]),
        groupOf(0, 0, [seg("a", 1000, 2000)]),
        groupOf(1, 0, [seg("b", 1000, 2000)]),
      ],
      { armorIndex: 2, partIndex: 0 },
    );

    expect([...phaseRanks(reversed).entries()].sort()).toEqual([
      ["0-0", 0],
      ["1-0", 1],
      ["2-0", 2],
    ]);
  });

  it("預覽與實際落點在有相位時仍然一致", () => {
    const target = {
      armorIndex: 0,
      partIndex: 0,
      timeOffset: 2000,
      phaseMs: 150,
    };
    const spans = landingSpans(clipboard, target);
    const planned = planPaste(table(), clipboard, target).flatMap((p) =>
      p.pasted.map((seg) => ({
        armorIndex: p.armorIndex,
        partIndex: p.partIndex,
        start: seg.start,
        end: seg.end,
      })),
    );

    expect(spans).toEqual(planned);
  });

  it("整份內容的長度要把相位攤開的部分算進去", () => {
    // 三條、每條差 100ms → 比原本多 200ms
    expect(clipboardSpanMs(clipboard)).toBe(1000);
    expect(clipboardSpanMs(clipboard, 100)).toBe(1200);
    expect(clipboardSpanMs(clipboard, -100)).toBe(1200);
  });
});

describe("落點在舞者沒有的部位上", () => {
  /*
   * 光表是 7×22 的滿陣列，所以「這個部位是不是一個陣列」對 22 個部位全部為真
   * ——它擋的是平移出表外，擋不到「這位舞者沒帶那件道具」。而貼上的落點是
   * (舞者, 部位) 的座標差推出來的，所以把七位舞者的飾品一起複製再往下貼一格，
   * 就會落在沒有那件道具的人身上。
   *
   * 症狀是**沒有症狀**：編輯器裡看得到色塊、上傳成功、清單正常，只有演出當天
   * 那盞不存在的燈不會亮。`ACCESSORY_CONFIGS` 裡舞者 0 與 5 沒帶道具，
   * 舞者 6 是匕首（14-18）。
   */
  const fullTable = () =>
    Array.from({ length: 7 }, () => Array.from({ length: 22 }, () => []));

  const clipboardAt = (armorIndex, partIndex) =>
    packClipboard([groupOf(armorIndex, partIndex, [seg("a", 1000, 2000)])], {
      armorIndex,
      partIndex,
    });

  it("貼到沒帶道具的舞者身上會整條丟掉", () => {
    // 從舞者 3（刀，14-21 全有）的 acc0 複製，貼到舞者 0 的 acc0
    const clipboard = clipboardAt(3, 14);
    const plans = planPaste(fullTable(), clipboard, {
      armorIndex: 0,
      partIndex: 14,
      timeOffset: 0,
    });

    expect(plans).toEqual([]);
  });

  it("同一次貼上裡合法的照貼、不合法的丟掉", () => {
    // 舞者 3 的 acc4(18) 與 acc5(19) 一起複製，往下平移三位到舞者 6
    // ——舞者 6 是匕首，只有 14-18，所以 19 那條不該貼進去
    const clipboard = packClipboard(
      [
        groupOf(3, 18, [seg("a", 1000, 2000)]),
        groupOf(3, 19, [seg("b", 1000, 2000)]),
      ],
      { armorIndex: 3, partIndex: 18 },
    );

    const plans = planPaste(fullTable(), clipboard, {
      armorIndex: 6,
      partIndex: 18,
      timeOffset: 0,
    });

    expect(plans.map((p) => [p.armorIndex, p.partIndex])).toEqual([[6, 18]]);
  });

  it("整條覆蓋（Shift+V）走的是同一套規則", () => {
    const clipboard = clipboardAt(3, 21); // 舞者 3 的刀，acc7 是他的
    const plans = planOverwrite(fullTable(), clipboard, {
      armorIndex: 0,
      partIndex: 21, // 舞者 0 沒帶道具
    });

    expect(plans).toEqual([]);
  });

  it("身體部位人人都有，不可以被誤傷", () => {
    const clipboard = clipboardAt(0, 0);
    const plans = planPaste(fullTable(), clipboard, {
      armorIndex: 5,
      partIndex: 13,
      timeOffset: 0,
    });

    expect(plans.map((p) => [p.armorIndex, p.partIndex])).toEqual([[5, 13]]);
  });
});
