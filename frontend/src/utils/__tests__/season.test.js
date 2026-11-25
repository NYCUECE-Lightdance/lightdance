import { describe, it, expect } from "vitest";

import { selectSeason, withSeason } from "../season.js";
import { updateSeason } from "../../redux/actions.js";
import { profiles } from "../../redux/reducers/profiles.js";

describe("withSeason", () => {
  it("今年（null）不帶參數，讓後端決定是哪一年", () => {
    expect(withSeason("/api/timelist/alice", null)).toBe("/api/timelist/alice");
    expect(withSeason("/api/timelist/alice", undefined)).toBe("/api/timelist/alice");
  });

  it("指定年份接在網址後面", () => {
    expect(withSeason("/api/timelist/alice", 2026)).toBe(
      "/api/timelist/alice?year=2026",
    );
  });

  it("網址已經有參數時用 &", () => {
    expect(withSeason("/api/timelist/?limit=10", 2026)).toBe(
      "/api/timelist/?limit=10&year=2026",
    );
  });
});

describe("演出年份的 state", () => {
  it("預設是今年（null）", () => {
    const state = profiles(undefined, { type: "@@INIT" });
    expect(selectSeason({ profiles: state })).toBeNull();
  });

  it("選了年份就記住，選回今年就回到 null", () => {
    let state = profiles(undefined, updateSeason(2026));
    expect(state.season).toBe(2026);

    state = profiles(state, updateSeason(null));
    expect(state.season).toBeNull();
  });

  it("登出（REFRESH）回到今年", () => {
    const state = profiles(profiles(undefined, updateSeason(2025)), {
      type: "REFRESH",
    });
    expect(state.season).toBeNull();
  });
});
