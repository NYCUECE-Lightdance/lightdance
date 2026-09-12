import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";

import Armor from "../Armor.jsx";
import {
  renderWithStore,
  createTestStore,
  timelineOf,
  segmentsOf,
} from "../../test/renderEditor.jsx";

/**
 * 光衣放色的冒煙測試。
 *
 * Phase 1 把三份重複的 insertArray 合併成 utils/actionTable/insertColorKeyframes.js，
 * 當時是用 20,000 組隨機輸入證明純函式等價；但「點擊 SVG → dispatch → state 變動」
 * 這條線只有這裡守得住。
 */

/** 點擊光衣上代表某部位的圖形。部位 0（帽子）是最上面的 path。 */
/**
 * 點某個部位。
 *
 * 用 `data-part` 指名，不要用「第 N 個有 fill 的元素」——帽子與領帶各由兩個
 * 形狀組成（見 config/armorShapes.js），位置編號和部位編號早就不是同一件事。
 */
const clickPart = (container, part) => {
  fireEvent.click(container.querySelector(`svg [data-part="${part}"]`));
};

describe("Armor 放色", () => {
  it("點擊部位會在該部位的時間軸插入選定顏色", () => {
    const store = createTestStore({
      currentTime: 5000,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const { container } = renderWithStore(<Armor index={0} />, { store });

    const before = timelineOf(store, 0, 0).length;
    clickPart(container, 0);
    const after = timelineOf(store, 0, 0);

    expect(after.length).toBeGreaterThan(before);
    expect(
      after.some(
        (entry) =>
          entry.color.R === 10 && entry.color.G === 20 && entry.color.B === 30,
      ),
    ).toBe(true);
  });

  it("插入時間對齊到 tick 網格", () => {
    const store = createTestStore({
      currentTime: 5017,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const { container } = renderWithStore(<Armor index={0} />, { store });

    clickPart(container, 0);

    const inserted = timelineOf(store, 0, 0).find(
      (entry) => entry.color.R === 10,
    );
    expect(inserted.time).toBe(5000);
    // 播放位置也會被對齊
    expect(store.getState().profiles.currentTime).toBe(5000);
  });

  it("時間軸永遠保持依時間排序", () => {
    const store = createTestStore({
      currentTime: 1500,
      chosenColor: { R: 1, G: 2, B: 3, A: 1 },
    });
    const { container } = renderWithStore(<Armor index={0} />, { store });

    clickPart(container, 0);

    const times = timelineOf(store, 0, 0).map((entry) => entry.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("只改動被點擊的舞者與部位", () => {
    const store = createTestStore({
      currentTime: 5000,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const otherBefore = JSON.stringify(timelineOf(store, 1, 0));
    const samePlayerOtherPart = JSON.stringify(timelineOf(store, 0, 5));

    const { container } = renderWithStore(<Armor index={0} />, { store });
    clickPart(container, 0);

    expect(JSON.stringify(timelineOf(store, 1, 0))).toBe(otherBefore);
    expect(JSON.stringify(timelineOf(store, 0, 5))).toBe(samePlayerOtherPart);
  });

  it("沒被改到的部位維持同一個 reference（逐部位訂閱的前提）", () => {
    const store = createTestStore({
      currentTime: 5000,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const otherPartBefore = segmentsOf(store, 0, 5);
    const otherArmorBefore = segmentsOf(store, 1, 0);

    const { container } = renderWithStore(<Armor index={0} />, { store });
    clickPart(container, 0);

    // 結構共享：只有被編輯的那條時間軸換掉 reference，
    // 其餘 153 條的訂閱者完全不會被喚醒
    expect(segmentsOf(store, 0, 5)).toBe(otherPartBefore);
    expect(segmentsOf(store, 1, 0)).toBe(otherArmorBefore);
  });
});

describe("Armor 放色的 segment 語意（Phase 5）", () => {
  it("在空白處放色會放出一個預設 1 秒的色塊", () => {
    // 部位 5 在測試光表裡是空的
    const store = createTestStore({
      currentTime: 3000,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const { container } = renderWithStore(<Armor index={0} />, { store });

    expect(segmentsOf(store, 0, 5)).toEqual([]);
    clickPart(container, 5);

    const segments = segmentsOf(store, 0, 5);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      start: 3000,
      end: 4000,
      colorStart: { R: 10, G: 20, B: 30, A: 1 },
      linear: 0,
    });
  });

  it("在既有色塊中間放色會把它切成三段", () => {
    // 部位 0 在 2000~10000 是綠色（見 renderEditor.jsx）
    const store = createTestStore({
      currentTime: 5000,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const { container } = renderWithStore(<Armor index={0} />, { store });

    clickPart(container, 0);

    const segments = segmentsOf(store, 0, 0);
    const inserted = segments.find((s) => s.colorStart.R === 10);
    expect(inserted).toMatchObject({ start: 5000, end: 6000 });

    // 前後的綠色被裁短而不是消失
    expect(segments.some((s) => s.start === 2000 && s.end === 5000)).toBe(true);
    expect(segments.some((s) => s.start === 6000 && s.end === 10000)).toBe(
      true,
    );
  });

  it("同一點連按兩次同一個顏色，第二次不佔一格 undo", () => {
    const store = createTestStore({
      currentTime: 3000,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const { container } = renderWithStore(<Armor index={0} />, { store });

    clickPart(container, 5);
    const afterFirst = store.getState().profiles;
    const historyLength = afterFirst.history.length;

    clickPart(container, 5);

    expect(store.getState().profiles.history.length).toBe(historyLength);
    expect(segmentsOf(store, 0, 5)).toBe(afterFirst.data.actionTable[0][5]);
  });

  it("每個 segment 都有自己的 id（供多選與 undo diff 使用）", () => {
    const store = createTestStore({
      currentTime: 3000,
      chosenColor: { R: 10, G: 20, B: 30, A: 1 },
    });
    const { container } = renderWithStore(<Armor index={0} />, { store });

    clickPart(container, 5);

    expect(typeof segmentsOf(store, 0, 5)[0].id).toBe("string");
  });
});
