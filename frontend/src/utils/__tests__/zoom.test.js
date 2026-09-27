/**
 * 縮放換算的測試。
 *
 * 要守住的是**「每一步的感覺一樣大」在整個範圍內成立**。舊版按一次 `+` 加
 * 0.05：在 1 倍時是 +5%（看得出來），在 50 倍時是 +0.1%（完全看不出來），
 * 而從頭走到底要按 1980 次。滑桿同理：線性 1..100 配上 `Math.floor`，
 * 低倍率那一端一個像素就從 1 倍跳到 2 倍。
 */
import { describe, it, expect } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_RATIO,
  formatZoom,
  normalizeZoom,
  sliderToZoom,
  zoomIn,
  zoomOut,
  zoomToSlider,
} from "../zoom.js";

describe("zoomIn / zoomOut", () => {
  it("每一步都是同一個比例，不是同一個絕對值", () => {
    // 這正是舊版做錯的地方：+0.05 在 1 倍是 5%，在 50 倍是 0.1%
    expect(zoomIn(1) / 1).toBeCloseTo(ZOOM_RATIO);
    expect(zoomIn(10) / 10).toBeCloseTo(ZOOM_RATIO);
    expect(zoomIn(50) / 50).toBeCloseTo(ZOOM_RATIO);
  });

  it("放大再縮小回到原點", () => {
    expect(zoomOut(zoomIn(3))).toBeCloseTo(3);
  });

  it("走完整個範圍在 25 步以內（舊版要 1980 步）", () => {
    let zoom = MIN_ZOOM;
    let steps = 0;
    while (zoom < MAX_ZOOM && steps < 100) {
      zoom = zoomIn(zoom);
      steps++;
    }

    expect(zoom).toBe(MAX_ZOOM);
    expect(steps).toBeLessThanOrEqual(25);
  });

  it("夾在範圍內", () => {
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomIn(MAX_ZOOM - 1)).toBe(MAX_ZOOM);
  });
});

describe("滑桿位置 ↔ 縮放", () => {
  it("兩端對得上", () => {
    expect(sliderToZoom(0)).toBeCloseTo(MIN_ZOOM);
    expect(sliderToZoom(1)).toBeCloseTo(MAX_ZOOM);
    expect(zoomToSlider(MIN_ZOOM)).toBeCloseTo(0);
    expect(zoomToSlider(MAX_ZOOM)).toBeCloseTo(1);
  });

  it("來回換算是同一個值", () => {
    for (const zoom of [1, 1.5, 3, 10, 42, 100]) {
      expect(sliderToZoom(zoomToSlider(zoom))).toBeCloseTo(zoom);
    }
  });

  it("拖到一半是幾何中點（10 倍），不是算術中點（50 倍）", () => {
    /*
     * 線性滑桿把大半條長度花在 50~100 倍上，而那個區間肉眼分不出差別；
     * 真正常用的 1~5 倍全擠在最左邊幾個像素裡。
     */
    expect(sliderToZoom(0.5)).toBeCloseTo(10);
  });

  it("低倍率那一端拖得動：滑桿走 1% 不會直接跳一倍", () => {
    // 舊版（線性 + Math.floor）在這裡是 1 → 2，也就是一次放大一倍
    const step = sliderToZoom(0.01) - sliderToZoom(0);
    expect(step).toBeLessThan(0.1);
  });

  it("每一段同樣長的滑桿距離放大同樣的比例", () => {
    const ratioAt = (t) => sliderToZoom(t + 0.1) / sliderToZoom(t);
    expect(ratioAt(0.0)).toBeCloseTo(ratioAt(0.4));
    expect(ratioAt(0.4)).toBeCloseTo(ratioAt(0.8));
  });
});

describe("邊界與壞值", () => {
  it("NaN / undefined 收成最小值，不要讓它流進版面運算", () => {
    // 縮放會乘進容器寬度，NaN 傳進 style 不會報錯，只是整條時間軸消失
    expect(normalizeZoom(NaN)).toBe(MIN_ZOOM);
    expect(normalizeZoom(undefined)).toBe(MIN_ZOOM);
    expect(zoomIn(NaN)).toBeCloseTo(ZOOM_RATIO);
    expect(sliderToZoom(NaN)).toBe(MIN_ZOOM);
  });

  it("滑桿位置超出 0..1 時夾回來", () => {
    expect(sliderToZoom(-1)).toBe(MIN_ZOOM);
    expect(sliderToZoom(2)).toBe(MAX_ZOOM);
  });
});

describe("formatZoom", () => {
  it("低倍率留一位小數、高倍率取整", () => {
    expect(formatZoom(1)).toBe("1.0×");
    expect(formatZoom(2.5)).toBe("2.5×");
    expect(formatZoom(10)).toBe("10×");
    expect(formatZoom(42.4)).toBe("42×");
  });
});
