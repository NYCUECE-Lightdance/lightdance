import { describe, expect, it } from "vitest";

import {
  computePeaks,
  normalizePeaks,
  peaksForViewport,
  resamplePeaks,
  stitchPeaks,
  visibleRange,
} from "../peaks.js";

/**
 * 峰值是 `Float32Array`（見 `computePeaks` 的說明：一般陣列每格 8 bytes，
 * 20 萬個桶就多花 0.8MB／首）。所以比較內容時要：
 *
 * - 攤成一般陣列再比（`toEqual` 分得出 Float32Array 與 Array）
 * - 用 `toBeCloseTo` 而不是精確相等（0.9 存成單精度是 0.89999997…）
 */
const near = (peaks, expected, precision = 6) => {
  const actual = Array.from(peaks);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], precision));
};

describe("算峰值", () => {
  it("每個桶取絕對值的最大值", () => {
    // 8 個取樣點分成 4 桶：每桶兩個
    const data = [0.1, -0.9, 0.2, 0.3, -0.5, 0.4, 0.05, 0.05];
    near(computePeaks(data, 4), [0.9, 0.3, 0.5, 0.05]);
  });

  it("回傳的是 Float32Array（記憶體是一般陣列的一半）", () => {
    /*
     * 型別本身是要守的東西：改回一般陣列的話功能完全正常，只是每首歌多吃
     * 0.8MB，而那要換過十幾首歌才感覺得出來。
     */
    expect(computePeaks([0.1, 0.2], 2)).toBeInstanceOf(Float32Array);
    expect(normalizePeaks(computePeaks([0.1, 0.2], 2))).toBeInstanceOf(
      Float32Array,
    );
    expect(resamplePeaks([0, 1, 0, 1], 2)).toBeInstanceOf(Float32Array);
  });

  it("桶比取樣點還細時每桶至少取一個點", () => {
    // 兩個點分成四桶：不至少取一個的話後面幾桶會是 0
    const peaks = computePeaks([1, 0.5], 4);
    expect(peaks).toHaveLength(4);
    expect(peaks.every((peak) => peak > 0)).toBe(true);
  });

  it("空資料回傳空陣列而不是炸掉", () => {
    expect(computePeaks([], 10)).toEqual([]);
    expect(computePeaks(undefined, 10)).toEqual([]);
    expect(computePeaks([1, 2], 0)).toEqual([]);
  });
});

describe("正規化", () => {
  it("最大值變成 1", () => {
    near(normalizePeaks([0.25, 0.5]), [0.5, 1]);
  });

  /*
   * 這是這次抽出來時補上的守衛。靜音的音檔算出來全是 0，舊版直接
   * `peak / maxPeak` 會得到一整排 NaN——而 NaN 傳進 `fillRect` **不會報錯，
   * 只是什麼都不畫**。波形就這樣消失，console 一片乾淨。
   */
  it("全靜音不會產生 NaN", () => {
    const out = normalizePeaks([0, 0, 0]);
    near(out, [0, 0, 0]);
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it("空陣列回傳空陣列", () => {
    expect(normalizePeaks([])).toEqual([]);
    expect(normalizePeaks(null)).toEqual([]);
  });
});

describe("可視範圍", () => {
  const view = { viewportWidth: 100, contentWidth: 1000, peakCount: 500 };

  it("捲到開頭時取前面那一段", () => {
    expect(visibleRange({ ...view, scrollLeft: 0 })).toEqual({ start: 0, end: 50 });
  });

  it("捲到中間時取中間那一段", () => {
    expect(visibleRange({ ...view, scrollLeft: 500 })).toEqual({
      start: 250,
      end: 300,
    });
  });

  it("捲過頭不會超出陣列範圍", () => {
    expect(visibleRange({ ...view, scrollLeft: 99999 })).toEqual({
      start: 500,
      end: 500,
    });
  });

  it("負的捲動位置（橡皮筋回彈）夾到 0", () => {
    expect(visibleRange({ ...view, scrollLeft: -50 }).start).toBe(0);
  });

  /*
   * 掛載的第一幀容器還沒量到寬度，`scrollLeft / 0` 是 NaN。舊版沒有守衛，
   * NaN 一路流到 `slice(NaN, NaN)` 得到空陣列，再流到 `Math.max()` 得到
   * -Infinity，最後每根柱子的高度都是 NaN。
   */
  it("容器還沒有寬度時回傳空範圍，不是 NaN", () => {
    const range = visibleRange({ ...view, contentWidth: 0, scrollLeft: 10 });
    expect(range).toEqual({ start: 0, end: 0 });
  });

  it("還沒有峰值資料時回傳空範圍", () => {
    expect(visibleRange({ ...view, peakCount: 0 })).toEqual({ start: 0, end: 0 });
  });

  it("end 永遠不小於 start", () => {
    const range = visibleRange({ ...view, scrollLeft: 400, viewportWidth: 0 });
    expect(range.end).toBeGreaterThanOrEqual(range.start);
  });
});

describe("降取樣", () => {
  it("每根柱取區間的平均", () => {
    // 取平均而不是取最大：取最大會讓整片波形貼齊上緣，看不出強弱
    near(resamplePeaks([0, 1, 0, 1], 2), [0.5, 0.5]);
  });

  it("來源比目標短時原樣回傳，不補值", () => {
    near(resamplePeaks([1, 2, 3], 10), [1, 2, 3]);
  });

  it("回傳的是新陣列，不會被呼叫端改到", () => {
    const source = [1, 2, 3];
    expect(resamplePeaks(source, 10)).not.toBe(source);
  });

  it("邊界輸入不會炸掉", () => {
    expect(resamplePeaks([], 10)).toEqual([]);
    expect(resamplePeaks([1, 2], 0)).toEqual([]);
    expect(resamplePeaks(null, 10)).toEqual([]);
  });

  it("每個值都是有限數", () => {
    const out = resamplePeaks([0, 0, 0, 0, 0, 0], 3);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

describe("整條管線", () => {
  const peaks = Array.from({ length: 1000 }, (_, i) => (i < 500 ? 0.1 : 1));

  it("放大看小聲的段落時會重新正規化", () => {
    // 前半段全是 0.1，單獨看的時候應該撐滿高度，而不是變成貼著中線的細線
    const quiet = peaksForViewport(
      peaks,
      { scrollLeft: 0, viewportWidth: 100, contentWidth: 200 },
      10,
    );
    expect(Math.max(...quiet)).toBe(1);
  });

  it("容器還沒有寬度時回傳空陣列", () => {
    expect(
      peaksForViewport(peaks, { scrollLeft: 0, viewportWidth: 0, contentWidth: 0 }),
    ).toEqual([]);
  });

  it("沒有峰值資料時回傳空陣列", () => {
    expect(
      peaksForViewport([], { scrollLeft: 0, viewportWidth: 100, contentWidth: 200 }),
    ).toEqual([]);
  });

  it("輸出的長度不超過要求的柱數", () => {
    const out = peaksForViewport(
      peaks,
      { scrollLeft: 0, viewportWidth: 200, contentWidth: 200 },
      64,
    );
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

describe("stitchPeaks（多首歌拼成一條波形）", () => {
  /** 一整排相同值的峰值，方便看出哪一段是哪一首 */
  const flat = (value, length = 100) => new Array(length).fill(value);

  it("每一首落在自己的時間位置上", () => {
    const out = stitchPeaks(
      [
        { peaks: flat(1), start: 0, lengthMs: 1000 },
        { peaks: flat(0.5), start: 1000, lengthMs: 1000 },
      ],
      { durationMs: 2000, buckets: 100 },
    );

    expect(out).toHaveLength(100);
    // 前半是第一首（正規化後 1），後半是第二首（0.5）
    expect(out[10]).toBeCloseTo(1, 5);
    expect(out[60]).toBeCloseTo(0.5, 5);
  });

  it("接縫重疊處取兩首的較大值——那段時間兩首確實都在響", () => {
    const out = stitchPeaks(
      [
        { peaks: flat(0.2), start: 0, lengthMs: 1000 },
        { peaks: flat(1), start: 800, lengthMs: 1000 },
      ],
      { durationMs: 1800, buckets: 180 },
    );

    // 80~100 是重疊區：安靜的第一首與大聲的第二首疊在一起，取大的那個
    expect(out[90]).toBeCloseTo(1, 5);
  });

  it("很短的歌也畫得出來，不會留一塊空白", () => {
    const out = stitchPeaks(
      [
        { peaks: flat(1, 1000), start: 0, lengthMs: 60000 },
        { peaks: flat(1, 3), start: 60000, lengthMs: 200 },
      ],
      { durationMs: 60200, buckets: 1000 },
    );

    // 第二首佔的那幾個桶不能是 0（來源只有 3 個值、目標比它多）
    const tail = out.slice(Math.floor((60000 / 60200) * 1000));
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((v) => v > 0)).toBe(true);
  });

  it("整體正規化過，最大值是 1", () => {
    const out = stitchPeaks(
      [
        { peaks: flat(0.1), start: 0, lengthMs: 1000 },
        { peaks: flat(0.3), start: 1000, lengthMs: 1000 },
      ],
      { durationMs: 2000, buckets: 100 },
    );

    expect(Math.max(...out)).toBe(1);
  });

  it("沒有東西可拼、或總長是 0 時回傳空陣列（不是一整排 NaN）", () => {
    expect(stitchPeaks([], { durationMs: 1000 })).toEqual([]);
    expect(stitchPeaks(null, { durationMs: 1000 })).toEqual([]);
    expect(
      stitchPeaks([{ peaks: flat(1), start: 0, lengthMs: 1000 }], {
        durationMs: 0,
      }),
    ).toEqual([]);
  });

  it("壞掉的 piece 跳過就好，不要讓整條波形消失", () => {
    const out = stitchPeaks(
      [
        { peaks: [], start: 0, lengthMs: 1000 },
        { peaks: null, start: 1000, lengthMs: 1000 },
        { peaks: flat(1), start: 2000, lengthMs: 1000 },
      ],
      { durationMs: 3000, buckets: 90 },
    );

    expect(out).toHaveLength(90);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(Math.max(...out)).toBe(1);
  });

  it("每個值都是有限數——NaN 進 fillRect 不會報錯，只是什麼都不畫", () => {
    const out = stitchPeaks(
      [{ peaks: flat(0), start: 0, lengthMs: 1000 }],
      { durationMs: 1000, buckets: 50 },
    );

    expect(out.every(Number.isFinite)).toBe(true);
  });
});
