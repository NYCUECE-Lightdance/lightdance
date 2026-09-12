/**
 * 防腐測試：不准再往 CSS 裡寫死顏色。
 *
 * 沒有這支測試，token 層會在三個月內腐化回去 —— 下一個人趕時間就直接寫 `#333`，
 * 半年後又回到「同一個灰有 25 個副本」的狀態。這跟 `partsConfig.test.js`
 * 是同一種安全網：不阻止你改，但改壞時準確告訴你是哪一個檔案。
 *
 * ## 棘輪（ratchet）機制
 *
 * 收斂是分兩步做的：commit 1 把**無彩色**（灰、白、黑、黑白疊層）全部收進 token，
 * commit 2 才處理**有色相**的那些 —— 因為它們的語意本身要改（綠色按鈕變 primary、
 * 橘色警告橫幅變灰底加圖示、藍色舞者標籤變灰），跟單純換個變數名不是同一件事，
 * 混在一起會沒辦法審。
 *
 * 所以下面這張 `PENDING` 表記錄「還沒清乾淨的檔案各剩幾處」。規則是
 * **數字只能變小**：清掉就把數字調降，清完就把整列刪掉。不在表上的檔案一律 0。
 *
 * 這樣既擋得住新的違規，又不必等全部做完才有保護。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findHardcodedColors } from "../cssColors.js";

const SRC = join(fileURLToPath(new URL("../../", import.meta.url)));

/** token 定義檔本身是唯一可以寫顏色的地方 */
const TOKENS_FILE = "styles/tokens.css";

/**
 * 還沒收斂完的檔案與剩餘處數。**這些數字只能往下調。**
 * 清完一個檔案就把它整列刪掉，全部清完就讓這個物件變成空的。
 */
const PENDING = {
  // （空的）—— 全部收斂完成。新增的違規會讓對應檔案的測試直接紅。
};

const listCss = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listCss(full);
    return name.endsWith(".css") ? [full] : [];
  });

const cssFiles = listCss(SRC)
  .map((f) => relative(SRC, f).split(/[\\/]/).join("/"))
  .filter((f) => f !== TOKENS_FILE)
  .sort();

describe("CSS 顏色只能來自 token", () => {
  it("掃得到 CSS 檔（避免測試因為路徑錯而空跑全綠）", () => {
    expect(cssFiles.length).toBeGreaterThan(10);
  });

  it.each(cssFiles)("%s", (file) => {
    const hits = findHardcodedColors(readFileSync(join(SRC, file), "utf8"));
    const allowed = PENDING[file] ?? 0;

    // 訊息裡直接列出違規的宣告，壞掉時不用自己再去翻檔案
    const detail = hits
      .map(({ property, literal }) => `${property}: ${literal}`)
      .join("\n  ");

    expect(
      hits.length,
      hits.length > allowed
        ? `${file} 有 ${hits.length} 處寫死的顏色（允許 ${allowed} 處）：\n  ${detail}\n` +
            `\n顏色請定義在 styles/tokens.css，這裡用 var(--token) 引用。`
        : `${file} 只剩 ${hits.length} 處了，請把 PENDING 裡的數字調降成 ${hits.length}` +
            `（或整列刪掉）—— 棘輪只能往下轉。`,
    ).toBe(allowed);
  });

  it("PENDING 表裡沒有已經不存在的檔案", () => {
    const stale = Object.keys(PENDING).filter((f) => !cssFiles.includes(f));
    expect(stale).toEqual([]);
  });
});

describe("tokens.css 本身", () => {
  const tokens = readFileSync(join(SRC, TOKENS_FILE), "utf8");

  it("定義了各層必要的 token", () => {
    const required = [
      "--bg-canvas",
      "--bg-panel",
      "--bg-control",
      "--bg-control-hover",
      "--bg-control-active",
      "--border-subtle",
      "--border-strong",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--text-disabled",
      "--ring-selected",
      "--armor-outline",
      "--armor-stage",
      "--radius-sm",
      "--fs-base",
      "--space-4",
    ];
    for (const name of required) {
      expect(tokens, `tokens.css 少了 ${name}`).toContain(`${name}:`);
    }
  });

  it("背景階由深到淺、相鄰兩階拉得開", () => {
    // 純中性灰的代價是層次容易糊掉，所以刻意把相鄰階的差距拉到 8 階以上。
    // 這條測試擋住「後來有人覺得太跳，偷偷把中間某一階往旁邊挪」。
    const ramp = [
      "--bg-canvas",
      "--bg-panel",
      "--bg-control",
      "--bg-control-hover",
      "--bg-control-active",
    ].map((name) => {
      const hex = tokens.match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`))?.[1];
      expect(hex, `${name} 必須是 6 位十六進位`).toBeTruthy();
      return parseInt(hex.slice(0, 2), 16);
    });

    for (let i = 1; i < ramp.length; i++) {
      expect(
        ramp[i] - ramp[i - 1],
        `第 ${i} 階與前一階只差 ${ramp[i] - ramp[i - 1]}，層次會糊掉`,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  it("灰階是純中性的（R=G=B）", () => {
    // 使用者拍板選純中性。這條擋住「有人覺得太死板，偷偷加一點藍」——
    // 要改是可以，但要改得明確（改這條測試），不要悄悄漂移。
    const greys = [
      "--bg-canvas",
      "--bg-panel",
      "--bg-control",
      "--bg-control-hover",
      "--bg-control-active",
      "--border-subtle",
      "--border-strong",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--text-disabled",
    ];
    for (const name of greys) {
      const hex = tokens.match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`))?.[1];
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect([name, r, g, b]).toEqual([name, r, r, r]);
    }
  });
});
