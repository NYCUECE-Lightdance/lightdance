import { combineReducers } from "redux";
import { configureStore } from "@reduxjs/toolkit";
import localforage from "localforage"; // 導入 localforage
import { persistStore, persistReducer, createTransform } from "redux-persist";

// 假設你有個 profiles reducer
import profiles from "./reducers/profiles";

// 配置 localforage
localforage.config({
  name: "LightDanceApp",
  storeName: "redux_state" // 資料將存儲於 IndexedDB
});

// Debounce storage writes to avoid excessive IndexedDB serialization during rapid dispatches
// (e.g., playback rAF dispatches currentTime at 25fps; each edit triggers 2-3 dispatches).
const PERSIST_DEBOUNCE_MS = 2000;
let _persistTimer = null;
let _persistPending = null;
const _baseSetItem = localforage.setItem.bind(localforage);

const debouncedStorage = {
  ...localforage,
  setItem(key, value) {
    _persistPending = { key, value };
    if (_persistTimer == null) {
      _persistTimer = setTimeout(() => {
        _persistTimer = null;
        const p = _persistPending;
        _persistPending = null;
        if (p) _baseSetItem(p.key, p.value);
      }, PERSIST_DEBOUNCE_MS);
    }
    return Promise.resolve();
  },
};

/**
 * 剝離不需要持久化的大型/暫態欄位，大幅減少 IndexedDB 寫入的資料量。
 * history（最多 50 份 actionTable 快照）是序列化效能的最大瓶頸。
 */
const EPHEMERAL_FIELDS = [
  "history",
  "redoStack",
  "timelineBlocks",
  "multiSelectedBlocks",
  "clipboard",
  "isColorChangeActive",
  "moveMode",
  "autoRefresh",
  "currentTime",
  "selectedDancerId",
];

// ephemeral 欄位在 rehydrate 時應有的預設值（對齊 profiles.js initialState）
const EPHEMERAL_DEFAULTS = {
  history: [],
  redoStack: [],
  timelineBlocks: {},
  multiSelectedBlocks: [],
  clipboard: {
    type: null,
    data: null,
    sourceArmorIndex: null,
    sourcePartIndex: null,
    timestamp: null,
    sourceBlocks: [],
    startTime: 0,
    endTime: 0,
  },
  isColorChangeActive: false,
  moveMode: false,
  autoRefresh: 0,
  currentTime: 0,
  selectedDancerId: null,
};

const StripEphemeralTransform = createTransform(
  // inbound: 儲存前剝離大型/暫態欄位，減少 IndexedDB 寫入量
  (inboundState, key) => {
    if (key === "profiles") {
      const stripped = { ...inboundState };
      for (const field of EPHEMERAL_FIELDS) {
        delete stripped[field];
      }
      return stripped;
    }
    return inboundState;
  },
  // outbound: rehydrate 時補回預設值（autoMergeLevel2 可能遺漏）
  (outboundState, key) => {
    if (key === "profiles") {
      return { ...EPHEMERAL_DEFAULTS, ...outboundState };
    }
    return outboundState;
  }
);

/**
 * 穩健的波形數據轉換器
 * 1. 移除 LZString 同步壓縮，改用二進制轉換以提昇效能
 * 2. 利用 IndexedDB 原生支援 TypedArray 的特性，跳過 JSON 序列化開銷
 */
const PeaksTransform = createTransform(
  // 進入儲存前 (Inbound)
  (inboundState, key) => {
    if (key === "profiles" && Array.isArray(inboundState.fullPeaks)) {
      // console.log("💾 將 fullPeaks 轉換為二進制格式儲存...");
      return {
        ...inboundState,
        fullPeaks: new Float32Array(inboundState.fullPeaks),
      };
    }
    return inboundState;
  },
  // 從儲存讀取時 (Outbound)
  (outboundState, key) => {
    if (key === "profiles" && (outboundState.fullPeaks instanceof Float32Array || ArrayBuffer.isView(outboundState.fullPeaks))) {
      // console.log("📂 從二進制還原 fullPeaks...");
      return {
        ...outboundState,
        fullPeaks: Array.from(outboundState.fullPeaks),
      };
    }
    return outboundState;
  }
);

// 配置 persist 設置
const persistConfig = {
  key: "root", 
  storage: debouncedStorage,
  whitelist: ["profiles"],
  transforms: [StripEphemeralTransform, PeaksTransform],
};

// 結合 reducers
const rootReducer = combineReducers({
  profiles, 
});

// 持久化 reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// 創建 store 並配置中間件
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false, // 大型 actionTable 的遞迴檢查極度耗時
      serializableCheck: false, // 同上：actionTable 7×22×數千點，每次 dispatch 都遍歷全部節點
    }),
});

// 創建 persistor
export const persistor = persistStore(store);

// 確保關閉頁面前 flush 最後的 persist 寫入（避免 debounce 遺失資料）
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (_persistTimer != null) {
      clearTimeout(_persistTimer);
      _persistTimer = null;
      const p = _persistPending;
      _persistPending = null;
      if (p) _baseSetItem(p.key, p.value);
    }
  });
}
