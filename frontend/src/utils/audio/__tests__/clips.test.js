import { describe, it, expect } from "vitest";
import { TICK_MS } from "../../../constants/time.js";
import {
  DEFAULT_OVERLAP_MS,
  MAX_OVERLAP_MS,
  addClip,
  applyMeasuredLengths,
  createClip,
  migrateClips,
  moveClip,
  nameFromFile,
  removeClip,
  renameClip,
  resequence,
  sameClipTimeline,
  setClipTempo,
  totalDuration,
} from "../clips.js";

/** 測試用：長度指定好的 clip（id 固定，斷言才讀得懂） */
const clip = (id, lengthMs, extra = {}) => ({
  id,
  name: id,
  sourceFile: `${id}.mp3`,
  sourceOffset: 0,
  lengthMs,
  start: 0,
  end: 0,
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  bpm: 120,
  beatAnchor: 0,
  beatsPerBar: 4,
  ...extra,
});

describe("nameFromFile", () => {
  it("去掉路徑與副檔名", () => {
    expect(nameFromFile("/music/wjr/opening.mp3")).toBe("opening");
    expect(nameFromFile("solo.wav")).toBe("solo");
  });

  it("沒有副檔名時原樣保留", () => {
    expect(nameFromFile("intro")).toBe("intro");
  });

  it("空字串退回預設名，不會產生無名的 clip", () => {
    expect(nameFromFile("")).toBe("未命名");
    expect(nameFromFile()).toBe("未命名");
  });
});

describe("createClip", () => {
  it("名字沒給時從檔名推", () => {
    expect(createClip({ sourceFile: "/music/a/b.mp3", durationMs: 1000 }).name).toBe("b");
  });

  it("長度對齊到網格", () => {
    expect(createClip({ sourceFile: "a.mp3", durationMs: 1234 }).lengthMs).toBe(1250);
  });

  it("長度至少一格——零長度的 clip 會讓排程整個算不出來", () => {
    expect(createClip({ sourceFile: "a.mp3", durationMs: 0 }).lengthMs).toBe(TICK_MS);
    expect(createClip({ sourceFile: "a.mp3" }).lengthMs).toBe(TICK_MS);
  });

  it("每個 clip 有自己的 id", () => {
    const a = createClip({ sourceFile: "a.mp3", durationMs: 1000 });
    const b = createClip({ sourceFile: "a.mp3", durationMs: 1000 });
    expect(a.id).not.toBe(b.id);
  });
});

describe("resequence", () => {
  it("預設是硬切：首尾相接、沒有淡入淡出", () => {
    const out = resequence([clip("a", 1000), clip("b", 2000), clip("c", 500)]);

    expect(out.map((c) => [c.start, c.end])).toEqual([
      [0, 1000],
      [1000, 3000],
      [3000, 3500],
    ]);
    expect(out.every((c) => c.fadeIn === 0 && c.fadeOut === 0)).toBe(true);
    expect(DEFAULT_OVERLAP_MS).toBe(0);
  });

  it("有重疊時後一首往前疊，重疊區前淡出後淡入", () => {
    const out = resequence([clip("a", 1000), clip("b", 1000)], { overlapMs: 200 });

    expect(out[0].start).toBe(0);
    expect(out[0].end).toBe(1000);
    expect(out[1].start).toBe(800); // 往前疊 200
    expect(out[1].end).toBe(1800);

    expect(out[0].fadeOut).toBe(200);
    expect(out[1].fadeIn).toBe(200);
  });

  it("第一首不淡入、最後一首不淡出——那是整場的開頭與結尾，不是接縫", () => {
    const out = resequence([clip("a", 1000), clip("b", 1000), clip("c", 1000)], {
      overlapMs: 300,
    });

    expect(out[0].fadeIn).toBe(0);
    expect(out[0].fadeOut).toBe(300);
    expect(out[1].fadeIn).toBe(300);
    expect(out[1].fadeOut).toBe(300);
    expect(out[2].fadeIn).toBe(300);
    expect(out[2].fadeOut).toBe(0);
  });

  it("重疊比歌還長時夾到兩首都還留得下一格，順序不會反過來", () => {
    // 中間那首只有 100ms，而重疊要 2000ms
    const out = resequence([clip("a", 5000), clip("b", 100), clip("c", 5000)], {
      overlapMs: 2000,
    });

    // 起點必須嚴格遞增，否則清單順序與時間順序會對不起來
    expect(out[0].start).toBeLessThan(out[1].start);
    expect(out[1].start).toBeLessThan(out[2].start);

    // 接縫被夾到「短的那一首減一格」
    expect(out[0].fadeOut).toBe(50);
    expect(out[1].fadeIn).toBe(50);
    expect(out[1].fadeOut).toBe(50);
    expect(out[2].fadeIn).toBe(50);
  });

  it("淡出長度不會超過實際的重疊區", () => {
    const out = resequence([clip("a", 400), clip("b", 3000)], { overlapMs: 1000 });
    const seam = out[0].end - out[1].start;

    expect(out[0].fadeOut).toBe(seam);
    expect(out[1].fadeIn).toBe(seam);
    expect(seam).toBeLessThan(out[0].lengthMs);
  });

  it("重疊夾在 0 與上限之間，壞值當 0", () => {
    const two = [clip("a", 60000), clip("b", 60000)];

    expect(resequence(two, { overlapMs: -500 })[0].fadeOut).toBe(0);
    expect(resequence(two, { overlapMs: 999999 })[0].fadeOut).toBe(MAX_OVERLAP_MS);
    expect(resequence(two, { overlapMs: NaN })[0].fadeOut).toBe(0);
  });

  it("重疊對齊到網格——不對齊的話接縫會跟燈光色塊永遠差幾毫秒", () => {
    const out = resequence([clip("a", 5000), clip("b", 5000)], { overlapMs: 233 });

    expect(out[0].fadeOut % TICK_MS).toBe(0);
    expect(out[1].start % TICK_MS).toBe(0);
  });

  it("沒有 lengthMs 時從 start/end 推", () => {
    const out = resequence([{ id: "a", start: 500, end: 2500 }]);
    expect(out[0]).toMatchObject({ start: 0, end: 2000, lengthMs: 2000 });
  });

  it("空清單與非陣列都回空陣列", () => {
    expect(resequence([])).toEqual([]);
    expect(resequence(null)).toEqual([]);
    expect(resequence(undefined)).toEqual([]);
  });

  it("壞掉的長度不會讓 NaN 流進位置", () => {
    const out = resequence([{ id: "a" }, clip("b", 1000)]);
    expect(out.every((c) => Number.isFinite(c.start) && Number.isFinite(c.end))).toBe(true);
  });

  it("排完之後 clip 一定按起點排序", () => {
    const out = resequence([clip("a", 3000), clip("b", 1000), clip("c", 7000)], {
      overlapMs: 500,
    });
    const starts = out.map((c) => c.start);
    expect([...starts].sort((x, y) => x - y)).toEqual(starts);
  });
});

describe("applyMeasuredLengths", () => {
  it("解碼完的長度補上去並重排位置", () => {
    const list = resequence([clip("a", TICK_MS), clip("b", TICK_MS)]);
    const out = applyMeasuredLengths(list, {
      "a.mp3": 30000,
      "b.mp3": 20000,
    });

    expect(out.map((c) => c.lengthMs)).toEqual([30000, 20000]);
    expect(out.map((c) => [c.start, c.end])).toEqual([
      [0, 30000],
      [30000, 50000],
    ]);
  });

  it("Map 與物件都吃", () => {
    const list = resequence([clip("a", TICK_MS)]);
    const out = applyMeasuredLengths(list, new Map([["a.mp3", 12000]]));
    expect(out[0].lengthMs).toBe(12000);
  });

  it("沒有一條改變時回傳原 reference——它跑在會 dispatch 的載入路徑上", () => {
    const list = resequence([clip("a", 30000)]);
    expect(applyMeasuredLengths(list, { "a.mp3": 30000 })).toBe(list);
    expect(applyMeasuredLengths(list, {})).toBe(list);
    expect(applyMeasuredLengths(list, { "a.mp3": 0 })).toBe(list);
    expect(applyMeasuredLengths(list, { "a.mp3": NaN })).toBe(list);
  });

  it("同一首歌放兩次（安可）兩個 clip 都補到", () => {
    const list = resequence([clip("a", TICK_MS), { ...clip("a", TICK_MS), id: "a2" }]);
    const out = applyMeasuredLengths(list, { "a.mp3": 8000 });

    expect(out.map((c) => c.lengthMs)).toEqual([8000, 8000]);
  });

  it("sourceOffset 之後的部分才算長度", () => {
    const list = resequence([clip("a", TICK_MS, { sourceOffset: 5 })]);
    const out = applyMeasuredLengths(list, { "a.mp3": 30000 });

    expect(out[0].lengthMs).toBe(25000);
  });

  it("補完長度之後接縫照樣夾在兩首之內", () => {
    const list = resequence([clip("a", TICK_MS), clip("b", TICK_MS)]);
    const out = applyMeasuredLengths(list, { "a.mp3": 1000, "b.mp3": 1000 }, {
      overlapMs: 400,
    });

    expect(out[1].start).toBe(600);
    expect(out[0].fadeOut).toBe(400);
  });

  it("空清單不會爆", () => {
    expect(applyMeasuredLengths(undefined, {})).toEqual([]);
  });
});

describe("addClip / removeClip", () => {
  it("加到最後面並重排", () => {
    const out = addClip([clip("a", 1000)], clip("b", 2000));

    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
    expect(out[1].start).toBe(1000);
  });

  it("從空清單加起", () => {
    expect(addClip(undefined, clip("a", 1000))).toHaveLength(1);
    expect(addClip([], clip("a", 1000))[0].start).toBe(0);
  });

  it("移除之後後面的往前補，不會留一個洞", () => {
    const out = removeClip(
      resequence([clip("a", 1000), clip("b", 2000), clip("c", 1000)]),
      "b",
    );

    expect(out.map((c) => c.id)).toEqual(["a", "c"]);
    expect(out[1].start).toBe(1000);
  });

  it("移除不存在的 id 就是沒事發生", () => {
    const list = resequence([clip("a", 1000)]);
    expect(removeClip(list, "nope")).toEqual(list);
  });

  it("移除最後一首之後淡出歸零", () => {
    const out = removeClip(
      resequence([clip("a", 3000), clip("b", 3000)], { overlapMs: 500 }),
      "b",
      { overlapMs: 500 },
    );

    expect(out).toHaveLength(1);
    expect(out[0].fadeOut).toBe(0);
  });
});

describe("moveClip", () => {
  const list = resequence([clip("a", 1000), clip("b", 2000), clip("c", 3000)]);

  it("往後移一格會換順序並重排位置", () => {
    const out = moveClip(list, "a", 1);

    expect(out.map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(out.map((c) => c.start)).toEqual([0, 2000, 3000]);
  });

  it("往前移一格", () => {
    expect(moveClip(list, "c", -1).map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("移到頭或尾之後再移就原樣回傳（同一個 reference，呼叫端可以不 dispatch）", () => {
    expect(moveClip(list, "a", -1)).toBe(list);
    expect(moveClip(list, "c", 1)).toBe(list);
  });

  it("找不到 id 原樣回傳", () => {
    expect(moveClip(list, "nope", 1)).toBe(list);
  });

  it("空清單不會爆", () => {
    expect(moveClip(undefined, "a", 1)).toEqual([]);
  });
});

describe("renameClip", () => {
  const list = resequence([clip("a", 1000), clip("b", 1000)]);

  it("改名不動位置", () => {
    const out = renameClip(list, "a", "開場");

    expect(out[0].name).toBe("開場");
    expect(out[0].start).toBe(list[0].start);
    expect(out[1].name).toBe("b");
  });

  it("前後空白會去掉", () => {
    expect(renameClip(list, "a", "  開場  ")[0].name).toBe("開場");
  });

  it("空字串退回檔名，不允許沒有名字的 clip", () => {
    expect(renameClip(list, "a", "   ")[0].name).toBe("a"); // a.mp3 → a
    expect(renameClip(list, "a", null)[0].name).toBe("a");
  });

  /*
   * 呼叫端統一用 `next === clips` 判斷要不要 dispatch，所以每個函式都要遵守
   * 「沒變就回原 reference」。只要有一個每次都給新陣列，那個判斷就靜靜失效。
   */
  it("名字沒變、或找不到 id 時回傳原 reference", () => {
    expect(renameClip(list, "a", "a")).toBe(list);
    expect(renameClip(list, "nope", "x")).toBe(list);
    expect(renameClip(undefined, "a", "x")).toEqual([]);
  });
});

describe("setClipTempo", () => {
  const list = resequence([clip("a", 10000), clip("b", 10000)]);

  it("改速度不動位置——速度跟播放順序沒有關係", () => {
    const out = setClipTempo(list, "a", { bpm: 128 });

    expect(out[0].bpm).toBe(128);
    expect(out.map((c) => [c.start, c.end])).toEqual(
      list.map((c) => [c.start, c.end]),
    );
  });

  it("只動指名的那一首", () => {
    const out = setClipTempo(list, "a", { bpm: 128 });
    expect(out[1]).toBe(list[1]);
  });

  it("值會收斂：BPM 夾範圍、anchor 對齊網格、一小節至少一拍", () => {
    const out = setClipTempo(list, "a", {
      bpm: 9999,
      beatAnchor: 1234,
      beatsPerBar: 0,
    });

    expect(out[0].bpm).toBe(300);
    expect(out[0].beatAnchor).toBe(1250);
    expect(out[0].beatsPerBar).toBe(1);
  });

  it("沒指定的欄位不動", () => {
    const out = setClipTempo(list, "a", { bpm: 100 });
    expect(out[0].beatsPerBar).toBe(list[0].beatsPerBar);
    expect(out[0].beatAnchor).toBe(list[0].beatAnchor);
  });

  it("值沒變、找不到 id、空清單都回原 reference", () => {
    expect(setClipTempo(list, "a", { bpm: list[0].bpm })).toBe(list);
    expect(setClipTempo(list, "nope", { bpm: 200 })).toBe(list);
    expect(setClipTempo(list, "a", {})).toBe(list);
    expect(setClipTempo(undefined, "a", { bpm: 100 })).toEqual([]);
  });

  it("速度不影響播放，不該讓引擎重排", () => {
    expect(sameClipTimeline(list, setClipTempo(list, "a", { bpm: 128 }))).toBe(true);
  });
});

describe("sameClipTimeline", () => {
  const list = resequence([clip("a", 1000), clip("b", 1000)], { overlapMs: 200 });

  it("同一份清單當然一樣", () => {
    expect(sameClipTimeline(list, list)).toBe(true);
  });

  it("內容相同但是不同物件也算一樣", () => {
    expect(sameClipTimeline(list, list.map((c) => ({ ...c })))).toBe(true);
  });

  it("改名字不影響播放，算一樣", () => {
    const renamed = renameClip(list, "a", "開場");
    expect(sameClipTimeline(list, renamed)).toBe(true);
  });

  it("位置、檔案、接縫、音量任何一項變了就不一樣", () => {
    const bump = (patch) => [{ ...list[0], ...patch }, list[1]];

    expect(sameClipTimeline(list, bump({ start: 50 }))).toBe(false);
    expect(sameClipTimeline(list, bump({ end: 999 }))).toBe(false);
    expect(sameClipTimeline(list, bump({ sourceFile: "x.mp3" }))).toBe(false);
    expect(sameClipTimeline(list, bump({ sourceOffset: 3 }))).toBe(false);
    expect(sameClipTimeline(list, bump({ fadeIn: 10 }))).toBe(false);
    expect(sameClipTimeline(list, bump({ fadeOut: 10 }))).toBe(false);
    expect(sameClipTimeline(list, bump({ gain: 0.5 }))).toBe(false);
  });

  it("長度不同就不一樣，空清單之間一樣", () => {
    expect(sameClipTimeline(list, list.slice(0, 1))).toBe(false);
    expect(sameClipTimeline([], [])).toBe(true);
    expect(sameClipTimeline(undefined, [])).toBe(true);
    expect(sameClipTimeline(undefined, list)).toBe(false);
  });
});

describe("migrateClips", () => {
  it("已經是 clip 清單就原樣用（靠形狀辨認，不看版本號）", () => {
    const existing = resequence([clip("a", 1000)]);
    expect(migrateClips(existing, "ignored.mp3")).toBe(existing);
  });

  it("舊的單曲專案收成一個 clip", () => {
    const out = migrateClips(undefined, "/music/wjr/show.mp3");

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sourceFile: "/music/wjr/show.mp3", name: "show", start: 0 });
  });

  it("沒有音樂就是空清單，不是一個指向 undefined 的 clip", () => {
    expect(migrateClips(undefined, undefined)).toEqual([]);
    expect(migrateClips([], "")).toEqual([]);
  });

  it("遷移出來的長度先是一格，等解碼完再補", () => {
    expect(migrateClips(null, "a.mp3")[0].lengthMs).toBe(TICK_MS);
  });

  /*
   * `useAudioClips` 是每個呼叫端各跑一次的（波形、播放清單、接縫標記三個）。
   * 遷移用隨機 id 的話，同一個舊專案在三個元件眼裡是三個不同的 clip——三邊
   * 畫面都正常，只是對「這是哪一首」沒有共識，而那正是那個 hook 要消滅的東西。
   */
  it("遷移是決定性的：不同呼叫端得到同一個 clip", () => {
    expect(migrateClips([], "show.mp3")).toEqual(migrateClips(null, "show.mp3"));
  });

  it("新加的歌各有各的 id（決定性只適用於遷移）", () => {
    const a = createClip({ sourceFile: "a.mp3", durationMs: 1000 });
    const b = createClip({ sourceFile: "a.mp3", durationMs: 1000 });
    expect(a.id).not.toBe(b.id);
  });

  /*
   * 這裡是外部 JSON 進到程式裡的那道門。少一個欄位都不會丟例外，只會靜靜地
   * 壞掉——少 `name` 是清單上一列空白，少 `gain` 是音量包絡算出 NaN 然後整首
   * 歌沒有聲音。
   */
  it("外部資料缺欄位時補齊，不讓 undefined 流進播放路徑", () => {
    const [out] = migrateClips(
      [{ sourceFile: "opening.mp3", start: 0, end: 4000 }],
      "opening.mp3",
    );

    expect(out).toMatchObject({
      name: "opening",
      sourceOffset: 0,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
      lengthMs: 4000,
    });
    expect(out.id).toBeTruthy();
  });

  it("欄位本來就齊全時回傳原 reference", () => {
    const list = resequence([clip("a", 1000)]);
    expect(migrateClips(list, "a.mp3")).toBe(list);
  });
});

describe("totalDuration 與清單一致", () => {
  it("硬切時是每一首相加", () => {
    const out = resequence([clip("a", 1000), clip("b", 2000)]);
    expect(totalDuration(out)).toBe(3000);
  });

  it("有重疊時會比相加短", () => {
    const out = resequence([clip("a", 1000), clip("b", 2000)], { overlapMs: 400 });
    expect(totalDuration(out)).toBe(2600);
  });
});
