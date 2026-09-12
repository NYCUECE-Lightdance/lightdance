import { describe, expect, it } from "vitest";
import { TICK_MS } from "../../../constants/time.js";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
  MAX_BPM,
  MIN_BPM,
  MIN_GAP_PX,
  beatLengthMs,
  beatLines,
  beatLinesForClip,
  clampAnchor,
  clampBeatsPerBar,
  clampBpm,
  pickLevel,
} from "../tempo.js";

/** 一首排好位置的歌 */
const song = (over = {}) => ({
  id: "s",
  start: 0,
  end: 10000,
  bpm: 120,
  beatAnchor: 0,
  beatsPerBar: 4,
  ...over,
});

describe("beatLengthMs", () => {
  it("120 BPM 是半秒一拍", () => {
    expect(beatLengthMs(120)).toBe(500);
  });

  it("實際會遇到的速度不是 50 的倍數——格線只能是輔助線", () => {
    expect(beatLengthMs(128)).toBeCloseTo(468.75, 5);
    expect(beatLengthMs(128) % TICK_MS).not.toBe(0);
  });

  it("壞值回 0，不讓 NaN/Infinity 流進位置運算", () => {
    expect(beatLengthMs(0)).toBe(0);
    expect(beatLengthMs(-10)).toBe(0);
    expect(beatLengthMs("abc")).toBe(0);
    expect(beatLengthMs(undefined)).toBe(0);
  });
});

describe("輸入的收斂", () => {
  it("BPM 夾在合理範圍，壞值退回預設", () => {
    expect(clampBpm(128)).toBe(128);
    expect(clampBpm(1)).toBe(MIN_BPM);
    expect(clampBpm(9999)).toBe(MAX_BPM);
    expect(clampBpm("x")).toBe(DEFAULT_BPM);
    expect(clampBpm(127.6)).toBe(128); // 整數
  });

  it("一小節至少一拍——0 會讓小節線除以零", () => {
    expect(clampBeatsPerBar(4)).toBe(4);
    expect(clampBeatsPerBar(0)).toBe(1);
    expect(clampBeatsPerBar(-3)).toBe(1);
    expect(clampBeatsPerBar("x")).toBe(DEFAULT_BEATS_PER_BAR);
  });

  it("第一拍的位置對齊網格且不為負", () => {
    expect(clampAnchor(1234)).toBe(1250);
    expect(clampAnchor(-5)).toBe(0);
    expect(clampAnchor("x")).toBe(0);
  });
});

describe("pickLevel（密度由像素推導）", () => {
  const px = (msPerScreen, widthPx) => widthPx / msPerScreen;

  it("放很大時畫得到四分之一拍", () => {
    // 120 BPM：四分之一拍 125ms。一屏 5 秒、1000px → 0.2 px/ms → 25px 一格
    expect(pickLevel({ bpm: 120, pxPerMs: px(5000, 1000) })).toBe("quarter");
  });

  it("縮小之後逐層退回整拍、小節", () => {
    expect(pickLevel({ bpm: 120, pxPerMs: px(20000, 1000) })).toBe("half");
    expect(pickLevel({ bpm: 120, pxPerMs: px(40000, 1000) })).toBe("beat");
    expect(pickLevel({ bpm: 120, pxPerMs: px(150000, 1000) })).toBe("bar");
  });

  it("連小節線都擠在一起就整片不畫，不要畫成一塊實心", () => {
    // 五分鐘的表演塞進 1000px：一小節 2 秒 → 6.7px，小於門檻
    expect(pickLevel({ bpm: 120, pxPerMs: px(300000, 1000) })).toBeNull();
  });

  it("回傳的層級一定滿足最小間距", () => {
    const pxPerMs = px(30000, 1200);
    const level = pickLevel({ bpm: 128, pxPerMs });
    const perBeat = { quarter: 4, half: 2, beat: 1, bar: 1 / 4 }[level];
    expect((beatLengthMs(128) / perBeat) * pxPerMs).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it("沒有速度、還沒量到寬度時回 null", () => {
    expect(pickLevel({ bpm: 0, pxPerMs: 1 })).toBeNull();
    expect(pickLevel({ bpm: 120, pxPerMs: 0 })).toBeNull();
  });
});

describe("beatLinesForClip", () => {
  it("整拍層級：每一拍一條，每四拍是小節線", () => {
    const lines = beatLinesForClip(song({ end: 2000 }), {}, "beat");

    expect(lines.map((l) => l.time)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(lines.map((l) => l.level)).toEqual(["bar", "beat", "beat", "beat", "bar"]);
  });

  it("四分之一拍層級：拍點仍然標成 beat、小節仍然標成 bar", () => {
    const lines = beatLinesForClip(song({ end: 500 }), {}, "quarter");

    expect(lines.map((l) => l.time)).toEqual([0, 125, 250, 375, 500]);
    expect(lines.map((l) => l.level)).toEqual(["bar", "sub", "sub", "sub", "beat"]);
  });

  it("小節層級只畫小節線", () => {
    const lines = beatLinesForClip(song({ end: 8000 }), {}, "bar");

    expect(lines.map((l) => l.time)).toEqual([0, 2000, 4000, 6000, 8000]);
    expect(lines.every((l) => l.level === "bar")).toBe(true);
  });

  /*
   * 第一拍幾乎不會落在歌的起點（前奏、淡入）。只從 anchor 往後畫的話，
   * 前奏那一段會是一片空白——而那正是最需要看到拍在哪的地方。
   */
  it("anchor 之前那一段也有格線", () => {
    const lines = beatLinesForClip(song({ end: 2000, beatAnchor: 750 }), {}, "beat");

    expect(lines.map((l) => l.time)).toEqual([250, 750, 1250, 1750]);
    // 750 是第 0 拍 → 小節線；250 是第 −1 拍
    expect(lines.find((l) => l.time === 750).level).toBe("bar");
    expect(lines.find((l) => l.time === 250).level).toBe("beat");
  });

  it("負的拍序也算得出小節線", () => {
    const lines = beatLinesForClip(song({ end: 3000, beatAnchor: 2000 }), {}, "beat");
    const bars = lines.filter((l) => l.level === "bar").map((l) => l.time);

    // 第 0 拍在 2000，往前每四拍一條 → 0
    expect(bars).toEqual([0, 2000]);
  });

  it("clip 不從 0 開始時，格線跟著整首歌平移", () => {
    const lines = beatLinesForClip(
      song({ start: 10000, end: 11000, beatAnchor: 250 }),
      {},
      "beat",
    );

    expect(lines.map((l) => l.time)).toEqual([10250, 10750]);
  });

  it("只畫可視範圍內的", () => {
    const lines = beatLinesForClip(song({ end: 10000 }), { from: 2000, to: 3000 }, "beat");

    expect(lines[0].time).toBe(2000);
    expect(lines[lines.length - 1].time).toBe(3000);
  });

  it("範圍在 clip 外面就沒有東西", () => {
    expect(beatLinesForClip(song({ end: 1000 }), { from: 5000, to: 6000 }, "beat")).toEqual([]);
  });

  it("沒有速度、沒有層級、沒有 clip 都回空陣列", () => {
    expect(beatLinesForClip(song({ bpm: 0 }), {}, "beat")).toEqual([]);
    expect(beatLinesForClip(song(), {}, null)).toEqual([]);
    expect(beatLinesForClip(null, {}, "beat")).toEqual([]);
  });

  /*
   * 128 BPM 的拍點不落在 50ms 網格上。這裡刻意**不**四捨五入——格線畫的是
   * 音樂真正的位置，量化是拖曳/輸出那一端的事。混在一起的話，畫面上的線與
   * 實際拍點會差最多 25ms，而使用者是照著線在對拍的。
   */
  it("格線不對齊 50ms 網格：它畫的是音樂的位置，不是韌體的格子", () => {
    const lines = beatLinesForClip(song({ bpm: 128, end: 2000 }), {}, "beat");

    expect(lines[1].time).toBeCloseTo(468.75, 5);
    expect(lines[2].time).toBeCloseTo(937.5, 5);
  });
});

describe("beatLines（整場）", () => {
  it("逐首用自己的速度與相位", () => {
    const clips = [
      song({ id: "a", start: 0, end: 1000, bpm: 120 }),
      song({ id: "b", start: 1000, end: 2000, bpm: 240, beatAnchor: 0 }),
    ];

    const lines = beatLines(clips, { pxPerMs: 1 });
    const times = lines.map((l) => l.time);

    expect(times).toContain(500); // 第一首：120 BPM → 每 500ms
    expect(times).toContain(1250); // 第二首：240 BPM → 每 250ms
  });

  it("依時間遞增（呼叫端不必自己排）", () => {
    const lines = beatLines(
      [song({ start: 5000, end: 7000 }), song({ start: 0, end: 5000 })],
      { pxPerMs: 1 },
    );
    const times = lines.map((l) => l.time);

    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  /*
   * 兩首歌在接縫重疊時可能在**同一毫秒**各有一條線（速度成倍數關係時必然發生）。
   * 呼叫端要拿 clipId 當 key 的一部分，只用時間的話 React 會抱怨重複的 key
   * 並漏畫其中一條——實測 e2e 就是這樣紅的。
   */
  it("每一條線都標明是誰畫的", () => {
    const clips = [
      song({ id: "a", start: 0, end: 30000, bpm: 120 }),
      song({ id: "b", start: 28000, end: 58000, bpm: 120 }),
    ];

    const lines = beatLines(clips, { pxPerMs: 0.05 });
    const at30000 = lines.filter((l) => l.time === 30000);

    expect(at30000).toHaveLength(2);
    expect(at30000.map((l) => l.clipId).sort()).toEqual(["a", "b"]);

    const keys = lines.map((l) => `${l.clipId}-${l.level}-${l.time}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("接縫重疊處兩首的格線都在——那段時間兩首確實都在響", () => {
    const clips = [
      song({ id: "a", start: 0, end: 2000, bpm: 120 }),
      song({ id: "b", start: 1500, end: 3500, bpm: 180, beatAnchor: 0 }),
    ];

    const inSeam = beatLines(clips, { pxPerMs: 1 }).filter(
      (l) => l.time > 1500 && l.time < 2000,
    );

    // 兩首在重疊區各有自己的拍點，間隔不同所以一定不會剛好重合
    expect(inSeam.length).toBeGreaterThan(1);
  });

  it("空清單、沒有寬度都回空陣列", () => {
    expect(beatLines([], { pxPerMs: 1 })).toEqual([]);
    expect(beatLines(null, { pxPerMs: 1 })).toEqual([]);
    expect(beatLines([song()], { pxPerMs: 0 })).toEqual([]);
  });

  it("整場的線數不會爆掉", () => {
    const lines = beatLines([song({ start: 0, end: 600000, bpm: 300 })], {
      pxPerMs: 10,
    });
    expect(lines.length).toBeLessThanOrEqual(4000);
  });
});
