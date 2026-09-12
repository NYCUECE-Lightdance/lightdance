import { describe, it, expect } from "vitest";

import { buildPlayers } from "../buildPlayers.js";
import { comparePlayers, unpackColor } from "../structuredDiff.js";
import { fixtures } from "./fixtures/index.js";

/**
 * 結構化 diff 比對器的測試。
 *
 * 除了比對器本身的行為，這裡也**預演** Phase 2 的實際情境：把黑色哨兵從 -10ms
 * 正規化到 50ms 網格（= segment 模型的做法），確認差異只落在漸變內部，
 * 並記錄實測的最大通道差。
 */

/** 模擬 segment 世界：所有黑點正規化到 50ms 網格 */
function normalizeBlackPointsToGrid(actionTable) {
  const clone = JSON.parse(JSON.stringify(actionTable));
  for (const armor of Object.values(clone)) {
    for (const timeline of Object.values(armor)) {
      if (!Array.isArray(timeline)) continue;
      for (const keyframe of timeline) {
        const isBlack =
          keyframe.color.R === 0 &&
          keyframe.color.G === 0 &&
          keyframe.color.B === 0;
        if (isBlack) keyframe.time = Math.ceil(keyframe.time / 50) * 50;
      }
    }
  }
  return clone;
}

describe("unpackColor", () => {
  it("解開 32-bit 打包色的各通道", () => {
    // R=255 G=128 B=64, alpha7=127, linear=1
    const packed =
      ((255 << 24) | (128 << 16) | (64 << 8) | ((127 << 1) | 1)) >>> 0;
    expect(unpackColor(packed)).toEqual({
      R: 255,
      G: 128,
      B: 64,
      alpha7: 127,
      linear: 1,
    });
  });
});

describe("comparePlayers", () => {
  it("完全相同的輸出視為通過", () => {
    const players = buildPlayers(
      fixtures.find((f) => f.name === "multi-armor-mixed").actionTable,
    );
    const report = comparePlayers(players, JSON.parse(JSON.stringify(players)));
    expect(report.ok).toBe(true);
    expect(report.stats.gradientDiffCount).toBe(0);
  });

  it("時間格不同視為錯誤", () => {
    const players = buildPlayers(
      fixtures.find((f) => f.name === "single-color-block").actionTable,
    );
    const tampered = JSON.parse(JSON.stringify(players));
    tampered[0][1].time += 1;
    const report = comparePlayers(players, tampered);
    expect(report.ok).toBe(false);
    expect(report.errors.join()).toContain("時間格不同");
  });

  it("非漸變欄位的色差視為錯誤", () => {
    const players = buildPlayers(
      fixtures.find((f) => f.name === "single-color-block").actionTable,
    );
    const tampered = JSON.parse(JSON.stringify(players));
    // 純色欄位（linear=0）改動一個 bit
    tampered[0][1].hat = (tampered[0][1].hat + (1 << 24)) >>> 0;
    const report = comparePlayers(players, tampered);
    expect(report.ok).toBe(false);
    expect(report.errors.join()).toContain("非漸變狀態下不同");
  });

  it("舞者數量不同視為錯誤", () => {
    const players = buildPlayers(
      fixtures.find((f) => f.name === "empty-table").actionTable,
    );
    const report = comparePlayers(players, players.slice(0, 3));
    expect(report.ok).toBe(false);
    expect(report.errors.join()).toContain("舞者數量不同");
  });

  it("漸變內部的色差在容許值內時通過，並統計最大差值", () => {
    const fixture = fixtures.find(
      (f) => f.name === "fade-to-black-with-witness",
    );
    const legacy = buildPlayers(fixture.actionTable);
    const gridded = buildPlayers(
      normalizeBlackPointsToGrid(fixture.actionTable),
    );

    const report = comparePlayers(legacy, gridded);
    expect(report.ok).toBe(true);
    expect(report.stats.gradientDiffCount).toBeGreaterThan(0);
    expect(report.stats.maxChannelDelta).toBeGreaterThan(0);
  });

  it("漸變內部色差超過容許值時視為錯誤", () => {
    const fixture = fixtures.find((f) => f.name === "short-fade-to-black");
    const legacy = buildPlayers(fixture.actionTable);
    const gridded = buildPlayers(
      normalizeBlackPointsToGrid(fixture.actionTable),
    );

    const report = comparePlayers(legacy, gridded, { maxChannelDelta: 1 });
    expect(report.ok).toBe(false);
    expect(report.errors.join()).toContain("超出容許值");
  });
});

describe("Phase 2 預演：黑點上網格後的差異分類", () => {
  it("所有 fixture 的時間格不變、差異只出現在漸變內部", () => {
    const summary = [];

    for (const fixture of fixtures) {
      const legacy = buildPlayers(fixture.actionTable);
      const gridded = buildPlayers(
        normalizeBlackPointsToGrid(fixture.actionTable),
      );
      // 用極大容許值，只檢查「結構性差異」是否為零
      const report = comparePlayers(legacy, gridded, {
        maxChannelDelta: Number.POSITIVE_INFINITY,
      });

      expect(report.errors, `${fixture.name} 不應有結構性差異`).toEqual([]);

      if (report.stats.gradientDiffCount > 0) {
        summary.push(
          `${fixture.name}: ${report.stats.gradientDiffCount} 個欄位, 最大通道差 ${report.stats.maxChannelDelta}`,
        );
      }
    }

    // 把實測結果印出來，方便日後對照真實資料的量測值
    console.log("黑點上網格造成的漸變內部差異：\n  " + summary.join("\n  "));
  });

  it("預設容許值 16 足以涵蓋 1000ms 級距的漸變", () => {
    const fixture = fixtures.find(
      (f) => f.name === "fade-to-black-with-witness",
    );
    const legacy = buildPlayers(fixture.actionTable);
    const gridded = buildPlayers(
      normalizeBlackPointsToGrid(fixture.actionTable),
    );
    const report = comparePlayers(legacy, gridded);
    expect(report.ok).toBe(true);
    expect(report.stats.maxChannelDelta).toBeLessThanOrEqual(16);
  });
});
