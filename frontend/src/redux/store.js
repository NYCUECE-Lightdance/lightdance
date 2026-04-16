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
  storage: localforage,
  whitelist: ["profiles"],
  transforms: [PeaksTransform],
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
      immutableCheck: false, // 對於大型數據，關閉不可變檢查以提昇效能
      serializableCheck: {
        // 忽略 redux-persist 的 Actions，並忽略 Float32Array 的序列化警告
        ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
        ignoredPaths: ["register", "rehydrate", "profiles.fullPeaks"],
        warnAfter: 128, 
      },
    }),
});

// 創建 persistor
export const persistor = persistStore(store);
