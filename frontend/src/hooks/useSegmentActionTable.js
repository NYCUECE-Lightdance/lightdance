import { useCallback, useMemo } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import { updateActionTable } from "../redux/actions.js";

/**
 * segment 原生的光表存取 —— **全專案唯一的光表讀寫入口**。
 *
 * Phase 4 到 5f 之間還有一個 `useKeyframeActionTable` 轉接橋，讓還在用
 * keyframe 思考的舊程式碼能繼續運作；每次讀寫都要在兩種形狀之間來回轉一趟，
 * 而來回轉換會讓 segment 的 id 漂移。5g 把最後兩個使用者改完之後那個檔案
 * 已經刪除，現在讀寫都是 store 裡原本的東西，轉換成本歸零。
 *
 * 三種粒度，選最小的那個：
 *
 * | hook | 訂閱範圍 | 用在 |
 * |---|---|---|
 * | `useSegmentPartTimeline` | 一個部位 | Timeline |
 * | `useSegmentArmorTimelines` | 一位舞者的所有部位 | Armor（光衣 + 道具） |
 * | `useSegmentActionTable` | 整張表 | 跨部位的操作（複製貼上、平移） |
 *
 * 粒度不是潔癖：訂閱整張表的元件，任何地方的一次編輯都會讓它重算。實測
 * （見 `docs/frontend-rendering-optimization.md`）逐部位訂閱後，一次編輯
 * 只需重算 1/154 條時間軸。
 */

/** 穩定的空陣列，避免 selector 每次回傳新的 `[]` 造成無謂重繪 */
const EMPTY = Object.freeze([]);

/**
 * 這次寫入會不會讓光表少掉舞者？會的話一律擋下來。
 *
 * 光表的形狀由 `PLAYER_COUNT` 固定，**沒有任何合法的編輯會讓舞者變少**，
 * 所以縮小一定是 bug。而且是最貴的那種 bug：整場表演靜默消失，使用者要按到
 * 下一次 Output 才發現。
 *
 * 會走到這裡的路徑是這樣的：光表還沒載入時 `useSegmentActionTable` 給的是
 * 空陣列（否則呼叫端的 `.map` 會炸），呼叫端拿它當基準算完再整張寫回去，
 * 於是把 store 裡真正的表覆蓋成空的。四個 `commit` 呼叫端都是同一個模式，
 * 擋在這個單一出口比要求每個呼叫端各自防守可靠。
 *
 * 只擋縮小、不擋等長 —— 判斷條件要能明確說出「什麼情況一定是錯的」，
 * 否則就會變成另一種需要維護的猜測。
 */
const wouldShrinkTable = (nextTable, current) => {
  if (!Array.isArray(current) || current.length === 0) return false;
  if (Array.isArray(nextTable) && nextTable.length >= current.length) {
    return false;
  }

  console.error(
    "[useSegmentActionTable] 擋下會讓光表縮小的寫入：",
    `${current.length} 位舞者 → ${Array.isArray(nextTable) ? nextTable.length : typeof nextTable}`,
  );
  return true;
};

/**
 * 把單一部位的新 segments 併回整張表，其餘部位維持原 reference。
 *
 * 結構共享是 memo 與逐部位訂閱能生效的前提：只有真的被改動的那條
 * 時間軸換掉 reference，其他 153 條的訂閱者完全不會被喚醒。
 */
const replacePart = (table, armorIndex, partIndex, nextSegments) =>
  table.map((armor, a) =>
    a === armorIndex
      ? armor.map((segments, p) => (p === partIndex ? nextSegments : segments))
      : armor,
  );

/**
 * 一個部位的 segments，以及只寫回這個部位的 commit。
 *
 * `commitPart` 從 store 現讀整張表而不是用 render 時捕捉到的版本——呼叫端
 * 常在拖曳結束或非同步流程之後才 commit，捕捉到的表可能已經過期。
 */
export function useSegmentPartTimeline(armorIndex, partIndex) {
  const dispatch = useDispatch();
  // 從 Provider 拿 store，不要 import 模組層 singleton（測試會是另一個 instance）
  const store = useStore();
  const segments = useSelector(
    (state) => state.profiles.data?.actionTable?.[armorIndex]?.[partIndex],
  );

  const commitPart = useCallback(
    (nextSegments, meta) => {
      const state = store.getState().profiles;
      const current = state.data.actionTable?.[armorIndex]?.[partIndex];
      if (nextSegments === current) return; // 什麼都沒改，不佔一格 undo

      dispatch(
        updateActionTable(
          replacePart(
            state.data.actionTable,
            armorIndex,
            partIndex,
            nextSegments,
          ),
          meta,
        ),
      );
    },
    [dispatch, store, armorIndex, partIndex],
  );

  return { segments: segments ?? EMPTY, commitPart };
}

/**
 * 一位舞者所有部位的 segments。
 *
 * Armor 要同時顯示整套光衣與手上的道具，所以粒度是「舞者」而非「部位」。
 */
export function useSegmentArmorTimelines(armorIndex) {
  const dispatch = useDispatch();
  const store = useStore();
  const armorSegments = useSelector(
    (state) => state.profiles.data?.actionTable?.[armorIndex],
  );

  const commitPart = useCallback(
    (partIndex, nextSegments, meta) => {
      const state = store.getState().profiles;
      const current = state.data.actionTable?.[armorIndex]?.[partIndex];
      if (nextSegments === current) return;

      dispatch(
        updateActionTable(
          replacePart(
            state.data.actionTable,
            armorIndex,
            partIndex,
            nextSegments,
          ),
          meta,
        ),
      );
    },
    [dispatch, store, armorIndex],
  );

  return { armorSegments: armorSegments ?? EMPTY, commitPart };
}

/**
 * 整張表的**讀寫**，但**不訂閱** —— 給 154 條 Timeline 的拖曳路徑用。
 *
 * 跨軌拖曳要動到別條軌的資料，可是 Timeline 不能訂閱整張表：那等於每一次
 * 編輯都喚醒全部 154 個實例，而逐部位訂閱正是為了避免這件事
 * （見 `docs/frontend-rendering-optimization.md`）。
 *
 * 拖曳需要的是「按下去的那一刻表長什麼樣」與「放開時寫回去」，兩者都是
 * **事件發生當下**才需要，不需要 render 時就持有。所以這裡只拿 `store`
 * 與 `dispatch`，一個 `useSelector` 都沒有。
 *
 * ⚠️ 讀取一律用 `readTable()` 現讀，不要把它的結果存進 ref 留到之後用：
 * 拖曳中間可能有別的東西改了表（undo、播放清單、另一條軌的編輯）。
 */
export function useTableCommit() {
  const dispatch = useDispatch();
  const store = useStore();

  const readTable = useCallback(
    () => store.getState().profiles.data?.actionTable ?? EMPTY,
    [store],
  );

  const commitTable = useCallback(
    (nextTable, meta) => {
      const current = store.getState().profiles.data.actionTable;
      if (nextTable === current) return;
      if (wouldShrinkTable(nextTable, current)) return;
      dispatch(updateActionTable(nextTable, meta));
    },
    [dispatch, store],
  );

  return { readTable, commitTable };
}

/**
 * 整張 segment 表，以及寫回整張表的 commit。
 *
 * 給真正需要跨部位的操作用（複製貼上、區間平移）。單一部位的編輯請用
 * `useSegmentPartTimeline`，否則會被整張表的 reference 變動打到。
 */
export function useSegmentActionTable() {
  const dispatch = useDispatch();
  const store = useStore();
  const segmentTable = useSelector((state) => state.profiles.data?.actionTable);
  const duration = useSelector((state) => state.profiles.duration);

  const table = useMemo(() => segmentTable ?? EMPTY, [segmentTable]);

  const commit = useCallback(
    (nextTable, meta) => {
      const current = store.getState().profiles.data.actionTable;
      if (nextTable === current) return;
      if (wouldShrinkTable(nextTable, current)) return;
      dispatch(updateActionTable(nextTable, meta));
    },
    [dispatch, store],
  );

  /** 只改一個部位時的捷徑，維持其餘部位的 reference */
  const commitPart = useCallback(
    (armorIndex, partIndex, nextSegments, meta) => {
      const state = store.getState().profiles;
      const current = state.data.actionTable?.[armorIndex]?.[partIndex];
      if (nextSegments === current) return;

      dispatch(
        updateActionTable(
          replacePart(
            state.data.actionTable,
            armorIndex,
            partIndex,
            nextSegments,
          ),
          meta,
        ),
      );
    },
    [dispatch, store],
  );

  return { segmentTable: table, duration, commit, commitPart };
}

export default useSegmentActionTable;
