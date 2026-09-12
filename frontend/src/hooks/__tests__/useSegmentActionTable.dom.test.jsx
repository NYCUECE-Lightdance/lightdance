import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";

import { useSegmentActionTable } from "../useSegmentActionTable.js";
import { createTestStore } from "../../test/renderEditor.jsx";

/**
 * 光表寫入的守門測試。
 *
 * 這個 hook 是**唯一**的整張表寫入口，四個呼叫端（放色、刪除、區間平移、
 * 統一透明度）都是同一個模式：拿 hook 給的表當基準算完再整張寫回去。
 * 因此「hook 給的基準不對」這件事會同時毀掉四條路徑，守在這裡最划算。
 */

const wrapper = (store) =>
  function Wrapper({ children }) {
    return <Provider store={store}>{children}</Provider>;
  };

const mount = (store) =>
  renderHook(() => useSegmentActionTable(), { wrapper: wrapper(store) });

afterEach(() => vi.restoreAllMocks());

describe("commit", () => {
  it("寫入新的表", () => {
    const store = createTestStore();
    const { result } = mount(store);

    const next = result.current.segmentTable.map((armor) => [...armor]);
    act(() => result.current.commit(next));

    expect(store.getState().profiles.data.actionTable).toBe(next);
  });

  it("同一個 reference 不會佔一格 undo", () => {
    const store = createTestStore();
    const { result } = mount(store);
    const before = store.getState().profiles.history.length;

    act(() => result.current.commit(result.current.segmentTable));

    expect(store.getState().profiles.history.length).toBe(before);
  });

  it("擋下會讓舞者變少的寫入", () => {
    /**
     * 光表的形狀由 PLAYER_COUNT 固定，沒有合法的編輯會讓舞者變少。
     * 真實的觸發路徑是：資料還沒載入時 hook 給空陣列，呼叫端拿它當基準
     * 算完再寫回去——整場表演就這樣靜默消失，要到下次 Output 才發現。
     */
    const store = createTestStore();
    const { result } = mount(store);
    const before = store.getState().profiles.data.actionTable;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    act(() => result.current.commit([]));

    expect(store.getState().profiles.data.actionTable).toBe(before);
    expect(error).toHaveBeenCalled();
  });

  it("擋下非陣列的寫入", () => {
    const store = createTestStore();
    const { result } = mount(store);
    const before = store.getState().profiles.data.actionTable;
    vi.spyOn(console, "error").mockImplementation(() => {});

    act(() => result.current.commit(undefined));

    expect(store.getState().profiles.data.actionTable).toBe(before);
  });
});

describe("commitPart", () => {
  it("只換掉那一個部位的 reference，其餘沿用", () => {
    const store = createTestStore();
    const { result } = mount(store);
    const before = store.getState().profiles.data.actionTable;

    act(() => result.current.commitPart(0, 0, []));

    const after = store.getState().profiles.data.actionTable;
    expect(after[0][0]).not.toBe(before[0][0]);
    expect(after[0][1]).toBe(before[0][1]); // 同一位舞者的其他部位
    expect(after[1]).toBe(before[1]); // 其他舞者整列
  });

  it("同一個 reference 不會佔一格 undo", () => {
    const store = createTestStore();
    const { result } = mount(store);
    const current = store.getState().profiles.data.actionTable[0][0];
    const before = store.getState().profiles.history.length;

    act(() => result.current.commitPart(0, 0, current));

    expect(store.getState().profiles.history.length).toBe(before);
  });
});
