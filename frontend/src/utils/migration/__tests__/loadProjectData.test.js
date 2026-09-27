import { describe, it, expect } from "vitest";

import {
  SCHEMA_VERSION,
  isSegmentTable,
  loadProjectData,
  normalizeSegmentTable,
  toSegmentTable,
  checkSegmentTable,
} from "../loadProjectData.js";
import { segmentsToActionTable } from "../../segments/convert.js";
import { buildPlayers } from "../../export/buildPlayers.js";
import { compareRenderedOutput } from "../../export/structuredDiff.js";
import { fixtures } from "../../export/__tests__/fixtures/index.js";
import { normalizeActionTable } from "../../actionTable/normalizeActionTable.js";
import { PART_COUNT, PLAYER_COUNT } from "../../../constants/parts.js";

/**
 * 遷移入口的驗證 —— **Phase 4 的閘門**。
 *
 * 最重要的一條是最後那個「載入 v1 → 匯出」的端到端測試：它證明換了 store 的
 * 資料形狀之後，**韌體看到的東西一模一樣**。這比任何手動測試都可靠。
 */

/** 從 fixture 自身推算表演長度（真實光表長度差很多，硬編會產生假差異） */
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
  return max;
}

describe("形狀辨認", () => {
  it("keyframe 表被認出來", () => {
    const table = [
      [[{ time: 0, color: { R: 1, G: 2, B: 3, A: 1 }, linear: 0 }]],
    ];
    expect(isSegmentTable(table)).toBe(false);
  });

  it("segment 表被認出來", () => {
    const table = [
      [[{ id: "a", start: 0, end: 1000, colorStart: {}, colorEnd: {} }]],
    ];
    expect(isSegmentTable(table)).toBe(true);
  });

  it("完全空的表當作 segment（兩種模型長得一樣，轉過去也是空的）", () => {
    expect(isSegmentTable([[[], []], [[]]])).toBe(true);
    expect(isSegmentTable([])).toBe(true);
    expect(isSegmentTable(undefined)).toBe(true);
  });

  it("object 容器的舊資料也認得出來", () => {
    const table = {
      0: { 0: [{ time: 0, color: { R: 9, G: 9, B: 9, A: 1 }, linear: 0 }] },
    };
    expect(isSegmentTable(table)).toBe(false);
  });
});

describe("normalizeSegmentTable", () => {
  it("補齊成 7×22，缺的部位是空陣列", () => {
    const table = normalizeSegmentTable([]);
    expect(table).toHaveLength(PLAYER_COUNT);
    expect(table[0]).toHaveLength(PART_COUNT);
    expect(table[3][11]).toEqual([]);
  });

  it("已存在的部位原樣沿用同一個 reference（維持 memo 有效）", () => {
    const segments = [
      { id: "a", start: 0, end: 500, colorStart: {}, colorEnd: {}, linear: 0 },
    ];
    const input = [[segments]];
    expect(normalizeSegmentTable(input)[0][0]).toBe(segments);
  });
});

describe("toSegmentTable", () => {
  it("已經是 segment 就不再轉換一次", () => {
    const segments = [
      { id: "a", start: 0, end: 500, colorStart: {}, colorEnd: {}, linear: 0 },
    ];
    expect(toSegmentTable([[segments]])[0][0]).toBe(segments);
  });

  it("v1 keyframe 轉成合法的 segments", () => {
    const table = [
      [
        [
          { time: 0, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
          { time: 1000, color: { R: 255, G: 0, B: 0, A: 1 }, linear: 0 },
          { time: 2000, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
        ],
      ],
    ];

    const result = toSegmentTable(table, { duration: 5000 });

    expect(result[0][0]).toHaveLength(1);
    expect(result[0][0][0]).toMatchObject({ start: 1000, end: 2000 });
    expect(checkSegmentTable(result)).toEqual([]);
  });
});

describe("loadProjectData 的 envelope 處理", () => {
  const v1Table = [
    [
      [
        { time: 0, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
        { time: 1000, color: { R: 1, G: 2, B: 3, A: 1 }, linear: 0 },
        { time: 2000, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
      ],
    ],
  ];

  it("吃 {actionTable, music_filename} envelope", () => {
    const { segmentTable, musicFilename } = loadProjectData(
      { actionTable: v1Table, music_filename: "song.mp3" },
      { duration: 5000 },
    );

    expect(musicFilename).toBe("song.mp3");
    expect(segmentTable[0][0][0]).toMatchObject({ start: 1000, end: 2000 });
  });

  it("吃裸的 actionTable", () => {
    const { segmentTable } = loadProjectData(v1Table, { duration: 5000 });
    expect(segmentTable[0][0][0]).toMatchObject({ start: 1000, end: 2000 });
  });

  it("v2 envelope 原樣通過", () => {
    const segments = [
      { id: "a", start: 0, end: 500, colorStart: {}, colorEnd: {}, linear: 0 },
    ];
    const { segmentTable } = loadProjectData({
      schemaVersion: SCHEMA_VERSION,
      actionTable: [[segments]],
    });
    expect(segmentTable[0][0]).toBe(segments);
  });
});

describe("Phase 4 閘門：v1 載入 → 匯出，韌體看到的東西不變", () => {
  it("全 fixture 走遷移路徑後的輸出與直接用 v1 匯出等價", () => {
    const summary = [];
    let worstDelta = 0;

    for (const fixture of fixtures) {
      const duration = durationOf(fixture.actionTable);
      const normalized = normalizeActionTable(fixture.actionTable, duration);

      // 基準：v1 直接匯出
      const baseline = buildPlayers(normalized);

      // 遷移路徑：v1 → loadProjectData → store（segments）→ 匯出
      const { segmentTable } = loadProjectData(fixture.actionTable, {
        duration,
      });
      const migrated = buildPlayers(
        segmentsToActionTable(segmentTable, { duration }),
      );

      // 先用無限容許值，單獨確認「結構」完全一致：
      // 這時只剩「漸變內部取樣點色差」以外的差異會被記成 error
      const loose = compareRenderedOutput(baseline, migrated, {
        maxChannelDelta: Infinity,
      });
      expect(
        loose.errors,
        `${fixture.name} 有結構性差異：${JSON.stringify(loose.errors.slice(0, 3))}`,
      ).toEqual([]);

      if (loose.stats.maxChannelDelta > 0) {
        summary.push(
          `${fixture.name}: 最大通道差 ${loose.stats.maxChannelDelta}`,
        );
        worstDelta = Math.max(worstDelta, loose.stats.maxChannelDelta);
      }

      // 再用預設容許值（16）確認色差在允許範圍內
      const strict = compareRenderedOutput(baseline, migrated);
      expect(
        strict.ok,
        `${fixture.name} 超出容許色差：${JSON.stringify(strict.errors.slice(0, 3))}`,
      ).toBe(true);

      // 遷移產物必須通過 segment 不變式
      expect(checkSegmentTable(segmentTable)).toEqual([]);
    }

    console.log(
      `遷移路徑造成的漸變內部差異（全體最大 ${worstDelta}）：\n  ` +
        (summary.join("\n  ") || "（無）"),
    );
    // 逐 tick 展開真實光表很吃時間，機器忙的時候會超過 vitest 預設的 5 秒
  }, 30000);

  it("已經是 v2 的資料再載入一次不會變形（冪等）", () => {
    for (const fixture of fixtures) {
      const duration = durationOf(fixture.actionTable);
      const once = loadProjectData(fixture.actionTable, {
        duration,
      }).segmentTable;
      const twice = loadProjectData(once, { duration }).segmentTable;

      // 已是 segment 就原樣沿用，連 reference 都不該換
      expect(twice).toEqual(once);
      expect(twice[0][0]).toBe(once[0][0]);
    }
  });
});

/**
 * 音訊時間軸也走同一個入口。
 *
 * 三條載入路徑各自處理的話，只要有一條忘了跑遷移，五首歌的專案會被靜靜地載成
 * 一首——而畫面看起來完全正常（有一首歌、波形也畫得出來）。
 */
describe("loadProjectData 的音訊時間軸", () => {
  const emptyTable = [];

  it("舊的單曲存檔收成一個 clip", () => {
    const { audioClips } = loadProjectData({
      actionTable: emptyTable,
      music_filename: "show.mp3",
    });

    expect(audioClips).toHaveLength(1);
    expect(audioClips[0]).toMatchObject({ sourceFile: "show.mp3", start: 0 });
  });

  it("新的多曲存檔原樣通過，不會被收成一首", () => {
    const audioClips = [
      { id: "1", name: "開場", sourceFile: "a.mp3", start: 0, end: 1000, lengthMs: 1000 },
      { id: "2", name: "主秀", sourceFile: "b.mp3", start: 1000, end: 3000, lengthMs: 2000 },
    ];

    const loaded = loadProjectData({
      actionTable: emptyTable,
      music_filename: "a.mp3",
      audioClips,
      audioOverlapMs: 250,
    });

    // 內容原樣保留（缺的欄位由 migrateClips 補齊，所以不比 reference）
    expect(loaded.audioClips).toHaveLength(2);
    expect(loaded.audioClips.map((c) => c.sourceFile)).toEqual(["a.mp3", "b.mp3"]);
    expect(loaded.audioClips.map((c) => c.start)).toEqual([0, 1000]);
    expect(loaded.audioClips[0].name).toBe("開場");
    expect(loaded.overlapMs).toBe(250);
  });

  it("完全沒有音樂資訊時是空清單，不是一個指向 undefined 的 clip", () => {
    expect(loadProjectData({ actionTable: emptyTable }).audioClips).toEqual([]);
  });

  it("接縫壞掉時退回 0，不讓 NaN 流進排程", () => {
    const loaded = loadProjectData({
      actionTable: emptyTable,
      music_filename: "a.mp3",
      audioOverlapMs: "abc",
    });

    expect(loaded.overlapMs).toBe(0);
  });
});
