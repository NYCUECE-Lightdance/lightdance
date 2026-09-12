import { describe, it, expect } from "vitest";

import {
  PARTS,
  PART_KEYS,
  PART_LABELS,
  PART_COUNT,
  PLAYER_COUNT,
  BODY_PART_COUNT,
  PLAYER_INDICES,
  PART_INDICES,
  isAccessoryPart,
  createEmptyActionTable,
} from "../parts.js";
import {
  ACCESSORY_CONFIGS,
  isPartAllowed,
} from "../../config/accessoryConfig.js";
import { ARMOR_SHAPES, radiusOf } from "../../config/armorShapes.js";
import profiles from "../../redux/reducers/profiles.js";

/**
 * 「改人數 / 改部位」的安全網。
 *
 * `constants/parts.js` 的註解承諾：要增減舞者或部位，只要改那個檔案，
 * 其他地方會自動跟上。這份測試就是那個承諾的機器版本 —— 把「自動跟上」
 * 失敗的每一種方式都變成一則紅字，而不是等到上台前才發現某個部位不會亮。
 *
 * 這裡**不驗證數字本身**（7 個人、22 個部位都是可以改的），只驗證
 * 各處是否維持一致。所以改了 `PLAYER_COUNT` 或 `PARTS` 之後，
 * 這份測試應該仍然全綠；會紅的是「改了但有地方沒跟上」。
 */

describe("PARTS 清單本身", () => {
  it("每一列都有 key / label / type", () => {
    PARTS.forEach((part, index) => {
      expect(typeof part.key, `PARTS[${index}].key`).toBe("string");
      expect(part.key.length, `PARTS[${index}].key 不可為空`).toBeGreaterThan(
        0,
      );
      expect(typeof part.label, `PARTS[${index}].label`).toBe("string");
      expect(["body", "accessory"], `PARTS[${index}].type`).toContain(
        part.type,
      );
    });
  });

  it("key 不重複（key 是韌體欄位名，重複會蓋掉彼此）", () => {
    expect(new Set(PART_KEYS).size).toBe(PART_COUNT);
  });

  it("身體部位全部排在飾品前面", () => {
    // `isAccessoryPart` / `isPartAllowed` 都是用「索引 >= BODY_PART_COUNT」
    // 判斷飾品，一旦把身體部位插到飾品後面，那個判斷會整個錯掉。
    const firstAccessory = PARTS.findIndex((part) => part.type === "accessory");
    const bodyAfterAccessory =
      firstAccessory !== -1 &&
      PARTS.slice(firstAccessory).some((part) => part.type === "body");

    expect(bodyAfterAccessory, "身體部位不可出現在飾品之後").toBe(false);
  });

  it("BODY_PART_COUNT 就是身體與飾品的分界", () => {
    PART_INDICES.forEach((index) => {
      expect(
        isAccessoryPart(index),
        `部位 ${index}（${PART_KEYS[index]}）`,
      ).toBe(PARTS[index].type === "accessory");
    });
    expect(BODY_PART_COUNT).toBeLessThanOrEqual(PART_COUNT);
  });

  it("推導出來的常數與 PARTS 對得起來", () => {
    expect(PART_KEYS).toHaveLength(PART_COUNT);
    expect(PART_LABELS).toHaveLength(PART_COUNT);
    expect(PART_INDICES).toEqual(PARTS.map((_, index) => index));
    expect(PLAYER_INDICES).toHaveLength(PLAYER_COUNT);
    expect(PLAYER_INDICES[PLAYER_COUNT - 1]).toBe(PLAYER_COUNT - 1);
  });
});

describe("光衣 SVG 覆蓋率", () => {
  /**
   * 光衣的圖形是手繪的，沒辦法自動生成。新增身體部位時最容易漏的就是這一步
   * —— 資料層都對，但畫面上點不到、也不會亮。
   *
   * 幾何現在集中在 `config/armorShapes.js`，所以這裡直接檢查那張表，
   * 不必再掃 JSX 原始碼找 `colors.xxx` 字串。
   */
  it("每個身體部位都有圖形", () => {
    const missing = PARTS.map((part, index) => ({ part, index }))
      .filter(
        ({ part, index }) =>
          part.type === "body" && !(ARMOR_SHAPES[index]?.length > 0),
      )
      .map(({ part }) => `${part.key}（${part.label}）`);

    expect(missing, "這些部位沒有在光衣上畫出來").toEqual([]);
  });

  it("圖形表沒有多出來的部位", () => {
    // 刪掉部位時反過來的漏網之魚：表還在畫，但 PARTS 已經沒有了
    expect(ARMOR_SHAPES.length).toBe(BODY_PART_COUNT);
  });

  it("每個形狀都有能畫出來的座標", () => {
    const broken = [];
    ARMOR_SHAPES.forEach((shapes, index) => {
      shapes.forEach((shape, i) => {
        const ok =
          shape.kind === "rect"
            ? shape.width > 0 && shape.height > 0
            : shape.kind === "circle"
              ? shape.r > 0
              : typeof shape.points === "string" && shape.points.length > 0;
        if (!ok) broken.push(`${PART_KEYS[index]}[${i}]`);
      });
    });

    expect(broken, "這些形狀畫不出東西").toEqual([]);
  });

  it("圓角一律由短邊推導，不會出現手填的漂移", () => {
    expect(radiusOf({ width: 28, height: 65 })).toBe(8); // 粗的部位吃上限
    expect(radiusOf({ width: 45, height: 15 })).toBe(4.5); // 細長的自動變小
    expect(radiusOf({ width: 96.8, height: 15 })).toBe(4.5);
  });
});

describe("飾品設定 accessoryConfig", () => {
  const configEntries = Object.entries(ACCESSORY_CONFIGS);

  it("armorIndex 都落在現有舞者範圍內", () => {
    configEntries.forEach(([key]) => {
      const armorIndex = Number(key);
      expect(
        Number.isInteger(armorIndex),
        `armorIndex "${key}" 必須是整數`,
      ).toBe(true);
      expect(armorIndex, `舞者 ${key} 超出 PLAYER_COUNT`).toBeLessThan(
        PLAYER_COUNT,
      );
      expect(armorIndex).toBeGreaterThanOrEqual(0);
    });
  });

  it("indices 都落在飾品區間 [BODY_PART_COUNT, PART_COUNT)", () => {
    // 在 PARTS 中間增刪身體部位會讓飾品整批位移，這則測試就是為了
    // 讓那種位移立刻現形，而不是變成某支武器默默不會亮。
    configEntries.forEach(([armorIndex, config]) => {
      config.groups.forEach((group) => {
        group.indices.forEach((partIndex) => {
          expect(
            isAccessoryPart(partIndex),
            `舞者 ${armorIndex} 的「${group.label}」用了身體部位 ${partIndex}`,
          ).toBe(true);
          expect(
            partIndex,
            `舞者 ${armorIndex} 的「${group.label}」索引 ${partIndex} 超出部位總數`,
          ).toBeLessThan(PART_COUNT);
        });
      });
    });
  });

  it("同一位舞者的飾品索引不重複", () => {
    configEntries.forEach(([armorIndex, config]) => {
      const all = config.groups.flatMap((group) => group.indices);
      expect(new Set(all).size, `舞者 ${armorIndex} 的飾品索引有重複`).toBe(
        all.length,
      );
    });
  });

  it("isPartAllowed：身體部位人人都有，飾品只有配置裡的才有", () => {
    PLAYER_INDICES.forEach((armorIndex) => {
      const allowedAccessories = new Set(
        (ACCESSORY_CONFIGS[armorIndex]?.groups ?? []).flatMap(
          (group) => group.indices,
        ),
      );

      PART_INDICES.forEach((partIndex) => {
        const expected = isAccessoryPart(partIndex)
          ? allowedAccessories.has(partIndex)
          : true;
        expect(
          isPartAllowed(armorIndex, partIndex),
          `isPartAllowed(${armorIndex}, ${partIndex})`,
        ).toBe(expected);
      });
    });
  });

  it("超出範圍的索引一律不允許", () => {
    expect(isPartAllowed(0, PART_COUNT)).toBe(false);
    expect(isPartAllowed(0, -1)).toBe(false);
  });
});

describe("其他跟著人數/部位數走的地方", () => {
  it("createEmptyActionTable 的形狀是 PLAYER_COUNT × PART_COUNT", () => {
    const table = createEmptyActionTable();

    expect(table).toHaveLength(PLAYER_COUNT);
    table.forEach((armor, armorIndex) => {
      expect(armor, `舞者 ${armorIndex}`).toHaveLength(PART_COUNT);
      armor.forEach((part) => expect(part).toEqual([]));
    });
  });

  it("createEmptyActionTable 不共用同一個陣列 reference", () => {
    // 用 `Array(n).fill([])` 會讓所有部位指向同一個陣列，寫一個部位等於寫全部。
    const table = createEmptyActionTable();
    expect(table[0][0]).not.toBe(table[0][1]);
    expect(table[0][0]).not.toBe(table[1][0]);
  });

  it("dancerVisibility 初始長度等於 PLAYER_COUNT", () => {
    const initial = profiles(undefined, { type: "@@INIT" });

    expect(initial.dancerVisibility).toHaveLength(PLAYER_COUNT);
    expect(initial.dancerVisibility.every(Boolean)).toBe(true);
  });
});
