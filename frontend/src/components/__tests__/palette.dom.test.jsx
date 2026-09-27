import { describe, it, expect } from "vitest";
import { act, fireEvent } from "@testing-library/react";

import Palette from "../Palette.jsx";
import { renderWithStore, createTestStore } from "../../test/renderEditor.jsx";

/**
 * 調色盤的行為測試。
 *
 * 重點只有一件事：**顏色要等使用者確定才算數**。
 *
 * `<input type="color">` 拖過色域的每一格都會發 `input`，使用者確定（關掉原生
 * 對話框）才發 `change`。React 的 `onChange` 綁的是前者，所以舊版是「滑鼠滑過
 * 色盤哪裡，選取的色塊就變成哪個顏色」——而 `chosenColor` 一變就會觸發
 * `applyColorToSelection`，於是滑過去的每個中間色都寫進光表、各佔一格 undo。
 *
 * jsdom 沒有原生色盤，但這兩個事件是可以分開發的，而「哪個事件才提交」正是
 * 這裡要鎖住的東西。
 */

const mount = (store) =>
  renderWithStore(<Palette rgba={null} setRgba={() => {}} />, { store });

const picker = () => document.querySelector("#colorWell");

const chosen = (store) => store.getState().profiles.chosenColor;

describe("調色器：滑過去不取色，確定才取色", () => {
  it("input 事件（拖過色域）不改變顏色", () => {
    const store = createTestStore({ paletteColor: "#000000" });
    mount(store);

    const before = chosen(store);

    // 原生色盤在拖曳期間就是這樣：值一路變、一路發 input
    for (const value of ["#110000", "#220000", "#330000"]) {
      picker().value = value;
      fireEvent(picker(), new Event("input", { bubbles: true }));
    }

    expect(chosen(store)).toEqual(before);
  });

  it("change 事件（使用者確定）才提交", () => {
    const store = createTestStore({ paletteColor: "#000000" });
    mount(store);

    picker().value = "#ff8000";
    fireEvent(picker(), new Event("change", { bubbles: true }));

    expect(chosen(store)).toMatchObject({ R: 255, G: 128, B: 0 });
  });

  it("拖過一整排顏色再確定，只留下最後那一個", () => {
    /*
     * 這一則是整個檔案的重點。舊版每一個中間色都會寫進光表並各佔一格 undo，
     * 選完一個顏色之後要按幾十次 Ctrl+Z 才回得去——而畫面上完全看不出來，
     * 因為最後的顏色是對的。
     */
    const store = createTestStore({ paletteColor: "#000000" });
    mount(store);

    for (const value of ["#110000", "#220000", "#330000", "#00ff00"]) {
      picker().value = value;
      fireEvent(picker(), new Event("input", { bubbles: true }));
    }
    fireEvent(picker(), new Event("change", { bubbles: true }));

    expect(chosen(store)).toMatchObject({ R: 0, G: 255, B: 0 });
    // 沿途經過的色相沒有被記進「最近使用」
    const recents = store.getState().profiles.recentColors ?? [];
    expect(recents.length).toBe(1);
  });

  it("亮度不會被取色洗掉（只換色相）", () => {
    const store = createTestStore({
      paletteColor: "#000000",
      chosenColor: { R: 0, G: 0, B: 0, A: 0.3 },
    });
    mount(store);

    picker().value = "#ff0000";
    fireEvent(picker(), new Event("change", { bubbles: true }));

    expect(chosen(store).A).toBeCloseTo(0.3);
  });
});

describe("調色器與其他入口的同步", () => {
  it("顏色從別處改變時，調色器跟著更新", () => {
    /*
     * 這個 input 是 uncontrolled 的（才能不理會 `input` 事件），所以外部變更
     * 要自己寫回 DOM。沒寫的話下次打開色盤顯示的還是上一個顏色——而使用者會
     * 以為自己記錯了。
     */
    const store = createTestStore({ paletteColor: "#000000" });
    mount(store);

    expect(picker().value).toBe("#000000");

    // Palette 有訂閱 store，dispatch 就會重繪——不必手動 rerender
    act(() => {
      store.dispatch({ type: "UPDATEPALETTECOLOR", payload: "#00FF00" });
    });

    expect(picker().value).toBe("#00ff00");
  });
});
