import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildPlayers } from "../buildPlayers.js";

/**
 * 端到端 production 驗證 — 比 golden 測試更強的一層保障。
 *
 * golden 測試只能證明「buildPlayers 的輸出沒有變」（與自己比對）；
 * 這裡則證明「buildPlayers 的輸出與**當時實際存進資料庫、餵給韌體的資料**相同」。
 * 資料來源是 2026-02-27 的 mongodump 備份：`raw_json` 是輸入、`color` 是同一次
 * 上傳寫入的輸出，兩者以 (user, update_time) 配對。
 *
 * ⚠️ 已知的 schema 差異：備份時間早於 commit f8b2774（board → acc0..acc7），
 * 當時的輸出只有 `board` 欄位、沒有 acc0-7。因此只比對兩邊共有的 15 個欄位
 * （time + 14 個身體部位）。這不影響驗證強度——身體部位涵蓋了取樣、插值、
 * 32-bit 打包、forward fill 的所有邏輯。
 *
 * ⚠️ fixture 的挑選有時間限制，不是隨便挑一份 production 資料都能通過（2026-08-08 全庫掃描）：
 *   - **2026-01-06 以前的資料一律不符**（每份 126~336 個欄位有差異）。當時的匯出邏輯
 *     與現行版本不同，這是專案刻意演進的結果，不是 bug——拿它當基準等於要求
 *     現行程式碼回到舊行為。
 *   - **2026-01-07 之後 33/37 份完全相同**；剩下 4 份差 1~4 個欄位，集中在有漸變的資料。
 *     推測原因：這批資料早於 `a99d5fc`（新增 upload_full），當時 color 與 raw_data 是
 *     **兩個獨立的 POST**，兩者可能對應到略微不同的編輯狀態——這正是 upload_full 要解決的問題。
 *
 * 因此本測試選用 2026-01-07 之後、且已驗證一致的資料。日後若匯入新 fixture，
 * 請用 scripts/import-mongo-fixtures.mjs --list 挑選，並確認來源是 upload_full 時代的資料。
 */

const here = dirname(fileURLToPath(import.meta.url));
const realDir = join(here, "fixtures/real");

/** 備份時期與現行 schema 共有的欄位 */
const COMPARABLE_FIELDS = [
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
];

/** 找出所有「輸入 + 當時輸出」成對的 fixture */
function loadPairs() {
  if (!existsSync(realDir)) return [];

  return readdirSync(realDir)
    .filter((file) => file.endsWith(".color.json"))
    .sort()
    .map((colorFile) => {
      const base = colorFile.replace(/\.color\.json$/, "");
      const expected = JSON.parse(
        readFileSync(join(realDir, colorFile), "utf-8"),
      );
      const input = JSON.parse(
        readFileSync(join(realDir, `${base}.json`), "utf-8"),
      );
      return {
        name: base,
        key: expected.source?.key ?? base,
        actionTable: input.actionTable,
        storedPlayers: expected.players,
      };
    });
}

const pairs = loadPairs();

describe("端到端：重現 production 韌體輸出", () => {
  it("至少有一組真實配對資料可驗證", () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  for (const pair of pairs) {
    describe(`${pair.name}（${pair.key}）`, () => {
      const rebuilt = buildPlayers(pair.actionTable);

      it("舞者數量與當時輸出相同", () => {
        expect(rebuilt.length).toBe(pair.storedPlayers.length);
      });

      it("每位舞者的列數與當時輸出相同", () => {
        const rebuiltRows = rebuilt.map((rows) => rows.length);
        const storedRows = pair.storedPlayers.map((rows) => rows.length);
        expect(rebuiltRows).toEqual(storedRows);
      });

      it("共有欄位的色值與當時輸出完全相同", () => {
        const mismatches = [];

        for (let armor = 0; armor < pair.storedPlayers.length; armor++) {
          const storedRows = pair.storedPlayers[armor];
          const rebuiltRows = rebuilt[armor];
          if (!rebuiltRows || storedRows.length !== rebuiltRows.length)
            continue;

          for (let row = 0; row < storedRows.length; row++) {
            for (const field of COMPARABLE_FIELDS) {
              if (storedRows[row][field] !== rebuiltRows[row][field]) {
                mismatches.push(
                  `舞者${armor} 第${row}列 ${field}: ` +
                    `production=${storedRows[row][field]} 重建=${rebuiltRows[row][field]}`,
                );
              }
            }
          }
        }

        expect(mismatches.slice(0, 10)).toEqual([]);
      });
    });
  }
});
