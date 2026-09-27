import { describe, it, expect } from "vitest";

import profiles from "../reducers/profiles.js";
import { updateActionTable } from "../actions.js";

/**
 * `UPDATEACTIONTABLE` 的 history 行為。
 *
 * Phase 4 把 store 的光表從 keyframe 換成 segment，這裡有一條依賴形狀的
 * 判斷必須跟著處理，否則「放第一個色塊」那次編輯會無法 undo。詳見下方測試。
 */

const initial = () => profiles(undefined, { type: "@@INIT" });

const segment = (start, end) => ({
  id: `s-${start}`,
  start,
  end,
  colorStart: { R: 255, G: 0, B: 0, A: 1 },
  colorEnd: { R: 255, G: 0, B: 0, A: 1 },
  linear: 0,
});

/** 7×22 的空表，只有 (0,0) 放得下東西 */
const table = (segments) => [[segments]];

describe("history 累積", () => {
  it("一般編輯會推一筆 history", () => {
    const before = { ...initial(), history: [table([])] };
    const after = profiles(
      before,
      updateActionTable(table([segment(0, 1000)])),
    );

    expect(after.history).toHaveLength(2);
  });

  it("skipHistory 的寫入不推 history（初始化用）", () => {
    const before = { ...initial(), history: [table([])] };
    const after = profiles(
      before,
      updateActionTable(table([segment(0, 1000)]), { skipHistory: true }),
    );

    expect(after.history).toHaveLength(1);
  });

  it("reference 沒變就整個跳過（immer 無變更時的 O(1) short-circuit）", () => {
    const same = table([segment(0, 1000)]);
    const before = {
      ...initial(),
      data: { ...initial().data, actionTable: same },
      history: [table([])],
    };
    const after = profiles(before, updateActionTable(same));

    expect(after).toBe(before);
  });

  it("undo 用 O(1) reference 比較，不做深度比較", () => {
    /**
     * 原本這裡是 `JSON.stringify(a) === JSON.stringify(b)`——每按一次 Ctrl+Z
     * 就把整張光表序列化兩次，密集光表實測 53ms。
     *
     * 這個測試用「內容相同但 reference 不同」的兩張表把行為釘住：
     * 深度比較會誤判成相同而拒絕 undo，reference 比較則會正常還原。
     */
    const current = table([segment(0, 1000)]);
    const historyEntry = table([segment(0, 1000)]); // 深度相同、reference 不同

    const before = {
      ...initial(),
      data: { ...initial().data, actionTable: current },
      history: [historyEntry],
    };
    const after = profiles(before, { type: "UPDATEUNDO" });

    expect(after.data.actionTable).toBe(historyEntry);
    expect(after.history).toHaveLength(0);
    expect(after.redoStack[0]).toBe(current);
  });

  it("undo 到同一個 reference 時不動作", () => {
    const same = table([segment(0, 1000)]);
    const before = {
      ...initial(),
      data: { ...initial().data, actionTable: same },
      history: [same],
    };

    expect(profiles(before, { type: "UPDATEUNDO" })).toBe(before);
  });

  it("只有一個 segment 的編輯也會進 history", () => {
    /**
     * 【Phase 4 的回歸測試】
     *
     * 這裡原本有一條「第一個部位只有 1 個元素就跳過 history」的判斷，用來偵測
     * 「還在初始化」。keyframe 世界裡「只有一個 time 0 的黑點」確實等於空白，
     * 但 segment 世界裡「只有 1 個 segment」是使用者剛放下第一個色塊的正常狀態——
     * 沿用會讓那次編輯靜默地無法 undo。
     *
     * 初始化改為一律靠 meta.skipHistory 明示（見上一個測試）。
     */
    const before = { ...initial(), history: [table([])] };
    const after = profiles(
      before,
      updateActionTable(table([segment(0, 1000)])),
    );

    expect(after.data.actionTable[0][0]).toHaveLength(1);
    expect(after.history).toHaveLength(2);
  });
});
