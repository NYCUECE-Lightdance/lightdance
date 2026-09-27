/**
 * 輸出把關 —— 舞者沒有的部位不准亮。
 *
 * `isPartAllowed` 原本只用在「畫面上要不要讓你點」（`ControlPanel.jsx` 與
 * `/edit` 的表格），輸出路徑一次都沒有檢查過。跨軌貼上之後這個缺口踩得到：
 * 落點是 `(舞者, 部位)` 的座標差推出來的，而 `planPaste` 唯一的檢查是
 * 「這個部位是不是一個陣列」——22 個部位全部為真。
 *
 * 這種錯的症狀是**沒有症狀**：上傳成功、版本清單正常、編輯器裡看得到色塊，
 * 只有演出當天那盞不存在的燈不會亮，而且沒有人查得出原因。所以落點那邊擋了
 * 之後，輸出這一關還是要擋——載入舊光表一樣可能帶進這種資料。
 */
import { describe, it, expect } from "vitest";

import { buildPlayers } from "../buildPlayers.js";
import { PART_KEYS } from "../../../constants/parts.js";
import { isPartAllowed } from "../../../config/accessoryConfig.js";

/** 一條只有「黑 → 紅 → 黑」的時間軸 */
const litRed = () => [
  { time: 0, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
  { time: 1000, color: { R: 255, G: 0, B: 0, A: 1 }, linear: 0 },
  { time: 1990, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
];

/** 7×22 的空表，指定的座標放一段紅光 */
const tableWith = (coords) => {
  const table = Array.from({ length: 7 }, () =>
    Array.from({ length: PART_KEYS.length }, () => []),
  );
  for (const [armor, part] of coords) table[armor][part] = litRed();
  return table;
};

/** 某位舞者某個欄位在整段輸出裡的最大 RGB 值（0 = 從頭到尾都是黑的） */
const peakRgb = (players, armor, partKey) =>
  players[armor].reduce((max, row) => {
    const packed = row[partKey] >>> 0;
    const rgb = packed >>> 8; // 低位元組是亮度與漸變旗標，不是顏色
    return Math.max(max, rgb);
  }, 0);

describe("輸出把關：舞者沒有的部位", () => {
  it("舞者 0 沒帶道具，飾品部位放了紅光也不會亮", () => {
    // 舞者 0 不在 ACCESSORY_CONFIGS 裡，acc0(14) 與 acc7(21) 都不是他的
    const players = buildPlayers(tableWith([[0, 14], [0, 21]]));

    expect(peakRgb(players, 0, "acc0")).toBe(0);
    expect(peakRgb(players, 0, "acc7")).toBe(0);
  });

  it("舞者 6 是匕首（14-18），第 19 個部位不是他的", () => {
    const players = buildPlayers(tableWith([[6, 18], [6, 19]]));

    // 18 = 刀柄，他有，要照常亮
    expect(peakRgb(players, 6, "acc4")).toBe(0xff0000);
    // 19 不在他的配置裡
    expect(peakRgb(players, 6, "acc5")).toBe(0);
  });

  it("身體部位人人都有，不可以被誤傷", () => {
    const players = buildPlayers(tableWith([[0, 0], [3, 13]]));

    expect(peakRgb(players, 0, "hat")).toBe(0xff0000);
    expect(peakRgb(players, 3, "shoeR")).toBe(0xff0000);
  });

  it("⚠️ 清掉的只有 RGB，亮度位元原樣保留", () => {
    /*
     * 黑色乘上任何亮度還是黑色，所以留著低位元組就足以保證那盞燈不亮。
     * 把整個欄位歸零的話，每一位舞者每一列的飾品欄位都會從 254（黑、亮度
     * 100%）變成 0——那是在沒有必要的情況下動到韌體契約，而 golden 測試
     * 會整批變紅。
     */
    const players = buildPlayers(tableWith([[0, 14]]));
    const lit = players[0].find((row) => row.time === 20); // 1000ms / 50

    expect(lit.acc0 >>> 8).toBe(0); // 顏色沒了
    expect(lit.acc0 & 0xff).toBe(254); // 亮度 127、非漸變，與原本相同
  });

  it("把關的依據就是 isPartAllowed，沒有第二份清單", () => {
    // 每一位舞者的每一個飾品部位都放紅光，再逐格對照
    const coords = [];
    for (let armor = 0; armor < 7; armor++) {
      for (let part = 14; part < PART_KEYS.length; part++) coords.push([armor, part]);
    }
    const players = buildPlayers(tableWith(coords));

    for (let armor = 0; armor < 7; armor++) {
      for (let part = 14; part < PART_KEYS.length; part++) {
        const peak = peakRgb(players, armor, PART_KEYS[part]);
        expect(
          peak > 0,
          `armor ${armor} / ${PART_KEYS[part]} 亮不亮，應該跟著 isPartAllowed`,
        ).toBe(isPartAllowed(armor, part));
      }
    }
  });
});
