/**
 * 頻閃改成 segment 之後，**韌體看到的東西必須一模一樣**。
 *
 * 舊模型的頻閃是「每個週期塞一個色點，再在 `週期 - 10ms` 塞一個純黑點」——
 * 那 10ms 的偏移是黑色哨兵的產物，不落在網格上。新模型改成「亮一段，
 * 最後一格留空隙」，壓平時空隙前會在**網格整點**發黑點。
 *
 * 兩者的毫秒數不同（1490 vs 1450），但韌體吃的是 `floor(ms / TICK_MS)`，
 * 兩個值落在同一格。這支測試把這件事鎖住——它是「可以放心改資料形狀」的
 * 唯一證據，光看畫面看不出差別。
 */
import { describe, it, expect } from "vitest";
import { TICK_MS } from "../../../constants/time.js";
import { segmentsToKeyframes } from "../convert.js";

const DURATION = 10_000;

/**
 * 舊模型的黑色哨兵offset：色塊結束前 10ms 插一個純黑關鍵格。
 *
 * 這個數字在 Phase 5g 已經從專案裡消失，只留在這裡當作**比對基準**——
 * 沒有它就沒辦法證明新舊兩版壓平出來的東西韌體看起來一樣。
 */
const LEGACY_BLACK_SENTINEL_MS = 10;
const RED = { R: 255, G: 0, B: 0, A: 1 };
const BLACK = { R: 0, G: 0, B: 0, A: 1 };

/** 韌體看到的是這個：每個關鍵格落在哪一格、是什麼顏色 */
const toFirmwareRows = (keyframes) =>
  keyframes.map((point) => ({
    tick: Math.floor(point.time / TICK_MS),
    lit: !(point.color.R === 0 && point.color.G === 0 && point.color.B === 0),
  }));

/** 舊模型：色點 + 「週期 − 10ms」的黑哨兵 */
const legacyBlink = (start, period, count) => {
  const points = [];
  for (let i = 0; i < count; i++) {
    const base = start + i * period;
    points.push({ time: base, color: RED, linear: 0 });
    points.push({
      time: base + period - LEGACY_BLACK_SENTINEL_MS,
      color: BLACK,
      linear: 0,
    });
  }
  return points;
};

/** 新模型：亮 `period − TICK_MS`，最後一格是空隙 */
const segmentBlink = (start, period, count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `pulse-${i}`,
    start: start + i * period,
    end: start + i * period + period - TICK_MS,
    colorStart: RED,
    colorEnd: RED,
    linear: 0,
  }));

describe("頻閃：segment 版與舊 keyframe 版的韌體輸出等價", () => {
  it.each([
    [100, 10],
    [150, 6],
    [200, 5],
    [500, 2],
    [1000, 1],
  ])("週期 %ims、%i 次閃爍", (period, count) => {
    const start = 1000;
    const legacy = toFirmwareRows(legacyBlink(start, period, count));
    const modern = toFirmwareRows(
      segmentsToKeyframes(segmentBlink(start, period, count), {
        duration: DURATION,
      }),
    );

    // 新模型壓平時會在開頭補一個黑點（0ms 起是熄滅的），舊模型的資料片段
    // 沒有那一段脈絡，所以比對時對齊到第一個亮起的位置。
    const firstLit = modern.findIndex((row) => row.lit);
    const aligned = modern.slice(firstLit, firstLit + legacy.length);

    expect(aligned).toEqual(legacy);
  });

  it("熄滅的格子確實在每個週期的最後一格", () => {
    const rows = toFirmwareRows(
      segmentsToKeyframes(segmentBlink(1000, 200, 3), { duration: DURATION }),
    );
    const lit = rows.filter((r) => r.lit).map((r) => r.tick);
    const dark = rows.filter((r) => !r.lit).map((r) => r.tick);

    // 200ms 週期 = 4 格：亮的落在 20、24、28；滅的落在 23、27、31
    expect(lit).toEqual([20, 24, 28]);
    expect(dark).toEqual(expect.arrayContaining([23, 27, 31]));
  });
});
