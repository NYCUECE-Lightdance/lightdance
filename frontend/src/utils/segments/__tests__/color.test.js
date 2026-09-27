import { describe, it, expect } from "vitest";

import {
  BLACK,
  clearColorRange,
  createColorSegment,
  getColorAt,
  insertColorSegment,
  lerpColor,
  splitSegmentAt,
} from "../color.js";
import { validateSegments } from "../core.js";

/**
 * segment 色彩層的測試。
 *
 * 這一層取代舊模型的 `insertColorKeyframes`（5 分支黑點判斷）。重點不是
 * 「新寫法比較短」，而是**行為要說得清楚**：空隙就是熄滅、放色不會偷改鄰居、
 * 切割後兩段接起來看起來和切之前一樣。
 */

const RED = { R: 255, G: 0, B: 0, A: 1 };
const BLUE = { R: 0, G: 0, B: 255, A: 1 };

/** 產生可預測的 id，讓斷言不受隨機 uuid 影響 */
const makeCounter = () => {
  let n = 0;
  return () => `seg-${n++}`;
};

const segment = (start, end, color, extra = {}) => ({
  id: `fixed-${start}`,
  start,
  end,
  colorStart: color,
  colorEnd: color,
  linear: 0,
  ...extra,
});

describe("getColorAt", () => {
  const segments = [segment(1000, 2000, RED)];

  it("段內回傳該段顏色", () => {
    expect(getColorAt(segments, 1000)).toEqual(RED);
    expect(getColorAt(segments, 1500)).toEqual(RED);
  });

  it("end 是開區間，剛好落在 end 上算空隙", () => {
    expect(getColorAt(segments, 2000)).toEqual({ ...BLACK });
  });

  it("空隙回傳黑色，而不是延續前一段", () => {
    expect(getColorAt(segments, 500)).toEqual({ ...BLACK });
    expect(getColorAt(segments, 5000)).toEqual({ ...BLACK });
  });

  it("空時間軸回傳黑色", () => {
    expect(getColorAt([], 1000)).toEqual({ ...BLACK });
    expect(getColorAt(undefined, 1000)).toEqual({ ...BLACK });
  });

  it("漸變段內是插值結果", () => {
    const gradient = [segment(0, 1000, RED, { colorEnd: BLUE, linear: 1 })];

    expect(getColorAt(gradient, 0)).toEqual(RED);
    expect(getColorAt(gradient, 500)).toEqual({ R: 128, G: 0, B: 128, A: 1 });
    // 999 已經非常接近終點，但 end 本身不屬於這一段
    expect(getColorAt(gradient, 999).B).toBeGreaterThan(250);
  });
});

describe("lerpColor", () => {
  it("端點回傳原色", () => {
    expect(lerpColor(RED, BLUE, 0)).toEqual(RED);
    expect(lerpColor(RED, BLUE, 1)).toEqual(BLUE);
  });

  it("ratio 超出 [0,1] 會被夾住", () => {
    expect(lerpColor(RED, BLUE, -5)).toEqual(RED);
    expect(lerpColor(RED, BLUE, 99)).toEqual(BLUE);
  });

  it("alpha 保持浮點，不被四捨五入成整數", () => {
    const faded = lerpColor({ ...RED, A: 0 }, { ...RED, A: 1 }, 0.3);
    expect(faded.A).toBeCloseTo(0.3);
  });
});

describe("insertColorSegment：放在空隙", () => {
  it("放出一個預設長度的色塊", () => {
    const next = insertColorSegment([], {
      time: 1000,
      color: RED,
      duration: 10000,
      makeId: makeCounter(),
    });

    expect(next).toEqual([
      {
        id: "seg-0",
        start: 1000,
        end: 2000,
        colorStart: RED,
        colorEnd: RED,
        linear: 0,
      },
    ]);
    expect(validateSegments(next)).toEqual([]);
  });

  it("插入時間向下對齊網格", () => {
    const [inserted] = insertColorSegment([], {
      time: 1037,
      color: RED,
      duration: 10000,
    });
    expect(inserted.start).toBe(1000);
  });

  it("預設 trim：撞到舊色塊時覆蓋並把它裁短", () => {
    const existing = [segment(1500, 3000, BLUE)];
    const next = insertColorSegment(existing, {
      time: 1000,
      color: RED,
      duration: 10000,
    });

    expect(next[0]).toMatchObject({ start: 1000, end: 2000 });
    expect(next[1]).toMatchObject({ start: 2000, end: 3000 });
    expect(validateSegments(next)).toEqual([]);
  });

  it("collision:'keep' 改為縮短自己、不動舊色塊", () => {
    const existing = [segment(1500, 3000, BLUE)];
    const next = insertColorSegment(existing, {
      time: 1000,
      color: RED,
      duration: 10000,
      collision: "keep",
    });

    expect(next[0]).toMatchObject({ start: 1000, end: 1500 });
    expect(next[1]).toBe(existing[0]); // 舊色塊原封不動
    expect(validateSegments(next)).toEqual([]);
  });

  it("不會超出表演長度", () => {
    const next = insertColorSegment([], {
      time: 9800,
      color: RED,
      duration: 10000,
    });
    expect(next[0].end).toBe(10000);
  });

  it("沒有空間可放時原樣回傳（reference 相同）", () => {
    const existing = [segment(1000, 2000, BLUE)];
    // 10000 之後已經沒有網格空間
    const next = insertColorSegment(existing, {
      time: 10000,
      color: RED,
      duration: 10000,
    });
    expect(next).toBe(existing);
  });
});

describe("insertColorSegment：放在既有色塊中間", () => {
  it("把舊色塊切成前後兩段，中間放新的", () => {
    const existing = [segment(1000, 5000, BLUE)];
    const next = insertColorSegment(existing, {
      time: 2000,
      color: RED,
      duration: 10000,
    });

    expect(next.map((s) => [s.start, s.end])).toEqual([
      [1000, 2000],
      [2000, 3000],
      [3000, 5000],
    ]);
    expect(next[1].colorStart).toEqual(RED);
    expect(next[0].colorStart).toEqual(BLUE);
    expect(next[2].colorStart).toEqual(BLUE);
    expect(validateSegments(next)).toEqual([]);
  });

  it("同一點放同一個顏色第二次是 no-op（reference 相同，不佔 undo）", () => {
    const first = insertColorSegment([], {
      time: 2000,
      color: RED,
      duration: 10000,
    });
    const second = insertColorSegment(first, {
      time: 2000,
      color: RED,
      duration: 10000,
    });

    expect(second).toBe(first);
  });

  it("同一點換不同顏色會生效", () => {
    const first = insertColorSegment([], {
      time: 2000,
      color: RED,
      duration: 10000,
    });
    const second = insertColorSegment(first, {
      time: 2000,
      color: BLUE,
      duration: 10000,
    });

    expect(second).not.toBe(first);
    expect(second).toHaveLength(1);
    expect(second[0].colorStart).toEqual(BLUE);
  });

  it("不會動到範圍外色塊的 reference", () => {
    const other = segment(5000, 6000, BLUE);
    const existing = [segment(1000, 1500, BLUE), other];
    const next = insertColorSegment(existing, {
      time: 2000,
      color: RED,
      duration: 10000,
    });

    expect(next[0]).toBe(existing[0]);
    expect(next[2]).toBe(other);
  });
});

describe("clearColorRange", () => {
  it("整段被覆蓋就消失（熄滅 = 沒有資料）", () => {
    const next = clearColorRange([segment(1000, 2000, RED)], 500, 2500);
    expect(next).toEqual([]);
  });

  it("中間挖空會 split 成兩段", () => {
    const next = clearColorRange([segment(1000, 4000, RED)], 2000, 3000, {
      makeId: makeCounter(),
    });

    expect(next.map((s) => [s.start, s.end])).toEqual([
      [1000, 2000],
      [3000, 4000],
    ]);
    expect(validateSegments(next)).toEqual([]);
  });
});

describe("splitSegmentAt", () => {
  it("固定色切成兩段，顏色都不變", () => {
    const next = splitSegmentAt([segment(1000, 3000, RED)], 2000, {
      makeId: makeCounter(),
    });

    expect(next.map((s) => [s.start, s.end])).toEqual([
      [1000, 2000],
      [2000, 3000],
    ]);
    expect(next[0].colorStart).toEqual(RED);
    expect(next[1].colorStart).toEqual(RED);
    expect(validateSegments(next)).toEqual([]);
  });

  it("切出來的後半段有自己的 id", () => {
    const next = splitSegmentAt([segment(1000, 3000, RED)], 2000, {
      makeId: makeCounter(),
    });
    expect(next[0].id).not.toBe(next[1].id);
  });

  it("漸變切開後，逐格顏色與切之前相差不超過 1", () => {
    const original = [segment(0, 1000, RED, { colorEnd: BLUE, linear: 1 })];
    const next = splitSegmentAt(original, 500, { makeId: makeCounter() });

    // 為什麼不是完全相等：切點的顏色會先被四捨五入成整數通道（韌體吃 8-bit），
    // 前後兩段再從那個已經取整的值插值回去，於是可能差 1。
    // 例如 t=250 原本是 round(255×0.75)=191，切開後是 round(255×0.5+128×0.5)=192。
    // 這是 8-bit 量化的固有誤差，不是邏輯錯誤——舊模型的剪下也有同樣的性質。
    for (let t = 0; t < 1000; t += 50) {
      const before = getColorAt(original, t);
      const after = getColorAt(next, t);

      ["R", "G", "B"].forEach((channel) => {
        expect(
          Math.abs(after[channel] - before[channel]),
          `t=${t} 的 ${channel} 通道`,
        ).toBeLessThanOrEqual(1);
      });
      expect(after.A).toBeCloseTo(before.A);
    }
  });

  it("切點不在任何段內時原樣回傳", () => {
    const original = [segment(1000, 2000, RED)];
    expect(splitSegmentAt(original, 3000)).toBe(original);
  });

  it("切點正好落在邊界時原樣回傳（不產生零長度段）", () => {
    const original = [segment(1000, 2000, RED)];
    expect(splitSegmentAt(original, 1000)).toBe(original);
    expect(splitSegmentAt(original, 2000)).toBe(original);
  });
});

describe("createColorSegment", () => {
  it("固定色的 colorEnd 與 colorStart 相同", () => {
    const created = createColorSegment({
      start: 0,
      end: 1000,
      color: RED,
      makeId: makeCounter(),
    });
    expect(created.colorEnd).toEqual(created.colorStart);
  });

  it("顏色是複製過的，不會與呼叫端共用物件", () => {
    const source = { R: 1, G: 2, B: 3, A: 1 };
    const created = createColorSegment({ start: 0, end: 1000, color: source });

    source.R = 99;
    expect(created.colorStart.R).toBe(1);
  });
});
