import { combineReducers } from "redux";
import { configureStore } from "@reduxjs/toolkit";
import storage from "redux-persist/lib/storage"; // 使用 localStorage 來存儲狀態
import { persistStore, persistReducer } from "redux-persist";


// 假設你有個 profiles reducer
import profiles from "./reducers/profiles";

// 配置 persist 設置
const persistConfig = {
  key: "root", // 可以使用任何鍵名稱，建議使用 root
  storage, // 這裡設置存儲方式為 localStorage
  whitelist: ["profiles"],
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
