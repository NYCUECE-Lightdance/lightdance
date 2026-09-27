import { describe, it, expect } from "vitest";

import profiles from "../reducers/profiles.js";
import {
  addWorkset,
  removeWorkset,
  renameWorkset,
  switchWorkset,
  updateShowPart,
} from "../actions.js";
import { activeTracks } from "../../utils/worksets.js";

/**
 * 工作集在 reducer 層的行為。
 *
 * 純函式那一層已經在 `utils/__tests__/worksets.test.js` 窮舉過，這裡只驗
 * **接線**：既有的 `updateShowPart` 有沒有正確寫進「目前這一組」，以及
 * 工作集的增刪改切有沒有真的接上。
 *
 * 前者是這次改動風險最高的地方——加軌、移除、上下移、套用選取四個呼叫端
 * 都還在發同一個 action，如果它寫錯組別，使用者會看到「我明明刪了一條軌，
 * 但畫面上沒變，切到另一組才發現被刪的是那邊的」。
 */

const initial = () => profiles(undefined, { type: "@@INIT" });

const tracks = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    armorIndex: i,
    partIndex: 0,
  }));

describe("updateShowPart 寫進目前這一組", () => {
  it("改的是作用中的那組，不是第一組", () => {
    let state = initial();
    state = profiles(state, addWorkset("第二組")); // 新增後會自動切過去
    const secondId = state.worksets.activeId;

    state = profiles(state, updateShowPart(tracks(5)));

    expect(activeTracks(state.worksets)).toHaveLength(5);
    // 第一組原封不動
    const first = state.worksets.sets.find((s) => s.id !== secondId);
    expect(first.tracks).toHaveLength(3);
  });

  it("沒有任何工作集時原樣回傳，不要炸掉", () => {
    const broken = { ...initial(), worksets: { activeId: 1, sets: [] } };
    expect(profiles(broken, updateShowPart(tracks(2)))).toBe(broken);
  });
});

describe("工作集的增刪改切", () => {
  it("新增會複製目前這一組並切換過去", () => {
    let state = initial();
    const before = state.worksets.sets.length;

    state = profiles(state, addWorkset("副歌用"));

    expect(state.worksets.sets).toHaveLength(before + 1);
    expect(state.worksets.sets.at(-1).name).toBe("副歌用");
    expect(activeTracks(state.worksets)).toHaveLength(3); // 複製而來
  });

  it("切換會換掉 activeTracks", () => {
    let state = initial();
    const firstId = state.worksets.activeId;
    state = profiles(state, addWorkset("第二組"));
    state = profiles(state, updateShowPart(tracks(1)));

    expect(activeTracks(state.worksets)).toHaveLength(1);

    state = profiles(state, switchWorkset(firstId));
    expect(activeTracks(state.worksets)).toHaveLength(3);
  });

  it("改名不動軌道", () => {
    let state = initial();
    const id = state.worksets.activeId;
    state = profiles(state, renameWorkset(id, "開場"));

    expect(state.worksets.sets[0].name).toBe("開場");
    expect(activeTracks(state.worksets)).toHaveLength(3);
  });

  it("只剩一組時刪不掉——畫面不能變成沒有任何軌道", () => {
    const state = initial();
    const after = profiles(state, removeWorkset(state.worksets.activeId));

    expect(after.worksets.sets).toHaveLength(1);
    expect(activeTracks(after.worksets)).toHaveLength(3);
  });

  it("刪掉作用中的那組之後，activeId 仍然指得到東西", () => {
    let state = initial();
    state = profiles(state, addWorkset("第二組"));
    state = profiles(state, removeWorkset(state.worksets.activeId));

    expect(state.worksets.sets).toHaveLength(1);
    expect(
      state.worksets.sets.some((s) => s.id === state.worksets.activeId),
    ).toBe(true);
  });
});

describe("工作集不進 undo 歷史", () => {
  it("切換與新增都不會佔一格 undo", () => {
    /**
     * undo 管的是光表內容。把「我剛才換到另一組軌道來看」也記進去的話，
     * Ctrl+Z 會先把視圖切回來一次，使用者要多按好幾下才回得到上一次編輯。
     */
    let state = initial();
    const before = state.history.length;

    state = profiles(state, addWorkset("第二組"));
    state = profiles(state, switchWorkset(1));
    state = profiles(state, updateShowPart(tracks(2)));

    expect(state.history).toHaveLength(before);
  });
});
