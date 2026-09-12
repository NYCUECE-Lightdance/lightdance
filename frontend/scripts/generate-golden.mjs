/**
 * 產生 golden 基準檔（fixtures/golden.json）。
 *
 * 使用時機：**只有在確認輸出變更是刻意的** 時候才重新產生，例如 Phase 2 的
 * segment 轉換器上線後。平常 golden.json 應該保持不動，由 buildPlayers.golden.test.js
 * 守住輸出契約。
 *
 * 用法：npm run test:update-golden
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { fixtures } from "../src/utils/export/__tests__/fixtures/index.js";
import { buildPlayers } from "../src/utils/export/buildPlayers.js";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  here,
  "../src/utils/export/__tests__/fixtures/golden.json",
);

const golden = {};
for (const fixture of fixtures) {
  golden[fixture.name] = buildPlayers(fixture.actionTable);
}

writeFileSync(outputPath, JSON.stringify(golden, null, 2) + "\n", "utf-8");
console.log(
  `✅ 已產生 ${Object.keys(golden).length} 筆 golden 基準 → ${outputPath}`,
);
