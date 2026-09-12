import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { render } from "@testing-library/react";

import profiles from "../redux/reducers/profiles.js";
import { normalizeActionTable } from "../utils/actionTable/normalizeActionTable.js";
import { toSegmentTable } from "../utils/migration/loadProjectData.js";
import { segmentsToKeyframes } from "../utils/segments/convert.js";
import { makeSelection } from "../utils/selection.js";

/**
 * 元件測試的共用掛載工具。
 *
 * 刻意用**真的 reducer**（不是 mock store）：這些測試要驗證的是
 * 「按鍵/點擊 → dispatch → state 真的變了」這條完整路徑，用 mock store
 * 只會驗證到有沒有呼叫 dispatch，抓不到 reducer 或選取邏輯的漂移。
 *
 * ## store 存 segments，但測試可以用 keyframe 描述
 *
 * 「幾點幾分是什麼顏色」是描述光表最直覺的方式，也正是韌體看到的形式。所以：
 *
 * - `makeTestActionTable()` 用 keyframe 寫，掛載前轉成 segments 進 store
 * - `timelineOf()` 把 store 的 segments 壓平回 keyframe 再回傳
 * - `segmentsOf()` 直接給 store 裡的 segments，斷言 segment 層的行為
 *
 * 兩種斷言各有用處：keyframe 那份等於「韌體會收到什麼」，segment 那份等於
 * 「編輯器的資料長什麼樣」。改資料形狀時前者不該變，後者會變。
 */

const DURATION = 10000;

/** 產生一張有內容的光表：舞者 0 的部位 0 有一個 1~2 秒的紅色色塊 */
export function makeTestActionTable() {
  const table = normalizeActionTable([], DURATION);
  table[0][0] = [
    { time: 0, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
    { time: 1000, color: { R: 255, G: 0, B: 0, A: 1 }, linear: 0 },
    { time: 1990, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
    { time: 2000, color: { R: 0, G: 255, B: 0, A: 1 }, linear: 0 },
    { time: DURATION, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
  ];
  return table;
}

/**
 * 三位舞者的同一個部位各有一個 1~2 秒的紅色色塊 —— **跨軌操作的測試素材**。
 *
 * 「同一個樂句在好幾位舞者身上各有一段」正是框選與跨軌編輯存在的理由，
 * 而預設的 `makeTestActionTable()` 只有 (0,0) 有東西，跨軌的行為在它上面
 * 全部退化成單軌，測了等於沒測。
 */
export function makeCrossTrackTable() {
  const table = normalizeActionTable([], DURATION);
  for (const armor of [0, 1, 2]) {
    table[armor][0] = [
      { time: 0, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
      { time: 1000, color: { R: 255, G: 0, B: 0, A: 1 }, linear: 0 },
      { time: 2000, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
      { time: DURATION, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
    ];
  }
  return table;
}

/** 用 `makeCrossTrackTable` 當內容的 store */
export const createCrossTrackStore = (overrides = {}) =>
  createTestStore({
    data: {
      music_filename: "2026_show.mp3",
      actionTable: toSegmentTable(makeCrossTrackTable(), { duration: DURATION }),
    },
    ...overrides,
  });

/** 同一張光表的 segment 形式（store 實際存的東西） */
export function makeTestSegmentTable() {
  return toSegmentTable(makeTestActionTable(), { duration: DURATION });
}

export function createTestStore(overrides = {}) {
  return configureStore({
    reducer: { profiles },
    preloadedState: {
      profiles: {
        ...profiles(undefined, { type: "@@INIT" }),
        duration: DURATION,
        data: {
          music_filename: "2026_show.mp3",
          actionTable: makeTestSegmentTable(),
        },
        ...overrides,
      },
    },
    middleware: (getDefault) =>
      // actionTable 很大且含巢狀物件，序列化/不可變檢查在測試裡只會拖慢速度
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

/** 掛載一個元件並附上真 store，回傳 RTL 的結果加上 store */
export function renderWithStore(ui, { store = createTestStore() } = {}) {
  const result = render(<Provider store={store}>{ui}</Provider>);
  return { ...result, store };
}

/**
 * 取得目前 state 中某個部位的時間軸（**keyframe 形式**），方便斷言編輯結果。
 *
 * store 存的是 segments，這裡轉回 keyframe —— 和編輯器渲染時看到的是同一份。
 */
export const timelineOf = (store, armor = 0, part = 0) => {
  const state = store.getState().profiles;
  return segmentsToKeyframes(state.data.actionTable[armor][part], {
    duration: state.duration,
  });
};

/** 取得 store 裡真正的 segments，用來斷言 segment 層的行為 */
export const segmentsOf = (store, armor = 0, part = 0) =>
  store.getState().profiles.data.actionTable[armor][part];

/**
 * 選取某個部位的第 N 個 segment。
 *
 * 選取項目要帶 `segmentId`，而 id 是建立 store 時才產生的（`createId()`），
 * 測試沒辦法先寫死。所以選取一律**從 store 反查**，不要在測試裡手工組選取項目
 * —— 那等於把實作細節抄進斷言裡。
 *
 * @param segmentIndex 依時間排序的第幾個色塊（0 起算）
 */
export const selectSegment = (store, armor = 0, part = 0, segmentIndex = 0) => {
  const segment = segmentsOf(store, armor, part)[segmentIndex];
  const selection = makeSelection({
    armorIndex: armor,
    partIndex: part,
    segment,
  });

  store.dispatch({
    type: "UPDATE_MULTI_SELECTED_BLOCKS",
    payload: [selection],
  });
  return selection;
};

/** 同時選取多個 segment（Shift 多選的結果） */
export const selectSegments = (store, armor, part, segmentIndexes) => {
  const selections = segmentIndexes.map((index) =>
    makeSelection({
      armorIndex: armor,
      partIndex: part,
      segment: segmentsOf(store, armor, part)[index],
    }),
  );

  store.dispatch({
    type: "UPDATE_MULTI_SELECTED_BLOCKS",
    payload: selections,
  });
  return selections;
};

/**
 * 跨軌選取：`coords` 是一串 `[armorIndex, partIndex, segmentIndex]`。
 *
 * 第一筆是**錨點**（貼上的軌道平移量、工具列的顏色都以它為準），所以順序有意義。
 */
export const selectAcross = (store, coords) => {
  const selections = coords.map(([armor, part, index]) =>
    makeSelection({
      armorIndex: armor,
      partIndex: part,
      segment: segmentsOf(store, armor, part)[index],
    }),
  );

  store.dispatch({
    type: "UPDATE_MULTI_SELECTED_BLOCKS",
    payload: selections,
  });
  return selections;
};

export { DURATION };
