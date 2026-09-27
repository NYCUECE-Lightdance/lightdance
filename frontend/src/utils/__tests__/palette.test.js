import { describe, expect, it } from "vitest";

import {
  FAVORITE_SLOTS,
  favoriteColorAt,
  hexToRgb,
  isNormalizedFavorites,
  normalizeFavorites,
  pushRecentColor,
  rgbToHex,
  sameRgb,
  setFavoriteSlot,
} from "../palette.js";

const red = { R: 255, G: 0, B: 0, A: 1 };
const green = { R: 0, G: 255, B: 0, A: 1 };
const white = { R: 255, G: 255, B: 255, A: 1 };

describe("色碼轉換", () => {
  it("補零並輸出大寫", () => {
    expect(rgbToHex({ R: 0, G: 10, B: 255 })).toBe("#000AFF");
  });

  it("alpha 不進色碼（它是亮度不是顏色）", () => {
    expect(rgbToHex({ ...red, A: 0.3 })).toBe(rgbToHex(red));
  });

  it("超出範圍的通道會被夾住，不會產生三位數的色碼", () => {
    expect(rgbToHex({ R: 300, G: -5, B: 128 })).toBe("#FF0080");
  });

  it("不合法的色碼回傳 null，讓呼叫端忽略半途輸入", () => {
    expect(hexToRgb("#FF")).toBeNull();
    expect(hexToRgb("FF0000")).toBeNull();
    expect(hexToRgb("#ff0000")).toEqual({ R: 255, G: 0, B: 0 });
  });
});

describe("最近使用", () => {
  it("最新的在最前面", () => {
    const list = pushRecentColor(pushRecentColor([], red), green);
    expect(list.map(rgbToHex)).toEqual(["#00FF00", "#FF0000"]);
  });

  it("重複的顏色是移到最前面，不是多一格", () => {
    const list = pushRecentColor(pushRecentColor(pushRecentColor([], red), green), red);
    expect(list.map(rgbToHex)).toEqual(["#FF0000", "#00FF00"]);
  });

  it("只換亮度不會塞爆清單", () => {
    // 拉一次亮度滑桿會 dispatch 十幾次 UPDATECHOSENCOLOR
    let list = pushRecentColor([], green);
    for (let a = 10; a >= 1; a--) list = pushRecentColor(list, { ...red, A: a / 10 });
    expect(list).toHaveLength(2);
    expect(list[0].A).toBe(0.1); // 記的是最後那個亮度
  });

  it("頭一筆完全相同時回傳原陣列（reducer 靠 reference 判斷要不要換 state）", () => {
    const list = pushRecentColor([], red);
    expect(pushRecentColor(list, { ...red })).toBe(list);
  });

  it("超過上限時丟掉最舊的", () => {
    let list = [];
    for (let i = 0; i < 10; i++) list = pushRecentColor(list, { R: i, G: 0, B: 0, A: 1 });
    expect(list).toHaveLength(6);
    expect(list[0].R).toBe(9);
    expect(list[5].R).toBe(4);
  });

  it("沒有顏色時不會炸", () => {
    expect(pushRecentColor(undefined, null)).toEqual([]);
  });
});

describe("最愛色", () => {
  it("空的 store 收成六個空格", () => {
    expect(normalizeFavorites([])).toEqual(Array(FAVORITE_SLOTS).fill(null));
  });

  it("舊的二維形狀會被攤平（4×2 / 2×3 / 1×6 都存在過）", () => {
    const old2d = [
      [red, green],
      [white, red],
    ];
    const flat = normalizeFavorites(old2d);
    expect(flat.slice(0, 4).map(rgbToHex)).toEqual([
      "#FF0000",
      "#00FF00",
      "#FFFFFF",
      "#FF0000",
    ]);
    expect(flat.slice(4)).toEqual([null, null]);
  });

  it("使用者存過的白色會保留 —— 白色是合法燈色，不是空格哨兵", () => {
    expect(normalizeFavorites([[white]])[0]).toEqual(white);
  });

  it("已經是正規形狀時看得出來（避免無謂的 dispatch）", () => {
    expect(isNormalizedFavorites(normalizeFavorites([[red]]))).toBe(true);
    expect(isNormalizedFavorites([[red]])).toBe(false);
    expect(isNormalizedFavorites([red, green])).toBe(false);
  });

  it("寫入單一格不會動到其他格", () => {
    const list = setFavoriteSlot(normalizeFavorites([]), 2, red);
    expect(list[2]).toEqual(red);
    expect(list.filter(Boolean)).toHaveLength(1);
  });

  it("傳 null 就是清空那一格", () => {
    const list = setFavoriteSlot(setFavoriteSlot([], 0, red), 0, null);
    expect(list[0]).toBeNull();
  });

  it("超出範圍的索引是 no-op，不會把陣列撐長", () => {
    expect(setFavoriteSlot([], 99, red)).toHaveLength(FAVORITE_SLOTS);
  });
});

describe("快捷鍵取色", () => {
  const stored = setFavoriteSlot(normalizeFavorites([]), 0, red);

  it("取得指定格的顏色", () => {
    expect(favoriteColorAt(stored, 0)).toEqual(red);
  });

  it("空格回傳 null，呼叫端跳過", () => {
    expect(favoriteColorAt(stored, 1)).toBeNull();
  });

  /*
   * 這是回歸測試。舊版用 `favoriteColor[row % rows][col]` 換算二維座標，
   * 色票收成一列六格之後 rows = 1，於是 index 6 會繞回第 0 格——
   * 按 7 套到的是第 1 格的顏色，而畫面上沒有任何東西顯示這件事。
   */
  it("超出格數不會繞回第一格", () => {
    expect(favoriteColorAt(stored, FAVORITE_SLOTS)).toBeNull();
    expect(favoriteColorAt(stored, FAVORITE_SLOTS + 1)).toBeNull();
  });
});

describe("色相比較", () => {
  it("忽略亮度", () => {
    expect(sameRgb({ ...red, A: 0.1 }, { ...red, A: 1 })).toBe(true);
    expect(sameRgb(red, green)).toBe(false);
  });
});
