/**
 * 掃描 CSS 檔裡「寫死的顏色」。
 *
 * 抽成獨立模組而不是塞在測試裡，是因為 commit 2 的清理過程需要反覆跑它
 * 來確認還剩幾處（`node -e "..."` 直接引用即可）。
 *
 * ## 判準
 *
 * 違規 = 在**非自訂屬性**的宣告值裡出現顏色字面值。
 *
 * 換句話說，顏色只能定義在 `--foo: #123456` 這種地方，使用時一律 `var(--foo)`。
 * 這條規則讓 `Dashboard.css` 可以保有自己那套獨立的品牌色 token
 * （入口頁不跟燈光顏色同框，維持深綠是刻意的），同時仍然禁止任何人
 * 在規則裡直接寫 `#333`。
 *
 * ## 刻意不算違規的東西
 *
 * - `var(--accent-blue)`：變數名稱裡的 `blue` 只是名字
 * - `transparent` / `currentColor` / `inherit`：不是具體顏色
 * - 註解裡的色碼
 */

/**
 * CSS 具名顏色的完整清單。
 *
 * 一開始只列了十來個常見的，結果 `darkgrey` 與 `bisque` 都溜過去，
 * `PENDING = {}` 卻宣稱零違規——**掃描器漏看比沒有掃描器更糟**，因為它會
 * 給人「已經乾淨了」的錯覺。複合名稱（`darkslategray`…）用前綴拼湊很容易
 * 再漏，所以這裡直接放完整名單，一勞永逸。
 *
 * 刻意不含 `transparent` 與 `currentColor`：它們不是具體顏色，寫死也沒問題。
 */
const NAMED_COLORS = [
  "aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black",
  "blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse",
  "chocolate","coral","cornflowerblue","cornsilk","crimson","cyan","darkblue",
  "darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki",
  "darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon",
  "darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise",
  "darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick",
  "floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod",
  "gray","green","greenyellow","grey","honeydew","hotpink","indianred","indigo",
  "ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue",
  "lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey",
  "lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray",
  "lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta",
  "maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple",
  "mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise",
  "mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite",
  "navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod",
  "palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink",
  "plum","powderblue","purple","rebeccapurple","red","rosybrown","royalblue",
  "saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver",
  "skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan",
  "teal","thistle","tomato","turquoise","violet","wheat","white","whitesmoke","yellow",
  "yellowgreen",
];

/** 顏色字面值：十六進位、rgb()/rgba()、hsl()/hsla()、具名顏色 */
const COLOR_LITERAL = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|\\brgba?\\([^)]*\\)|\\bhsla?\\([^)]*\\)|\\b(?:${NAMED_COLORS.join("|")})\\b`,
  "g",
);

/** 一條宣告：`property: value`（值不含 `;` `{` `}`） */
const DECLARATION = /([-a-zA-Z]+)\s*:\s*([^;{}]+)/g;

/** 去掉註解，免得註解裡提到的色碼被算成違規 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * 去掉不該被當成顏色的片段：
 * - `var(--accent-blue)`：變數名稱裡的 `blue` 只是名字
 * - `"Tan Pro"`：字型名稱剛好撞到 `tan` 這種具名顏色
 */
const stripVarNames = (value) =>
  value
    .replace(/var\(\s*--[^)]*\)/g, "var()")
    .replace(/"[^"]*"|'[^']*'/g, '""');

/**
 * 找出一份 CSS 原始碼裡所有寫死的顏色。
 *
 * @param {string} css CSS 原始碼
 * @returns {{property: string, literal: string}[]}
 */
export const findHardcodedColors = (css) => {
  const found = [];
  const source = stripComments(css);

  for (const match of source.matchAll(DECLARATION)) {
    const [, property, rawValue] = match;
    if (property.startsWith("--")) continue; // token 定義本身就是唯一該放顏色的地方

    for (const color of stripVarNames(rawValue).matchAll(COLOR_LITERAL)) {
      found.push({ property, literal: color[0] });
    }
  }
  return found;
};

/**
 * 找出「前景與背景解析成同一個顏色」的規則。
 *
 * 這是 token 收斂最容易踩的坑，而且**畫面上看起來只是空白**——文字還在
 * DOM 裡、也還在該在的位置，只是跟背景同色。實測一次抓到三處：
 * Choose-Timeline 彈窗的欄位、`/edit` 表格的表頭、返回鍵。
 *
 * 只比對同一條規則裡同時宣告了 `color` 與 `background(-color)` 的情況——
 * 跨規則的繼承要解 CSS 串接才算得準，那需要真的跑瀏覽器（版面稽核在做）。
 *
 * @param {string} css CSS 原始碼
 * @param {Record<string, string>} tokenValues token 名稱 → 實際色值
 * @returns {{selector: string, value: string}[]}
 */
export const findSameColorRules = (css, tokenValues) => {
  const resolve = (raw) => {
    const value = raw.trim();
    const varMatch = value.match(/^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/);
    if (varMatch) return tokenValues[varMatch[1]]?.trim().toLowerCase() ?? null;
    return value.toLowerCase();
  };

  const found = [];
  const source = stripComments(css);

  // 逐條規則：`選擇器 { 宣告 }`
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    let fg = null;
    let bg = null;

    for (const decl of body.matchAll(DECLARATION)) {
      const [, property, value] = decl;
      if (property.toLowerCase() === "color") fg = resolve(value);
      if (/^background(-color)?$/i.test(property)) bg = resolve(value);
    }

    if (fg && bg && fg === bg) {
      found.push({ selector: selector.trim().replace(/\s+/g, " "), value: fg });
    }
  }
  return found;
};

/** 從 tokens.css 解析出 `--name: value` 對照表 */
export const parseTokens = (css) =>
  Object.fromEntries(
    [...stripComments(css).matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)].map(
      ([, name, value]) => [name, value.trim()],
    ),
  );
