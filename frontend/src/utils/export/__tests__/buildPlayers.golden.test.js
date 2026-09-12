import { describe, it, expect } from "vitest";

import { buildPlayers } from "../buildPlayers.js";
import { fixtures } from "./fixtures/index.js";
import golden from "./fixtures/golden.json";

/**
 * Golden 測試 — 鎖定 buildPlayers 的輸出契約。
 *
 * 這是整個 keyframe→segment 重構的安全網：只要輸出與基準不同，測試就會紅燈。
 * 若差異是刻意的（例如 Phase 2 的轉換器上線），必須人工確認後才跑
 * `npm run test:update-golden` 重新產生基準。
 */

// 韌體 ABI：欄位順序與名稱不可更動，改了另一端會解析錯誤
const FIRMWARE_FIELD_ORDER = [
  "time",
  "hat",
  "face",
  "chestL",
  "chestR",
  "armL",
  "armR",
  "tie",
  "belt",
  "gloveL",
  "gloveR",
  "legL",
  "legR",
  "shoeL",
  "shoeR",
  "acc0",
  "acc1",
  "acc2",
  "acc3",
  "acc4",
  "acc5",
  "acc6",
  "acc7",
];

describe("buildPlayers golden", () => {
  it("每個 fixture 都有對應的 golden 基準", () => {
    const fixtureNames = fixtures.map((f) => f.name).sort();
    const goldenNames = Object.keys(golden).sort();
    expect(goldenNames).toEqual(fixtureNames);
  });

  for (const fixture of fixtures) {
    it(`輸出與基準相同：${fixture.name}（${fixture.description}）`, () => {
      const actual = buildPlayers(fixture.actionTable);
      expect(actual).toEqual(golden[fixture.name]);
    });
  }
});

describe("韌體 ABI", () => {
  it("每一列的欄位順序與名稱固定為 22 部位 + time", () => {
    const players = buildPlayers(
      fixtures.find((f) => f.name === "multi-armor-mixed").actionTable,
    );
    const rows = players.flat();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(FIRMWARE_FIELD_ORDER);
    }
  });

  it("色值是 unsigned 32-bit 整數", () => {
    const players = buildPlayers(
      fixtures.find((f) => f.name === "multi-armor-mixed").actionTable,
    );
    for (const row of players.flat()) {
      for (const [field, value] of Object.entries(row)) {
        if (field === "time") continue;
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0xffffffff);
      }
    }
  });

  it("時間欄位是 50ms tick 的非負整數且遞增", () => {
    for (const fixture of fixtures) {
      for (const rows of buildPlayers(fixture.actionTable)) {
        let previous = -1;
        for (const row of rows) {
          expect(Number.isInteger(row.time)).toBe(true);
          expect(row.time).toBeGreaterThan(previous);
          previous = row.time;
        }
      }
    }
  });
});
