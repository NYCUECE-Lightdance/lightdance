/**
 * Fixture 載入器 — 合成案例 + 真實 production 案例。
 *
 * 合成案例寫在 synthetic.js；真實案例是隊員從瀏覽器 IndexedDB 或 mongo 匯出的
 * JSON，放進 real/ 目錄後會被自動載入（見 real/README.md）。
 *
 * 兩者互補：合成案例保證邊界覆蓋，真實案例保證沒有漏掉現場才會出現的資料形狀。
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fixtures as syntheticFixtures } from "./synthetic.js";

const here = dirname(fileURLToPath(import.meta.url));
const realDir = join(here, "real");

/** 讀取 real/ 目錄下所有 .json 真實資料 fixture */
function loadRealFixtures() {
  if (!existsSync(realDir)) return [];

  return (
    readdirSync(realDir)
      // *.color.json 是「當時韌體實際收到的輸出」，屬於期望值而非輸入，
      // 由 buildPlayers.production.test.js 另外讀取
      .filter((file) => file.endsWith(".json") && !file.endsWith(".color.json"))
      .sort()
      .map((file) => {
        const parsed = JSON.parse(readFileSync(join(realDir, file), "utf-8"));
        if (!parsed.actionTable) {
          throw new Error(
            `real/${file} 缺少 actionTable 欄位，請參考 real/README.md 的格式`,
          );
        }
        return {
          name: parsed.name ?? `real-${file.replace(/\.json$/, "")}`,
          description: parsed.description ?? `真實資料：${file}`,
          actionTable: parsed.actionTable,
        };
      })
  );
}

export const realFixtures = loadRealFixtures();
export const fixtures = [...syntheticFixtures, ...realFixtures];

export default fixtures;
