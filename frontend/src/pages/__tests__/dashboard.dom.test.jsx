import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Dashboard from "../Dashboard.jsx";
import { renderWithStore, createTestStore } from "../../test/renderEditor.jsx";

/**
 * Dashboard 的演出年份選單。
 *
 * 要守的是「選哪一年就只看那一年」：清單要帶著 `year=` 重抓，而選回今年時
 * **不帶** `year=`（今年是哪一年由後端決定，見 utils/season.js）。
 */

const SEASONS = { current: 2027, seasons: [2027, 2026, 2025] };

let requests;

beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      requests.push(url);
      const body = url.endsWith("/seasons")
        ? SEASONS
        : url.includes("/timelist/")
          ? { list: [] }
          : {};
      return { ok: true, json: async () => body };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mount = (store = createTestStore({ user: "alice" })) =>
  renderWithStore(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
    { store },
  );

const timelistRequests = () => requests.filter((url) => url.includes("/timelist/"));

describe("演出年份選單", () => {
  it("一開始是今年，清單不帶 year", async () => {
    mount();

    const picker = await screen.findByLabelText("演出年份");
    await screen.findByRole("option", { name: "2027（今年）" });

    expect(picker.value).toBe("");
    expect(timelistRequests()).toEqual(["/api/timelist/alice"]);
  });

  it("選別的年份會記住，並帶著 year 重抓清單", async () => {
    const { store } = mount();
    await screen.findByRole("option", { name: "2026" });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("演出年份"), {
        target: { value: "2026" },
      });
    });

    expect(store.getState().profiles.season).toBe(2026);
    await waitFor(() =>
      expect(timelistRequests().at(-1)).toBe("/api/timelist/alice?year=2026"),
    );
  });

  it("選回今年就回到不帶 year", async () => {
    const { store } = mount(createTestStore({ user: "alice", season: 2026 }));
    await screen.findByRole("option", { name: "2027（今年）" });
    expect(timelistRequests()[0]).toBe("/api/timelist/alice?year=2026");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("演出年份"), {
        target: { value: "" },
      });
    });

    expect(store.getState().profiles.season).toBeNull();
    await waitFor(() =>
      expect(timelistRequests().at(-1)).toBe("/api/timelist/alice"),
    );
  });

  it("記住的年份沒有資料時仍然留在選單裡", async () => {
    mount(createTestStore({ user: "alice", season: 2020 }));

    const option = await screen.findByRole("option", { name: "2020" });
    expect(option.selected).toBe(true);
  });
});
