/**
 * 初始 JS 的大小預算。
 *
 * 「開編輯器要下載多少 JS」是會**單向惡化**的數字：每個人加一個 import 都只多
 * 幾十 KB，沒有人會為了幾十 KB 去反對一個功能，於是它只會往上爬。實測這個專案
 * 爬到 1817 KB（gzip 547 KB）時，其中 746 KB 是 `/model` 那一頁的 `three` 與
 * `@google/model-viewer` —— 排燈的人從頭到尾不會打開那一頁。
 *
 * 所以這裡守的是**初始 chunk**，不是整包：lazy 出去的路由要多大都行，那是
 * 使用者真的走到那一頁才付的錢。
 *
 * 用法：`npm run audit:bundle`（會自己跑一次 build）
 */

import { execSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** 初始 chunk 的上限。目前 487 KB / gzip 160 KB，留一點成長空間 */
const BUDGET_KB = 600;
const BUDGET_GZIP_KB = 200;

const DIST = new URL("../dist/assets", import.meta.url).pathname;

console.log("建置中…");
execSync("npx vite build", { stdio: "pipe" });

const files = readdirSync(DIST);

/*
 * 初始 chunk 就是 `index-*.js`。lazy 出去的路由各自是獨立檔案，名字來自
 * 原始模組（`model-*.js`、`Welcome-*.js`…），不算在預算裡。
 */
const entry = files.find((n) => n.startsWith("index-") && n.endsWith(".js"));
if (!entry) {
  console.error("找不到 index-*.js —— build 的產物長得跟預期不一樣");
  process.exit(1);
}

const raw = readFileSync(join(DIST, entry));
const kb = raw.length / 1024;
const gzipKb = gzipSync(raw).length / 1024;

const lazy = files
  .filter((n) => n.endsWith(".js") && n !== entry)
  .map((n) => ({ name: n, kb: readFileSync(join(DIST, n)).length / 1024 }))
  .sort((a, b) => b.kb - a.kb);

console.log(`\n初始 chunk  ${kb.toFixed(0)} KB（gzip ${gzipKb.toFixed(0)} KB）`);
console.log(`預算        ${BUDGET_KB} KB（gzip ${BUDGET_GZIP_KB} KB）`);
console.log("\n按需求才抓的（不算在預算裡）：");
for (const chunk of lazy) {
  console.log(`  ${chunk.kb.toFixed(0).padStart(5)} KB  ${chunk.name}`);
}

const over = kb > BUDGET_KB || gzipKb > BUDGET_GZIP_KB;
console.log(
  over
    ? `\n=== 超出預算 ===\n把新加進來的重東西改成路由層 lazy，或確認它真的必須在初始載入時就在。`
    : "\n=== 預算內 ===",
);
process.exit(over ? 1 : 0);
