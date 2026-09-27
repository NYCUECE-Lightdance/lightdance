/**
 * 防呆測試：同一條規則裡前景與背景不能解析成同一個顏色。
 *
 * 這是 token 收斂最容易踩的坑。原本散落的 `#f8f9fa` 背景配 `white` 文字
 * 在淺色頁面上是合理的，但兩者都被吸附到 `--bg-inverse` / `--text-primary`
 * 之後就變成同一個 `#ececec`——**文字還在 DOM 裡、位置也對，只是看不見**。
 *
 * 這種壞法不會有錯誤、不會影響版面稽核（沒有東西被蓋住也沒有溢出），
 * 只有把 token 解析出來逐條比對才抓得到。code review 一次抓到四處：
 * Choose-Timeline 彈窗的欄位、`/edit` 的表頭、返回鍵、起始頁的按鈕。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findSameColorRules, parseTokens } from "../cssColors.js";

const SRC = join(fileURLToPath(new URL("../../", import.meta.url)));

const listCss = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listCss(full);
    return name.endsWith(".css") ? [full] : [];
  });

const tokens = parseTokens(readFileSync(join(SRC, "styles/tokens.css"), "utf8"));

const cssFiles = listCss(SRC)
  .map((f) => relative(SRC, f).split(/[\\/]/).join("/"))
  .sort();

describe("前景與背景不能同色", () => {
  it("tokens.css 解析得出 token（避免因為解析失敗而空跑全綠）", () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(20);
    expect(tokens["--text-primary"]).toBeTruthy();
  });

  it.each(cssFiles)("%s", (file) => {
    const hits = findSameColorRules(
      readFileSync(join(SRC, file), "utf8"),
      tokens,
    );
    const detail = hits.map((h) => `${h.selector} → ${h.value}`).join("\n  ");
    expect(
      hits,
      `${file} 有規則的文字與背景同色，畫面上會直接看不到：\n  ${detail}`,
    ).toEqual([]);
  });
});
