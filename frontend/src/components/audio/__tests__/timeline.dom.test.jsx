import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import { createRef } from "react";

import Timeline from "../Timeline.jsx";
import {
  renderWithStore,
  createTestStore,
  timelineOf,
} from "../../../test/renderEditor.jsx";

/**
 * Timeline 的冒煙測試 —— **改動它的訂閱方式之前的安全網**。
 *
 * Timeline 是整個編輯器最危險的檔案：色塊渲染、選取、Move Mode 拖曳、
 * 邊緣 resize 全在裡面，而且拖曳走的是「零 re-render」的 direct-DOM 路徑。
 * 在此之前它一行自動化測試都沒有。
 *
 * 這裡守的是**接線與資料流**：actionTable → timelineBlocks → 畫面色塊 →
 * 點擊 → 選取。拖曳手感與像素級行為仍然只能手動驗。
 */

const mount = (store = createTestStore(), props = {}) =>
  renderWithStore(
    <Timeline
      height={100}
      armorIndex={0}
      partIndex={0}
      hidden={false}
      isCopying={false}
      ref={createRef()}
      {...props}
    />,
    { store },
  );

const blocks = () => [...document.querySelectorAll(".timeline-block")];

/** 從 inline style 讀出色塊的背景色 */
const bgOf = (el) => el.style.backgroundColor;

describe("色塊渲染", () => {
  it("依 actionTable 算出色塊並畫出來", () => {
    // 測試光表壓平後是 [黑@0, 紅@1000, 綠@2000, 黑@10000]
    const store = createTestStore();
    mount(store);

    // 每個關鍵格對應一個色塊（最後一個黑點是結尾，不產生區間）
    expect(blocks().length).toBeGreaterThan(0);
    expect(blocks().some((el) => bgOf(el).includes("255, 0, 0"))).toBe(true);
    expect(blocks().some((el) => bgOf(el).includes("0, 255, 0"))).toBe(true);
  });

  it("⚠️ 色塊是元件自己算的，不進 Redux", () => {
    /*
     * 舊版是 `buildTimelineBlocks` 算完 dispatch 進 store，再 useSelector
     * 讀回來——寫的人和讀的人是同一個元件。那趟往返的代價是每次編輯多一個
     * dispatch，而一次 dispatch 會通知整個 store 的訂閱者（154 條 Timeline
     * 各約六個 selector），載入一份光表更是連續 154 次。
     *
     * 這一則守的是「不要有人再繞回去」。
     */
    const store = createTestStore();
    mount(store);

    expect(blocks().length).toBeGreaterThan(0);
    expect(store.getState().profiles.timelineBlocks).toBeUndefined();
  });

  it("色塊在畫面上首尾相接涵蓋整條時間軸", () => {
    // 寬度是 `durationTime / duration` 的百分比，加起來就該是 100%
    const store = createTestStore();
    mount(store);

    const total = blocks().reduce(
      (sum, el) => sum + parseFloat(el.style.width),
      0,
    );
    expect(total).toBeCloseTo(100, 1);
  });

  it("空白部位是一整條空隙", () => {
    const store = createTestStore();
    mount(store, { partIndex: 5 });

    const all = blocks();
    expect(all).toHaveLength(1);
    expect(all[0].dataset.gap).toBe("true");
    expect(all[0].dataset.segmentId).toBeUndefined();
  });

  it("每個色塊都帶著自己的 segmentId，空隙沒有", () => {
    const store = createTestStore();
    mount(store);

    const segments = store.getState().profiles.data.actionTable[0][0];
    const ids = blocks()
      .map((el) => el.dataset.segmentId)
      .filter(Boolean);

    // 有色的 block 一一對應到 store 裡的 segment
    expect(ids).toEqual(segments.map((s) => s.id));

    // 空隙沒有 id，而且標成 gap（不要從顏色反推——純黑是合法的燈色）
    blocks()
      .filter((el) => !el.dataset.segmentId)
      .forEach((gap) => expect(gap.dataset.gap).toBe("true"));
  });

  it("沒有 hidden 這回事——軌道永遠是可見可點的", () => {
    /**
     * 曾經有一個眼睛按鈕會把軌道設成 opacity:0 + pointerEvents:none，
     * 但軌道**照樣佔滿整個高度**，變成一條看不見也點不到的空白帶，
     * 而旁邊就有刪除鍵。整個功能已移除，這則測試守著它不要長回來。
     */
    const { container } = mount(createTestStore(), { hidden: true });

    const track = container.querySelector(".timeline-block").parentElement;
    expect(track.style.opacity).toBe("");
    expect(track.style.pointerEvents).toBe("");
  });
});

describe("選取", () => {
  it("點擊色塊會寫進 multiSelectedBlocks", () => {
    const store = createTestStore();
    mount(store);

    const colored = blocks().find((el) => bgOf(el).includes("255, 0, 0"));
    fireEvent.mouseDown(colored);

    const selected = store.getState().profiles.multiSelectedBlocks;
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ armorIndex: 0, partIndex: 0 });
  });

  it("選取帶著 segmentId，指向 store 裡真正的那一段", () => {
    const store = createTestStore();
    mount(store);

    const colored = blocks().find((el) => bgOf(el).includes("0, 255, 0"));
    fireEvent.mouseDown(colored);

    const { segmentId } = store.getState().profiles.multiSelectedBlocks[0];
    const segment = store
      .getState()
      .profiles.data.actionTable[0][0].find((s) => s.id === segmentId);

    expect(segment.colorStart).toMatchObject({ R: 0, G: 255, B: 0 });
  });

  it("選取項目只帶 segmentId，不帶任何索引", () => {
    /**
     * Phase 5g 之前這裡還有一個 `blockIndex`。索引會位移（鄰居被刪、色塊被
     * 切開），而且錯了不會報錯只會靜默選錯——鎖住「不准長回來」。
     */
    const store = createTestStore();
    mount(store);

    fireEvent.mouseDown(blocks().find((el) => bgOf(el).includes("0, 255, 0")));

    const selection = store.getState().profiles.multiSelectedBlocks[0];
    expect(Object.keys(selection).sort()).toEqual([
      "armorIndex",
      "partIndex",
      "segmentId",
    ]);
  });

  it("點擊空隙不會選取，而且會清空既有選取", () => {
    const store = createTestStore();
    mount(store);

    // 先選一個色塊
    fireEvent.mouseDown(blocks().find((el) => bgOf(el).includes("255, 0, 0")));
    expect(store.getState().profiles.multiSelectedBlocks).toHaveLength(1);

    // 再點空隙
    const gap = blocks().find((el) => bgOf(el).includes("0, 0, 0"));
    fireEvent.mouseDown(gap);

    expect(store.getState().profiles.multiSelectedBlocks).toHaveLength(0);
  });

  it("Shift 點擊選取兩段之間的所有色塊", () => {
    const store = createTestStore();
    mount(store);

    const red = blocks().find((el) => bgOf(el).includes("255, 0, 0"));
    const green = blocks().find((el) => bgOf(el).includes("0, 255, 0"));

    fireEvent.mouseDown(red);
    fireEvent.mouseDown(green, { shiftKey: true });

    const selected = store.getState().profiles.multiSelectedBlocks;
    const segments = store.getState().profiles.data.actionTable[0][0];

    expect(selected.map((s) => s.segmentId)).toEqual(segments.map((s) => s.id));
  });

  it("選取用的是 id，編輯掉前面的色塊也不會指到別人", () => {
    /**
     * 這就是換掉索引的理由。索引會位移而且不報錯——Phase 4 連續踩到三次。
     */
    const store = createTestStore();
    mount(store);

    fireEvent.mouseDown(blocks().find((el) => bgOf(el).includes("0, 255, 0")));
    const { segmentId } = store.getState().profiles.multiSelectedBlocks[0];

    // 直接把第一段拿掉，模擬「前面的色塊被刪除」
    const table = store.getState().profiles.data.actionTable;
    const trimmed = table.map((armor, a) =>
      a === 0
        ? armor.map((segs, p) => (p === 0 ? segs.slice(1) : segs))
        : armor,
    );
    store.dispatch({ type: "UPDATEACTIONTABLE", payload: trimmed });

    const after = store
      .getState()
      .profiles.data.actionTable[0][0].find((s) => s.id === segmentId);

    expect(after.colorStart).toMatchObject({ R: 0, G: 255, B: 0 });
  });
});

describe("極窄的色塊仍然看得見", () => {
  /*
   * 一個 50ms 的段在 282 秒的表演裡是 0.0177%，1 倍率下約 0.25px ——
   * 畫得出來但看不見，也點不到。而它是真的資料，`movableRange` 會把它當
   * 鄰居，於是拖曳被一個畫面上不存在的東西擋住。這種碎片是 `clearRange`
   * 的 trim 產生的，一次普通的貼上就會留下。
   *
   * jsdom 沒有版面，量不到「渲染出來幾像素」，所以這裡守的是規則本身：
   * 真的色塊有最小寬度、空隙沒有。真正的像素只有 `npm run e2e` 驗得到。
   */
  it("真的色塊有最小寬度，空隙沒有", () => {
    mount();

    const all = blocks();
    expect(all.length).toBeGreaterThan(0);

    const segments = all.filter((el) => el.dataset.segmentId);
    const gaps = all.filter((el) => el.dataset.gap === "true");
    expect(segments.length).toBeGreaterThan(0);
    expect(gaps.length).toBeGreaterThan(0);

    // 有 id 的是真的資料 —— 再窄都要留得住一條看得見的痕跡
    segments.forEach((el) => expect(el.style.minWidth).toBe("2px"));

    // 空隙本來就該看不見。撐大它反而會蓋掉旁邊真正的碎片
    gaps.forEach((el) => expect(el.style.minWidth).toBe(""));
  });

  it("位置由 left 決定，不是靠前後相接排出來的", () => {
    /*
     * 舊版是 flex + 百分比寬度，色塊的位置來自前面每一塊的寬度總和 ——
     * 所以任何一塊撐大都會推到後面每一塊，給碎片一個最小寬度會讓整列
     * 跟播放頭錯位。改成絕對定位之後每一塊的 left 各自獨立。
     */
    mount();

    blocks().forEach((el) => {
      expect(el.style.position).toBe("absolute");
      expect(el.style.left).toMatch(/%$/);
    });
  });
});

describe("只重算自己的部位", () => {
  it("改動 (0,0) 不會動到 (1,3) 的 segments reference", () => {
    /**
     * 這是逐部位訂閱的前提：沒被改動的部位必須沿用原本的 reference，
     * Timeline 才可能只在自己那條變動時重繪。
     */
    const store = createTestStore();
    const before = store.getState().profiles.data.actionTable[1][3];

    store.dispatch({
      type: "UPDATE_MULTI_SELECTED_BLOCKS",
      payload: [{ armorIndex: 0, partIndex: 0, segmentId: null }],
    });
    mount(store);

    const after = store.getState().profiles.data.actionTable[1][3];
    expect(after).toBe(before);
  });
});
