import { describe, it, expect } from "vitest";

import { toNestedArray } from "../toNestedArray.js";
import { sanitizeActionTableTimes } from "../../sanitizeActionTable.js";
import { PART_COUNT, PLAYER_COUNT } from "../../../constants/parts.js";

/**
 * actionTable 容器型別的不變式測試。
 *
 * 專案裡曾同時存在 array 與 object（key "0".."21"）兩種容器，因為多數程式碼用
 * `[armor][part]` 存取，兩種都能跑，問題長期被掩蓋。這些測試把「一律是 array」
 * 釘死，避免日後又有人用 Object.fromEntries 寫回。
 */

const timeline = (time = 0) => [
  { time, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
];
const makeDefault = () => timeline(0);

/** 檢查是否為標準容器：巢狀 array，且維度正確 */
function expectNestedArray(actionTable) {
  expect(Array.isArray(actionTable)).toBe(true);
  expect(actionTable).toHaveLength(PLAYER_COUNT);
  for (const armor of actionTable) {
    expect(Array.isArray(armor)).toBe(true);
    expect(armor).toHaveLength(PART_COUNT);
    for (const parts of armor) {
      expect(Array.isArray(parts)).toBe(true);
    }
  }
}

describe("toNestedArray", () => {
  it('object 容器（key "0".."21"）轉成 array', () => {
    const objectTable = {};
    for (let armor = 0; armor < PLAYER_COUNT; armor++) {
      const parts = {};
      for (let part = 0; part < PART_COUNT; part++) {
        parts[String(part)] = timeline(part * 100);
      }
      objectTable[String(armor)] = parts;
    }

    const result = toNestedArray(objectTable, makeDefault);
    expectNestedArray(result);
    // 資料要原封不動搬過去
    expect(result[3][7][0].time).toBe(700);
  });

  it("已經是 array 的維持不變", () => {
    const arrayTable = Array.from({ length: PLAYER_COUNT }, () =>
      Array.from({ length: PART_COUNT }, (_, part) => timeline(part * 10)),
    );

    const result = toNestedArray(arrayTable, makeDefault);
    expectNestedArray(result);
    expect(result[0][5][0].time).toBe(50);
  });

  it("補齊缺漏的舞者與部位（例如舊版 9 部位資料）", () => {
    const legacyTable = {
      0: { 0: timeline(100), 1: timeline(200) },
    };

    const result = toNestedArray(legacyTable, makeDefault);
    expectNestedArray(result);
    expect(result[0][0][0].time).toBe(100);
    // 缺的部位用預設值補上
    expect(result[0][21]).toEqual(makeDefault());
    expect(result[6][0]).toEqual(makeDefault());
  });

  it("空值不會爆炸", () => {
    expectNestedArray(toNestedArray(undefined, makeDefault));
    expectNestedArray(toNestedArray({}, makeDefault));
    expectNestedArray(toNestedArray([], makeDefault));
  });
});

describe("sanitizeActionTableTimes 的容器型別", () => {
  it("輸出維持 array 容器", () => {
    const input = toNestedArray(
      {
        0: {
          0: [
            { time: 0, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
            { time: 1017, color: { R: 255, G: 0, B: 0, A: 1 }, linear: 0 },
          ],
        },
      },
      makeDefault,
    );

    const result = sanitizeActionTableTimes(input);
    expectNestedArray(result);
    // 有色關鍵格對齊到 50ms 網格
    expect(result[0][0][1].time).toBe(1000);
  });
});
