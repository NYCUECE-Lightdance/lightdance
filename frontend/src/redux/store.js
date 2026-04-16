import { combineReducers } from "redux";
import { configureStore } from "@reduxjs/toolkit";
import storage from "redux-persist/lib/storage"; // 使用 localStorage 來存儲狀態
import { persistStore, persistReducer, createTransform } from "redux-persist";
import LZString from "lz-string";

// 假設你有個 profiles reducer
import profiles from "./reducers/profiles";

const PeaksTransform = createTransform(
  // 進入儲存前 (Inbound)：將陣列壓縮成字串
  (inboundState, key) => {
    // 確保只針對 profiles 裡的 fullPeaks 進行處理，且目前它是陣列才壓縮
    if (key === "profiles" && Array.isArray(inboundState.fullPeaks)) {
      // console.log("⚡️ 正在壓縮 fullPeaks 資料以節省空間..."); 
      return {
        ...inboundState,
        fullPeaks: LZString.compressToUTF16(JSON.stringify(inboundState.fullPeaks)),
      };
    }
    return inboundState;
  },
  // 從儲存讀取時 (Outbound)：將字串解壓回陣列
  (outboundState, key) => {
    if (key === "profiles" && typeof outboundState.fullPeaks === "string") {
      try {
        // console.log("正在解壓縮並還原波形資料...");
        const decompressed = LZString.decompressFromUTF16(outboundState.fullPeaks);
        return {
          ...outboundState,
          fullPeaks: JSON.parse(decompressed),
        };
      } catch (e) {
        console.error("還原 fullPeaks 失敗：", e);
        return { ...outboundState, fullPeaks: [] };
      }
    }
    return outboundState;
  }
);

// 配置 persist 設置
const persistConfig = {
  key: "root", // 可以使用任何鍵名稱，建議使用 root
  storage, // 這裡設置存儲方式為 localStorage
  whitelist: ["profiles"],
  transforms: [PeaksTransform],
};

// 結合 reducers
const rootReducer = combineReducers({
  profiles, // 假設你的 profiles reducer 負責管理狀態
});

// 持久化 reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// 創建 store 並配置中間件
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false, // 禁用不可變檢查
      serializableCheck: {
        ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
        ignoredPaths: ["register", "rehydrate"],
      },
    }),
});

// 創建 persistor
export const persistor = persistStore(store);
