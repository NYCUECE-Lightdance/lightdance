/**
 * 刻度密度的規則測試。
 *
 * 這是刻度尺唯一有邏輯的部分——固定「每 5 秒一格」在縮放 8 倍時會擠成一團，
 * 所以密度改成由「相鄰標籤至少 60px」推導。純函式，不需要 DOM。
 */
import { describe, it, expect } from "vitest";
import { pickStepSeconds } from "../TimeRuler.jsx";

const THIRTY_SECONDS = 30_000;

describe("pickStepSeconds", () => {
  it("30 秒的曲子攤在 1200px 上，每 2 秒一格", () => {
    // 1200px / 30s = 40px 每秒；2 秒 = 80px，剛好過 60px 的門檻
    expect(pickStepSeconds(THIRTY_SECONDS, 1200)).toBe(2);
  });

  it("同一首曲子縮到很窄時自動放寬間隔", () => {
    // 300px / 30s = 10px 每秒；要 60px 就得跨 6 秒，取級距裡的 10
    expect(pickStepSeconds(THIRTY_SECONDS, 300)).toBe(10);
  });

  it("放大之後自動變密", () => {
    // 縮放 8 倍：9600px / 30s = 320px 每秒，1 秒就超過門檻
    expect(pickStepSeconds(THIRTY_SECONDS, 9600)).toBe(1);
  });

  it("間隔一律取自「人看得懂」的級距，不會出現 3 秒或 7 秒", () => {
    const nice = new Set([1, 2, 5, 10, 15, 30, 60, 120, 300]);
    for (let width = 100; width <= 12000; width += 137) {
      expect(nice.has(pickStepSeconds(THIRTY_SECONDS, width))).toBe(true);
    }
  });

  it("寬度越大，間隔只會變小或持平（單調）", () => {
    let previous = Infinity;
    for (let width = 100; width <= 12000; width += 100) {
      const step = pickStepSeconds(THIRTY_SECONDS, width);
      expect(step).toBeLessThanOrEqual(previous);
      previous = step;
    }
  });

  it("每個選出來的間隔都真的滿足 60px 門檻（除非已經到級距上限）", () => {
    for (const duration of [10_000, 30_000, 180_000, 600_000]) {
      for (const width of [400, 900, 1600, 4000]) {
        const step = pickStepSeconds(duration, width);
        const gapPx = step * (width / (duration / 1000));
        if (step !== 300) expect(gapPx).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it("duration 或寬度還沒量到時回傳最小間隔，不會爆掉", () => {
    // 首次 render 時 ResizeObserver 還沒回報，duration 也可能是 0
    expect(pickStepSeconds(0, 1200)).toBe(1);
    expect(pickStepSeconds(THIRTY_SECONDS, 0)).toBe(1);
    expect(pickStepSeconds(undefined, undefined)).toBe(1);
  });

  it("很長的曲子不會回傳超出級距的值", () => {
    // 一小時的曲子塞在 200px 裡：怎麼算都不可能滿足 60px，取級距上限
    expect(pickStepSeconds(3_600_000, 200)).toBe(300);
  });
});
