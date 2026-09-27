import { describe, it, expect } from "vitest";

import { persistConfig } from "../store.js";

/**
 * persist 設定的回歸測試。
 *
 * 這裡鎖的每一條都對應一個實測過的效能問題，而且都是「改壞了不會有任何
 * 錯誤訊息、只會變慢」的那種——所以必須用測試釘住。
 */

describe("persist 不做 JSON 序列化", () => {
  it("serialize 關閉（否則每次編輯要付 73ms）", () => {
    // redux-persist 預設對每個 key 跑一次 JSON.stringify、再對整包跑第二次，
    // 而且不受 store.js 那個 2 秒 debounce 保護——debounce 只延後寫入 IndexedDB。
    // 20 萬點的 Float32Array 被 JSON 序列化會變成 5.3MB 的 {"0":..,"1":..} 字串。
    expect(persistConfig.serialize).toBe(false);
  });

  it("deserialize 同時吃字串與物件（相容關閉 serialize 之前寫入的資料）", () => {
    const { deserialize } = persistConfig;

    expect(deserialize({ a: 1 })).toEqual({ a: 1 });
    expect(deserialize('{"a":1}')).toEqual({ a: 1 });
  });

  it("Float32Array 經過 deserialize 不會被破壞", () => {
    const peaks = new Float32Array([0.1, 0.2, 0.3]);
    expect(persistConfig.deserialize(peaks)).toBe(peaks);
  });
});

describe("persist 的其他不變式", () => {
  it("key 是 root_v2（Phase 4 的回滾保險）", () => {
    // 舊 build 讀 root、新 build 讀 root_v2，兩者互不干擾
    expect(persistConfig.key).toBe("root_v2");
  });

  it("history / redoStack / fullPeaks 以外的暫態欄位不進 persist", () => {
    const inbound = persistConfig.transforms[0].in(
      {
        data: { actionTable: [] },
        history: [1, 2, 3],
        redoStack: [4],
        currentTime: 500,
        multiSelectedBlocks: [{ armorIndex: 0 }],
      },
      "profiles",
    );

    expect(inbound.history).toBeUndefined();
    expect(inbound.redoStack).toBeUndefined();
    expect(inbound.currentTime).toBeUndefined();
    expect(inbound.multiSelectedBlocks).toBeUndefined();
    expect(inbound.data).toBeDefined();
  });
});
