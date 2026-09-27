import { describe, it, expect } from "vitest";

import {
  keyframesToSegments,
  segmentsToKeyframes,
  actionTableToSegments,
  segmentsToActionTable,
} from "../convert.js";
import { validateSegments } from "../core.js";
import { buildPlayers } from "../../export/buildPlayers.js";
import { compareRenderedOutput } from "../../export/structuredDiff.js";
import { fixtures } from "../../export/__tests__/fixtures/index.js";
import { normalizeActionTable } from "../../actionTable/normalizeActionTable.js";
import { TICK_MS } from "../../../constants/time.js";

/**
 * 轉換器的等價驗證 —— 這是 Phase 4（資料模型切換）的**閘門**。
 *
 * 硬性要求：把整張 actionTable 轉成 segment 再壓平回 keyframe 後，
 * 韌體輸出的**結構**必須完全不變（舞者數、列數、每一列的時間格、
 * 所有非漸變欄位的色值）。唯一允許的差異是線性漸變**內部**取樣點的色差，
 * 那是黑點從 g−10 移到 g 之後插值分母改變所致（詳見 D2）。
 */

const DURATION = 60000;

/**
 * 從 fixture 自身推算表演長度。
 *
 * 為什麼不用固定值：真實光表的長度差很多（有一份的黑點在 282 秒），
 * 硬編一個 duration 會讓「尾端補齊」與「openEnded 判斷」用到錯誤的基準，
 * 進而產生假的差異——第一次跑就是這樣才出現 145 的色差。
 */
function durationOf(actionTable) {
  let max = 0;
  for (const armor of Object.values(actionTable)) {
    for (const timeline of Object.values(armor)) {
      if (!Array.isArray(timeline)) continue;
      for (const keyframe of timeline) {
        if (Number.isFinite(keyframe?.time)) max = Math.max(max, keyframe.time);
      }
    }
  }
  return Math.ceil(max / TICK_MS) * TICK_MS;
}

const black = (time) => ({
  time,
  color: { R: 0, G: 0, B: 0, A: 1 },
  linear: 0,
});
const color = (time, R, G, B, linear = 0) => ({
  time,
  color: { R, G, B, A: 1 },
  linear,
});

const roundTrip = (timeline) =>
  segmentsToKeyframes(keyframesToSegments(timeline, { duration: DURATION }));

describe("keyframesToSegments", () => {
  it("黑關鍵格只當邊界，不產生 segment", () => {
    const segments = keyframesToSegments(
      [black(0), color(1000, 255, 0, 0), black(1990)],
      { duration: DURATION },
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].start).toBe(1000);
    // 黑點 1990 向上對齊到 2000
    expect(segments[0].end).toBe(2000);
    expect(segments[0].colorStart).toEqual({ R: 255, G: 0, B: 0, A: 1 });
  });

  it("漸變的終點色取自下一個關鍵格", () => {
    const segments = keyframesToSegments(
      [black(0), color(1000, 255, 0, 0, 1), black(1990)],
      { duration: DURATION },
    );

    expect(segments[0].linear).toBe(1);
    expect(segments[0].colorEnd).toEqual({ R: 0, G: 0, B: 0, A: 1 });
  });

  it("鏈式漸變拆成連續相接的段", () => {
    const segments = keyframesToSegments(
      [
        black(0),
        color(500, 255, 0, 0, 1),
        color(1000, 0, 255, 0, 1),
        color(1500, 0, 0, 255),
        black(1990),
      ],
      { duration: DURATION },
    );

    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [500, 1000],
      [1000, 1500],
      [1500, 2000],
    ]);
    // 第一段漸變到第二段的起始色
    expect(segments[0].colorEnd).toEqual({ R: 0, G: 255, B: 0, A: 1 });
  });

  it("產出的 segment 一律符合不變式", () => {
    for (const fixture of fixtures) {
      for (const armor of Object.values(fixture.actionTable)) {
        for (const timeline of Object.values(armor)) {
          if (!Array.isArray(timeline)) continue;
          const segments = keyframesToSegments(timeline, {
            duration: DURATION,
          });
          expect(
            validateSegments(segments),
            `${fixture.name} 的 segment 違反不變式`,
          ).toEqual([]);
        }
      }
    }
  });

  it("空時間軸轉出空陣列", () => {
    expect(keyframesToSegments([], { duration: DURATION })).toEqual([]);
    expect(keyframesToSegments([black(0)], { duration: DURATION })).toEqual([]);
  });
});

describe("segmentsToKeyframes", () => {
  it("空隙前在網格點整點熄滅（沒有 -10ms 哨兵）", () => {
    const keyframes = roundTrip([
      black(0),
      color(1000, 255, 0, 0),
      black(1990),
    ]);

    const times = keyframes.map((k) => k.time);
    expect(times).toContain(2000);
    expect(times).not.toContain(1990);
    // 所有時間都對齊網格
    for (const time of times) {
      expect(time % TICK_MS).toBe(0);
    }
  });

  it("緊鄰的兩段之間不插黑點", () => {
    const keyframes = roundTrip([
      black(0),
      color(500, 255, 0, 0),
      color(1000, 0, 255, 0),
      black(1990),
    ]);

    // 500 → 1000 之間不應有黑點
    const between = keyframes.filter((k) => k.time > 500 && k.time < 1000);
    expect(between).toEqual([]);
  });
});

describe("round-trip 冪等", () => {
  it("轉過去再轉回來後，第二次轉換達到不動點", () => {
    for (const fixture of fixtures) {
      for (const armor of Object.values(fixture.actionTable)) {
        for (const timeline of Object.values(armor)) {
          if (!Array.isArray(timeline)) continue;

          const duration = durationOf(fixture.actionTable);
          const first = keyframesToSegments(timeline, { duration });
          const second = keyframesToSegments(
            segmentsToKeyframes(first, { duration }),
            { duration },
          );

          // id 每次新生成，比較時忽略
          const strip = (segments) => segments.map(({ id, ...rest }) => rest); // eslint-disable-line no-unused-vars

          expect(strip(second), `${fixture.name} round-trip 非冪等`).toEqual(
            strip(first),
          );
        }
      }
    }
  });
});

describe("Phase 4 閘門：全 fixture 語意等價", () => {
  // 比對的基準必須是**正規化後**的表：app 在匯出前一定會跑 normalizeActionTable
  // （每個部位補上 time 0 與 duration 的黑點）。拿未正規化的原始 fixture 比對，
  // 等於在比較 app 從來不會送出的資料形狀。
  const prepare = (actionTable) => {
    const duration = durationOf(actionTable);
    return {
      normalized: normalizeActionTable(actionTable, duration),
      duration,
    };
  };

  const viaSegments = (normalized, duration) =>
    buildPlayers(
      segmentsToActionTable(actionTableToSegments(normalized, { duration }), {
        duration,
      }),
    );

  it("轉成 segment 再壓平後，韌體每個 tick 播出的畫面等價", () => {
    const summary = [];
    let worstDelta = 0;

    for (const fixture of fixtures) {
      // 先用無限容許值，單獨檢查「非漸變狀態的差異」是否為零
      const { normalized, duration } = prepare(fixture.actionTable);
      const report = compareRenderedOutput(
        buildPlayers(normalized),
        viaSegments(normalized, duration),
        { maxChannelDelta: Number.POSITIVE_INFINITY },
      );

      expect(
        report.errors,
        `${fixture.name} 出現非漸變差異（畫面真的不一樣）`,
      ).toEqual([]);

      if (report.stats.diffCount > 0) {
        summary.push(
          `${fixture.name}: ${report.stats.diffCount} 個取樣點, 最大通道差 ${report.stats.maxChannelDelta}`,
        );
        worstDelta = Math.max(worstDelta, report.stats.maxChannelDelta);
      }
    }

    console.log(
      `轉換器造成的漸變內部差異（全體最大 ${worstDelta}）：\n  ` +
        (summary.join("\n  ") || "（無）"),
    );
    // 這條會把真實光表逐 tick 展開比對（54 萬關鍵格），機器忙的時候會超過
    // vitest 預設的 5 秒
  }, 30000);

  it("畫面色差在預設容許值 16 以內", () => {
    for (const fixture of fixtures) {
      const { normalized, duration } = prepare(fixture.actionTable);
      const report = compareRenderedOutput(
        buildPlayers(normalized),
        viaSegments(normalized, duration),
      );
      expect(report.ok, `${fixture.name}: ${report.errors.join("; ")}`).toBe(
        true,
      );
    }
  });
});
