import { combineReducers } from "redux";
import { configureStore } from "@reduxjs/toolkit";
import localforage from "localforage"; // 導入 localforage
import { persistStore, persistReducer, createTransform } from "redux-persist";

// 假設你有個 profiles reducer
import profiles from "./reducers/profiles";
import { toSegmentTable } from "../utils/migration/loadProjectData.js";
import { migrateWorksets } from "../utils/worksets.js";

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
 * 立刻把還在等的那次寫入落地，不等 debounce。
 *
 * debounce 對「連續編輯」是必要的（播放時 rAF 每秒 25 次 dispatch），但有些
 * 時刻**不能等**：
 *
 * - **登入後**：token 沒落地就重新整理／直接開 `/home`，會被判定成未登入而
 *   彈回首頁。實測在瀏覽器上幾乎必現——登入到導頁只要幾十毫秒，離 2 秒差很遠。
 * - **關閉分頁前**：`setItem` 立刻回傳 resolved promise，redux-persist 以為
 *   寫好了，但實際上還在計時器裡；這 2 秒內關掉分頁，那次編輯就沒了。
 *
 * @returns {Promise} 寫入完成的 promise（沒有待寫入時立即完成）
 */
export function flushPersist() {
  if (_persistTimer != null) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  const pending = _persistPending;
  _persistPending = null;
  return pending ? _baseSetItem(pending.key, pending.value) : Promise.resolve();
}

/**
 * 剝離不需要持久化的大型/暫態欄位，大幅減少 IndexedDB 寫入的資料量。
 * history（最多 50 份 actionTable 快照）是序列化效能的最大瓶頸。
 */
const EPHEMERAL_FIELDS = [
  "history",
  "redoStack",
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
  // outbound: rehydrate 時補回預設值（autoMergeLevel2 可能遺漏），
  // 並把舊版的 showPart 遷移成工作集（見 utils/worksets.js）
  (outboundState, key) => {
    if (key === "profiles") {
      return migrateWorksets({ ...EPHEMERAL_DEFAULTS, ...outboundState });
    }
    return outboundState;
  }
);

/**
 * 波形數據轉換器：以 Float32Array 的形式存進 IndexedDB。
 *
 * ⚠️ 這個轉換器只有在 `persistConfig` 設了 `serialize: false` 時才真的有意義。
 * redux-persist 預設會對每個 key 跑 `JSON.stringify`，而 `Float32Array` 被
 * JSON 序列化的結果是 `{"0":0.1,"1":0.2,...}` —— 20 萬個點會變成 5.3 MB 的
 * 物件字面值字串，**比原本的陣列還慢**。實測每次編輯要 53.7 ms。
 *
 * 關掉 serialize 之後才是走 IndexedDB 原生的 structured clone，
 * TypedArray 保持二進位，同樣的操作降到 0.5 ms。
 */
const PeaksTransform = createTransform(
  /*
   * 進入儲存前：確保是 Float32Array。
   *
   * `computePeaks` 現在直接產生 Float32Array，所以多數情況這裡什麼都不用做；
   * 留著這一段是為了**舊的 persist 資料**——它們存的是一般陣列。
   */
  (inboundState, key) => {
    if (key === "profiles" && Array.isArray(inboundState.fullPeaks)) {
      return {
        ...inboundState,
        fullPeaks: new Float32Array(inboundState.fullPeaks),
      };
    }
    return inboundState;
  },
  /*
   * 從儲存讀取時：**維持 Float32Array，不要轉回一般陣列**。
   *
   * 舊版這裡做 `Array.from(...)`，於是重新整理之後 20 萬個峰值又變回每格
   * 8 bytes 的一般陣列（1.6MB → 0.8MB 的省法整個失效）。所有讀取端都已經
   * 改成用 `ArrayBuffer.isView` 也認得的判斷（見 `utils/audio/peaks.js`
   * 的 `isPeaks`），所以不必再轉。
   *
   * 舊資料存的是一般陣列，這裡順手升上去。
   */
  (outboundState, key) => {
    if (key === "profiles" && Array.isArray(outboundState.fullPeaks)) {
      return {
        ...outboundState,
        fullPeaks: new Float32Array(outboundState.fullPeaks),
      };
    }
    return outboundState;
  }
);

/**
 * 載入時把光表遷移成 segment 形狀。
 *
 * 為什麼要放在 transform 而不只是靠 key bump：使用者的瀏覽器裡可能還留著
 * 舊 build 寫進 `root_v2` 之前的資料，也可能是 v2 但被舊 build 覆寫過。
 * 這裡以形狀為準（見 utils/migration/loadProjectData.js），任何情況都轉對。
 */
const MigrateActionTableTransform = createTransform(
  (inboundState) => inboundState, // 寫入時不動：store 裡本來就是 segments
  (outboundState, key) => {
    if (key !== "profiles" || !outboundState?.data?.actionTable) {
      return outboundState;
    }

    return {
      ...outboundState,
      data: {
        ...outboundState.data,
        actionTable: toSegmentTable(outboundState.data.actionTable, {
          duration: outboundState.duration ?? 0,
        }),
      },
    };
  },
);

// 配置 persist 設置
export const persistConfig = {
  // Phase 4 把 store 的光表形狀從 keyframe 換成 segment。key 從 root bump 成
  // root_v2 之後，舊 build 讀 root、新 build 讀 root_v2，兩者互不干擾——
  // 這是 deploy 出事時能直接 revert 的保險。
  key: "root_v2",
  storage: debouncedStorage,
  whitelist: ["profiles"],

  // 不要 JSON 序列化 —— 這是編輯時最大的單一卡頓來源。
  //
  // redux-persist 預設對每個 key 跑一次 `JSON.stringify`、再對整包跑第二次，
  // 而且**這件事沒有被 debounce**：`createPersistoid` 在每次 state 變動的下一個
  // tick 就會做，只有寫入 IndexedDB 的動作才走上面的 2 秒 debounce。
  // 所以每一次放色、每一次拖曳 commit 都要付一次完整序列化。
  //
  // 實測（真實光表 real-rich-show + 20 萬點波形）：
  //   序列化總計 72.9 ms／次編輯，其中 fullPeaks 佔 53.7 ms、actionTable 只佔 0.3 ms
  //   關掉之後 → 0.5 ms
  //
  // localforage 底層是 IndexedDB，原生支援 structured clone，本來就能直接存
  // 巢狀物件與 TypedArray，不需要先轉成字串。
  serialize: false,

  // 讀取端刻意寫成「兩種都吃」而不是 `deserialize: false`：
  // 瀏覽器裡可能還留著開這個 flag 之前寫進去的 JSON 字串（例如跑過舊 build 的
  // 開發機）。硬性假設一定是物件，那些人一開啟編輯器就會拿到一個字串當 state。
  deserialize: (value) => (typeof value === "string" ? JSON.parse(value) : value),

  transforms: [
    StripEphemeralTransform,
    PeaksTransform,
    MigrateActionTableTransform,
  ],
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
