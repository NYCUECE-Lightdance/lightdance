import React, { useRef, useState, useEffect, forwardRef, memo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  updateActionTable,
  updateTimelineBlocks,
  updateIsColorChangeActive,
  updateMultiSelectedBlocks,
  updateCurrentTime,
} from "../../redux/actions";

import { produce } from "immer";
// cloneDeep 已移除：tempActionTable cascade 已合併，drag 復原時再加回
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";

const colorDistance = (color1, color2) => {
  return Math.sqrt(
    Math.pow((color1.R || 0) - (color2.R || 0), 2) +
    Math.pow((color1.G || 0) - (color2.G || 0), 2) +
    Math.pow((color1.B || 0) - (color2.B || 0), 2)
  );
};

// 相鄰兩個有色 block 之間必須保留的最小間隔（ms）。
//
// 這裡只要求「不相接」而不是整整一格 50ms。原因是 block 的起點會被對齊到 50ms 格線，
// 對於本來就對齊良好的資料，floor((rightBound - blockDur - 1) / 50) * 50 算出來的
// 結果跟要求 50ms 是一模一樣的，行為不變；
// 但如果資料本來就排得比 50ms 更密（例如兩個 block 只隔 10ms），硬性要求 50ms 會讓
// block 一開始就站在「違規」位置——往左移一格之後規則就把它鎖死，再也移不回原位。
const MIN_BLOCK_GAP_MS = 1;

// actionTable 的 entry 是否為「熄燈」：黑色代表這段沒有 block
const isBlackEntry = (e) =>
  e?.color?.R === 0 && e?.color?.G === 0 && e?.color?.B === 0;

/**
 * 算出某個 block 的起點在不撞到左右鄰居的前提下，可以落在哪個時間區間。
 * 拖曳預覽的像素上下限與放開滑鼠時的提交都呼叫這裡，兩邊才不會算出不同答案。
 *
 * @returns {{blockDur:number, minStart:number, maxStart:number}}
 */
function getMoveBounds(partData, atIdx, durationMs) {
  const blockStart = partData[atIdx].time;
  const blockDur = (partData[atIdx + 1]?.time ?? durationMs) - blockStart;

  // 左邊界：往前跳過連續的黑色 entry，取前一個有色 block 的尾端。
  // 跳過黑色是為了讓 block 能移進「前一個 block 被刪掉後留下的空洞」。
  let leftBound = 0;
  for (let j = atIdx - 1; j >= 0; j--) {
    if (!isBlackEntry(partData[j])) { leftBound = partData[j + 1]?.time ?? 0; break; }
  }
  // 右邊界：往後跳過連續的黑色 entry，取下一個有色 block 的起點。
  // 從 atIdx + 1 開始掃描而不是 atIdx + 2：partData[atIdx + 1] 通常是分隔用的黑色
  // entry（會被跳過），但它也可能本身就是有色的——那代表下一個 block 緊接在後面。
  // 舊版從 atIdx + 2 起算會直接漏掉這個緊鄰的 block，於是可以一路拖過去蓋掉它，
  // 讓 partData 的 time 失序。
  let rightBound = durationMs;
  for (let j = atIdx + 1; j < partData.length; j++) {
    if (!isBlackEntry(partData[j])) { rightBound = partData[j].time; break; }
  }

  // 想保留的間隔；左右空間不足時自動縮小，不足以留間隔時就變成 0
  const slack = rightBound - leftBound - blockDur;
  const gap = Math.max(0, Math.min(MIN_BLOCK_GAP_MS, Math.floor(slack / 2)));

  // 對齊 50ms，避免非對齊的邊界時間污染有色區塊
  let minStart = Math.ceil((leftBound + gap) / 50) * 50;
  let maxStart = Math.floor((rightBound - blockDur - gap) / 50) * 50;

  // 關鍵不變式：block「目前的位置」一定要落在合法區間內。
  // 舊版固定用 leftBound + 50 當下限，於是：
  //   1. 兩個 block 本來就緊貼時，下限會大於目前位置，往左拖反而往右跳 50ms；
  //   2. 左右空間不足時下限甚至大於上限，夾緊後把 block 推過 rightBound，
  //      使 actionTable 的 time 失序（下游的 binary search 全都假設已排序）。
  // 把目前位置併入區間後，夾緊就只能「限制移動範圍」，不可能反過來推動 block。
  minStart = Math.min(minStart, blockStart);
  maxStart = Math.max(maxStart, blockStart);

  return { blockDur, minStart, maxStart };
}

/** 把目標起始時間對齊 50ms 並夾進 getMoveBounds 算出的合法區間 */
function clampStartToBounds(targetMs, bounds) {
  const aligned = Math.round(targetMs / 50) * 50;
  return Math.min(bounds.maxStart, Math.max(bounds.minStart, aligned));
}

/**
 * 算出拖曳 block 某一邊時，那個邊界可以落在哪個時間區間。
 *
 * 與 getMoveBounds 相同的不變式：邊界「目前的位置」一定落在範圍內。
 * 少了這個不變式，資料只要排得比規則還密（例如手畫出來的 40ms block、
 * 或兩個 block 只隔 10ms），下限就會大於上限，夾緊時 Math.max 勝出，
 * 邊界會被硬推到相鄰 block 的起點上，兩個 block 就黏在一起了。
 *
 * @param edge 'right' 時回傳的是 block 結束時間的範圍，'left' 時是起始時間的範圍
 */
function getResizeBounds(partData, atIdx, edge, durationMs) {
  const blockStart = partData[atIdx].time;
  const blockEnd = partData[atIdx + 1]?.time ?? durationMs;
  // 已經比最小長度還短的 block 不該因為規則而被強迫變長
  const minDur = Math.min(STRETCH_MIN_MS, blockEnd - blockStart);

  if (edge === "right") {
    // 從 atIdx + 1 起算：那個位置通常是分隔用的黑色 entry（會被跳過），
    // 但它也可能本身就是有色的，代表下一個 block 緊接在後面
    let rightBound = durationMs;
    let hasNeighbor = false;
    for (let j = atIdx + 1; j < partData.length; j++) {
      if (!isBlackEntry(partData[j])) { rightBound = partData[j].time; hasNeighbor = true; break; }
    }
    // 沒有右鄰 block 時可以一路延伸到歌曲末端，不需要留間隔
    const sep = hasNeighbor ? Math.max(0, Math.min(MIN_BLOCK_GAP_MS, rightBound - blockEnd)) : 0;
    return {
      min: Math.min(blockStart + minDur, blockEnd),
      max: Math.max(rightBound - sep, blockEnd),
      neighborTime: rightBound,
    };
  }

  let leftBound = 0;
  let hasNeighbor = false;
  for (let j = atIdx - 1; j >= 0; j--) {
    if (!isBlackEntry(partData[j])) { leftBound = partData[j + 1]?.time ?? 0; hasNeighbor = true; break; }
  }
  const sep = hasNeighbor ? Math.max(0, Math.min(MIN_BLOCK_GAP_MS, blockStart - leftBound)) : 0;
  return {
    min: Math.min(leftBound + sep, blockStart),
    max: Math.max(blockEnd - minDur, blockStart),
    neighborTime: leftBound,
  };
}

/**
 * 把 resize 後的邊界時間夾進合法範圍，並盡量對齊 50ms 格線。
 * 若合法範圍比一格 50ms 還窄（資料本來就排得比 50ms 密），就退回未對齊的夾緊值——
 * 這種時候硬要對齊只會讓邊界跳到相鄰 block 上，反而把兩個 block 黏在一起。
 */
function snapEdgeWithin(targetMs, minMs, maxMs) {
  const lo = Math.ceil(minMs / 50) * 50;
  const hi = Math.floor(maxMs / 50) * 50;
  if (hi >= lo) return Math.min(hi, Math.max(lo, Math.round(targetMs / 50) * 50));
  return Math.min(maxMs, Math.max(minMs, targetMs));
}
// Timeline 組件
const Timeline = forwardRef(
  ({ zoomValue, height, armorIndex, partIndex, hidden, isCopying }, timelineRef) => {
    const dispatch = useDispatch();

    // **狀態變數**

    // 方塊相關狀態
    // [Drag 已停用] 以下 state 供舊版 drag 功能使用，保留以備日後復原
    // const [hoveredBlock, setHoveredBlock] = useState({
    //   leftedge: false,  // 是否在左邊緣
    //   rightedge: false, // 是否在右邊緣
    //   leftindex: null,  // 左邊緣的方塊索引
    //   rightindex: null, // 右邊緣的方塊索引
    // });
    // const [dragging, setDragging] = useState(false);         // 是否正在拖動方塊
    // const [draggedBlockIndex, setDraggedBlockIndex] = useState(null); // 被拖動的方塊索引
    // const [dragStartpoint, setDragStartpoint] = useState(null);       // 拖動的起始點

    // 畫布相關狀態
    const canvasRef = useRef(null); // timeline 的畫布引用
    const [canvasWidth, setCanvasWidth] = useState(1600); // 預設畫布寬度
    const [canvasHeight, setCanvasHeight] = useState(100); // 固定畫布高度

    // Redux 狀態
    const timelineBlocks = useSelector(
      (state) => state.profiles.timelineBlocks?.[armorIndex]?.[partIndex] || [] // 當前時間軸的方塊數據
    );
    const actionTable = useSelector((state) => state.profiles.data?.actionTable || []); // 原始動作表
    const duration = useSelector((state) => state.profiles.duration); // 總時長
    const multiSelectedBlocks = useSelector((state) => state.profiles.multiSelectedBlocks); // 全局多選中方塊
    const clipboard = useSelector((state) => state.profiles.clipboard);
    const blackthreshold = 10;
    const STRETCH_MIN_MS  = 50; // Stretch Mode：block 可縮到的最小持續時間（ms）

    // Move Mode 相關 ref（零延遲拖曳，不觸發 React 重繪）
    const moveMode = useSelector((state) => state.profiles.moveMode);
    const moveDragStartRef = useRef(null);   // 拖曳起始 clientX
    const moveDraggedIdxRef = useRef(null);  // 被拖曳的 block index
    const moveDraggedDomRef = useRef(null);  // 被拖曳的 DOM 元素
    const minDragPxRef = useRef(0);          // 最小可拖曳像素（向左）
    const maxDragPxRef = useRef(0);          // 最大可拖曳像素（向右）
    const moveDragPixelsRef = useRef(0);     // 目前拖曳偏移像素
    const blockDomRefs = useRef({});         // index → DOM element
    // 用 ref 保持最新值供 useEffect 閉包使用
    const actionTableRef = useRef(actionTable);
    const durationRef = useRef(duration);
    useEffect(() => { actionTableRef.current = actionTable; }, [actionTable]);
    useEffect(() => { durationRef.current = duration; }, [duration]);

    // Resize 相關 ref（零延遲邊緣拖曳，不觸發 React 重繪）
    const [hoverEdge, setHoverEdge] = useState(null); // { index, edge: 'left'|'right' } | null
    const resizeEdgeRef = useRef(null);        // 'left' | 'right'（正在 resize 的邊）
    const resizeDragStartRef = useRef(null);   // 拖曳起始 clientX
    const resizedAtIdxRef = useRef(null);      // 被 resize 的 actionTable index
    const resizedDomRef = useRef(null);        // 被 resize 的 DOM 元素
    const resizeOrigPctRef = useRef(0);        // 原始寬度（% of timeline width）
    const minResizePxRef = useRef(0);          // 拖曳最小值（px，負數為向左）
    const maxResizePxRef = useRef(0);          // 拖曳最大值（px，正數為向右）
    const resizeDragPixelsRef = useRef(0);     // 目前拖曳偏移量（px）
    const resizeRightBoundRef = useRef(0);     // 右邊界時間（ms）：下一個有色 block 起點
    const resizeLeftBoundRef = useRef(0);      // 左邊界時間（ms）：上一個有色 block 終點
    const resizeBlockStartRef = useRef(0);     // 被 resize block 的起始時間（ms）
    const resizeBlockEndRef = useRef(0);       // 被 resize block 的結束時間（ms）
    const resizeTrackWidthRef = useRef(0);     // resize 起始時的軌道寬度（px）

    // Move Mode：按住有色 block 拖曳，放開滑鼠落定（與邊緣 resize 的操作方式一致）。
    //
    // 舊版是「點一下拿起 → 移動滑鼠（不用按住）→ 再點一下放下並自動退出 move mode」，
    // 於是放開滑鼠後方塊仍黏在游標上一路跟著跑，而想抓回來的那一下反而是「落定 + 關閉
    // move mode」，使用者就再也拖不回去了。這裡改成標準的 mousedown/mousemove/mouseup，
    // 並且只由 M 鍵或工具列按鈕切換 move mode。
    const moveTrackWidthRef = useRef(0);   // 拖曳起始時的軌道寬度（px）
    const movePrevStyleRef = useRef(null); // 拖曳前的行內樣式，落定後原樣還原
    const moveDetachRef = useRef(null);    // 卸載全域監聽用（拖曳中被 unmount 時的保險）

    /**
     * 提交目前的拖曳位移並清除拖曳狀態。
     * 「放開滑鼠」與「拖曳到一半直接按 M 退出」兩條路徑共用同一份邏輯，
     * 舊版是兩段幾乎一樣的程式碼各自維護，改一邊漏一邊就會行為不一致。
     */
    const commitMoveDrag = () => {
      const atIdx = moveDraggedIdxRef.current;
      const dragPx = moveDragPixelsRef.current;
      const domEl = moveDraggedDomRef.current;
      const trackWidth = moveTrackWidthRef.current;
      const prevStyle = movePrevStyleRef.current;

      // 還原拖曳期間直接寫在 DOM 上的樣式。
      // 必須還原成「拖曳前的值」而不是清成空字串：zIndex 是 React 從 blockStyle 設進來的，
      // 清空後 React 的 style diff 會認為值沒變而不再補回去。
      const restoreStyle = () => {
        if (!domEl) return;
        domEl.style.transform = prevStyle?.transform ?? '';
        domEl.style.zIndex = prevStyle?.zIndex ?? '';
        domEl.style.overflow = prevStyle?.overflow ?? '';
      };

      moveDragStartRef.current = null;
      moveDraggedIdxRef.current = null;
      moveDraggedDomRef.current = null;
      moveDragPixelsRef.current = 0;
      movePrevStyleRef.current = null;

      const durationMs = durationRef.current;
      const curActionTable = actionTableRef.current;
      const partData = curActionTable?.[armorIndex]?.[partIndex];

      if (atIdx === null || dragPx === 0 || !trackWidth || !durationMs || !partData?.[atIdx]) {
        restoreStyle();
        return;
      }

      const dt = Math.round(((dragPx * durationMs) / trackWidth) / 50) * 50;
      if (dt === 0) {
        restoreStyle();
        return;
      }
      const bounds = getMoveBounds(partData, atIdx, durationMs);
      const originalStart = partData[atIdx].time;

      const newStart = clampStartToBounds(originalStart + dt, bounds);
      if (newStart === originalStart) {
        restoreStyle();
        return;
      }

      const updatedTable = produce(curActionTable, (draft) => {
        const pd = draft[armorIndex][partIndex];
        let i = atIdx;
        if (pd[i] === undefined) return;

        pd[i].time = newStart;
        if (pd[i + 1] !== undefined) pd[i + 1].time = newStart + bounds.blockDur;

        // 清除因位移而排序違反的孤立黑色 entries
        if (newStart > originalStart) {
          while (pd[i + 2] !== undefined && pd[i + 2].time <= pd[i + 1].time && isBlackEntry(pd[i + 2])) {
            pd.splice(i + 2, 1);
          }
        } else {
          while (i > 0 && pd[i - 1] !== undefined && pd[i - 1].time >= pd[i].time && isBlackEntry(pd[i - 1])) {
            pd.splice(i - 1, 1);
            i--;
          }
        }
      });

      // 先還原樣式再 dispatch：兩者在同一個事件處理中完成，React 18 會批次更新，
      // 瀏覽器只會畫一次，不會出現方塊先彈回原位再跳到新位置的閃爍。
      restoreStyle();
      dispatch(updateActionTable(updatedTable));
    };

    /**
     * 開始拖曳一個有色 block：記錄起點與可移動範圍，並掛上全域 mousemove / mouseup。
     * 只有正在被拖的那一條 timeline 會掛監聽，放開後立刻卸載
     *（舊版是 move mode 一開啟，每一條 timeline 都各掛一組全域監聽）。
     */
    const startBlockMove = (e, atIdx, domEl) => {
      const partData = actionTable?.[armorIndex]?.[partIndex];
      if (!partData?.[atIdx] || !domEl || !duration) return;

      // 方塊是排在 .timeline 這一列的 content box 內，而 timelineRef 指向外層的
      // .timeline-container。後者含 1px 邊框（box-sizing: border-box），兩者相差約 0.17%，
      // 直接拿 timelineRef 換算會讓拖曳預覽和實際寫入的時間對不上，所以取父層的 clientWidth。
      const trackWidth = domEl.parentElement?.clientWidth ?? timelineRef?.current?.clientWidth ?? 0;
      if (!trackWidth) return;

      // 預覽的像素上下限與 commit 共用同一組 bounds，兩邊才不會算出不同答案。
      // bounds 保證包含 block 目前的位置，所以上下限必定一邊 <= 0、一邊 >= 0。
      const bounds = getMoveBounds(partData, atIdx, duration);
      const pixelsPerMs = trackWidth / duration;
      const blockStartTime = partData[atIdx].time;
      minDragPxRef.current = (bounds.minStart - blockStartTime) * pixelsPerMs;
      maxDragPxRef.current = (bounds.maxStart - blockStartTime) * pixelsPerMs;

      moveDragStartRef.current = e.clientX;
      moveDraggedIdxRef.current = atIdx;
      moveDraggedDomRef.current = domEl;
      moveDragPixelsRef.current = 0;
      moveTrackWidthRef.current = trackWidth;
      movePrevStyleRef.current = {
        transform: domEl.style.transform,
        zIndex: domEl.style.zIndex,
        overflow: domEl.style.overflow,
      };

      // 拖曳時提高 z-index，確保移動中的 block 顯示在所有相鄰 block 上方
      domEl.style.zIndex = '100';
      domEl.style.overflow = 'visible';

      // 拖曳期間只碰 DOM，不進 React，避免每次滑鼠移動都重繪整條 timeline
      const handleMoveMouseMove = (ev) => {
        if (moveDragStartRef.current === null || !moveDraggedDomRef.current) return;
        const rawDelta = ev.clientX - moveDragStartRef.current;
        const clamped = Math.max(minDragPxRef.current, Math.min(maxDragPxRef.current, rawDelta));
        moveDragPixelsRef.current = clamped;
        moveDraggedDomRef.current.style.transform = `translateX(${clamped}px)`;
      };

      const detach = () => {
        document.removeEventListener('mousemove', handleMoveMouseMove);
        document.removeEventListener('mouseup', handleMoveMouseUp);
        moveDetachRef.current = null;
      };

      function handleMoveMouseUp() {
        commitMoveDrag();
        detach();
      }

      document.addEventListener('mousemove', handleMoveMouseMove);
      document.addEventListener('mouseup', handleMoveMouseUp);
      moveDetachRef.current = detach;
    };

    // 拖曳到一半直接按 M（或按工具列按鈕）退出 move mode 時，先把目前位置提交掉
    useEffect(() => {
      if (moveMode || moveDraggedIdxRef.current === null) return;
      commitMoveDrag();
    }, [moveMode]);

    // 拖曳中若這條 timeline 被移除（例如改了顯示的部位），確保全域監聽被卸載
    useEffect(() => () => { moveDetachRef.current?.(); }, []);

    // 左、右箭頭的樣式
    const leftarrowStyle = {
      position: "absolute",
      top: "50%",
      left: "2px",
      transform: "translateY(-40%) scaleX(-1)",
      fontSize: "22px",
      color: "white",
      pointerEvents: "none", // 禁用滑鼠事件
    };

    const rightarrowStyle = {
      position: "absolute",
      top: "50%",
      right: "2px",
      transform: "translateY(-50%)",
      fontSize: "22px",
      color: "white",
      pointerEvents: "none", // 禁用滑鼠事件
    };

    // 偵測點擊事件，點擊非 timeline-block 區域時取消選中
    useEffect(() => {
      const handleOutsideClick = (e) => {
        // 檢查是否為鼠標事件
        if (e.type !== "click") {
          console.warn(
            "handleOutsideClick should only be used for click events"
          );
          return;
        }
        // 检查点击是否发生在 .timeline-block 或 .palette-color-picker 区域内
        if (
          !e.target.closest(".timeline-block") &&
          !e.target.closest(".palette-color-picker") &&
          !e.target.closest(".color-button") &&
          !e.target.closest(".delete-button") &&
          !e.target.closest(".timeline-controls") &&
          !e.target.closest(".waveform-container") &&
          !e.target.closest(".brightness-control") &&
          !e.target.closest(".cut-button") &&
          !e.target.closest(".effect-wrapper") &&
          !e.target.closest(".uniform-alpha-wrapper")
        ) {
          console.log("click outside");
          dispatch(updateMultiSelectedBlocks([])); // 清除多選
          dispatch(updateIsColorChangeActive(false)); // 更新 Redux
        }
      };

      document.addEventListener("click", handleOutsideClick);
      return () => {
        document.removeEventListener("click", handleOutsideClick);
      };
    }, []);

    // 當 zoomValue 或 timelineRef 改變時更新畫布尺寸
    useEffect(() => {
      if (timelineRef?.current) {
        const timelineWidth = timelineRef.current.clientWidth;
        const timelineHeight = timelineRef.current.clientHeight || 200; // 預設高度 200
        setCanvasWidth(timelineWidth * zoomValue); // 設定畫布寬度
        setCanvasHeight(timelineHeight); // 設定畫布高度
      } else {
        setCanvasWidth(1600);
        setCanvasHeight(100);
      }
    }, [timelineRef, zoomValue]);

    // 當畫布寬度改變時更新 canvas 的寬度
    useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = canvasWidth; // 設定 canvas 寬度
      }
    }, [canvasWidth]);

    // 根據 tempActionTable 和 duration 計算新的方塊數據
    // P3: 直接從 actionTable 計算 timelineBlocks，不再經過 tempActionTable 中轉
    useEffect(() => {
      const partTimeline = actionTable?.[armorIndex]?.[partIndex];

      if (!Array.isArray(partTimeline)) {
        dispatch(
          updateTimelineBlocks({
            armorIndex,
            partIndex,
            value: [],
          })
        );
        return;
      }

      // 過濾掉 time 超過 duration 的 entry，避免產生負的 durationTime，
      // 導致 flex 佈局將所有區塊等比例壓縮，造成與紅線的視覺偏移
      const validTimeline = partTimeline.filter(
        (entry) => entry && typeof entry.time === "number" && entry.time < duration
      );

      const newBlocks = [];

      validTimeline.forEach((entry, index) => {
        if (!entry || typeof entry.time !== "number") return;

        const startTime = entry.time;
        const nextStartTime = validTimeline[index + 1]?.time ?? duration;

        const { R = 0, G = 0, B = 0, A = 1 } = entry.color || {};

        const newBlock = {
          startTime,
          durationTime: Math.max(0, nextStartTime - startTime),
          color: { R, G, B, A },
        };

        const lastBlock = newBlocks[newBlocks.length - 1];

        if (
          lastBlock &&
          lastBlock.startTime + lastBlock.durationTime === newBlock.startTime &&
          lastBlock.color.R === newBlock.color.R &&
          lastBlock.color.G === newBlock.color.G &&
          lastBlock.color.B === newBlock.color.B &&
          lastBlock.color.A === newBlock.color.A
        ) {
          lastBlock.durationTime += newBlock.durationTime;
        } else {
          newBlocks.push(newBlock);
        }
      });

      dispatch(
        updateTimelineBlocks({
          armorIndex,
          partIndex,
          value: newBlocks,
        })
      );
    }, [actionTable, duration, armorIndex, partIndex, dispatch]);

    // 處理鼠標按下事件
    const handleMouseDown = (e, index) => {
      // ⚠️ stopPropagation 不可在此提前呼叫：
      // Move Mode 時必須根據情況決定是否攔截，讓全域 mousedown 能夠觸發提交/退出。

      const block = timelineBlocks[index];
      const isBlackBlock = block.color.R === 0 && block.color.G === 0 && block.color.B === 0;

      // Move Mode 邏輯：
      // - 若已在追蹤中 或 點到黑塊：不攔截 → 全域 mousedown 提交/退出
      // - 若尚未追蹤且點到有色 block：stopPropagation 開始追蹤（本次點擊是「選取」，不是「提交」）
      // Move Mode：在有色 block 上按下即開始拖曳，放開滑鼠落定。
      // move mode 本身不會因為落定而關閉，要用 M 鍵或工具列按鈕才切換。
      if (moveMode) {
        if (isBlackBlock) return; // 黑塊沒有東西可以拖

        e.stopPropagation();
        e.preventDefault();

        // Bug fix：timelineBlocks index ≠ actionTable index（刪除後相鄰黑塊合併導致偏移）
        // 用 block.startTime 反查 actionTable 真正的 index
        // 必須排除 black entry：當 black entry 與 colored entry 同時間（緊鄰 block），findIndex 若只比對時間會取到錯誤 index
        const partData = actionTable[armorIndex][partIndex];
        const atIdx = partData.findIndex(entry => entry.time === block.startTime && !isBlackEntry(entry));
        if (atIdx === -1) return;

        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: atIdx }]));
        startBlockMove(e, atIdx, e.currentTarget);
        return;
      }

      // 非 Move Mode：維持原本行為，攔截事件
      e.stopPropagation();

      // 邊緣 resize 邏輯：已選中的有色 block 在邊緣按下時啟動 resize，不進入普通選取流程
      {
        // 查找 actionTable index 用於比較選中狀態
        const partDataForResize = actionTable[armorIndex][partIndex];
        const atIdxForResize = partDataForResize.findIndex(entry => entry.time === block.startTime && !isBlackEntry(entry));
        const isSelected = atIdxForResize !== -1 && multiSelectedBlocks.some(b =>
          b.armorIndex === armorIndex && b.partIndex === partIndex && b.blockIndex === atIdxForResize
        );
        if (isSelected && !isBlackBlock && hoverEdge?.index === index) {
          e.preventDefault();
          startBlockResize(e, index, hoverEdge.edge);
          return;
        }
      }

      if (isCopying) {
        const partDataForCopy = actionTable[armorIndex][partIndex];

        if (isBlackBlock) {
          // 貼到空白處：以「點擊的位置」當作貼上錨點，而不是整段空白的起點。
          // 舊版點黑色區域完全沒反應，導致目的地沒有既有 block 時根本無法貼上。
          const r = e.currentTarget.getBoundingClientRect();
          const fraction = r.width > 0 ? (e.clientX - r.left) / r.width : 0;
          const rawTime = block.startTime + fraction * block.durationTime;
          const pasteTime = Math.max(0, Math.min(duration, Math.round(rawTime / 50) * 50));
          const atIdxForGap = partDataForCopy.findIndex(entry => entry.time === block.startTime && isBlackEntry(entry));
          dispatch(updateMultiSelectedBlocks([
            { armorIndex, partIndex, blockIndex: atIdxForGap, pasteTime },
          ]));
          return;
        }

        // 點在既有 block 上：維持原本行為，對齊到該 block 的起點
        const atIdxForCopy = partDataForCopy.findIndex(entry => entry.time === block.startTime && !isBlackEntry(entry));
        if (atIdxForCopy !== -1) {
          dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: atIdxForCopy }]));
        }
        return;
      }
      // If a black block is clicked, clear all selections.
      if (block.color.R === 0 && block.color.G === 0 && block.color.B === 0) {
        dispatch(updateMultiSelectedBlocks([]));
        return;
      }

      // timelineBlocks index ≠ actionTable index
      const partData = actionTable[armorIndex][partIndex];
      const atIdx = partData.findIndex(entry => entry.time === block.startTime && !isBlackEntry(entry));
      if (atIdx === -1) return;

      // 點擊區塊時同步更新 currentTime，確保後續操作（如 Cut）能正確定位
      // 使用區塊自身的 bounding rect 計算區塊內點擊位置對應的時間，
      // 避免依賴 timeline 容器寬度（flex 百分比寬度像素捨入會累積誤差）
      // const blockRect = e.currentTarget?.getBoundingClientRect();
      // if (blockRect && blockRect.width > 0) {
      //   const clickFraction = (e.clientX - blockRect.left) / blockRect.width;
      //   const rawTime = block.startTime + clickFraction * block.durationTime;
      //   const clickTime = Math.round(rawTime / 50) * 50;
      //   dispatch(updateCurrentTime(Math.max(0, Math.min(clickTime, duration))));
      // }

      // Shift-click multi-selection logic
      const anchorBlock = multiSelectedBlocks[0];
      if (e.shiftKey && anchorBlock && anchorBlock.armorIndex === armorIndex && anchorBlock.partIndex === partIndex) {
        const startIdx = anchorBlock.blockIndex;
        const endIdx = atIdx;

        const selectionStart = Math.min(startIdx, endIdx);
        const selectionEnd = Math.max(startIdx, endIdx);

        const newMultiSelected = [];
        for (let i = selectionStart; i <= selectionEnd; i++) {
          const entry = partData[i];
          if (entry && !isBlackEntry(entry)) {
            newMultiSelected.push({ armorIndex, partIndex, blockIndex: i });
          }
        }
        dispatch(updateMultiSelectedBlocks(newMultiSelected));

      } else {
        // Single-select logic
        // [Drag 已停用] 啟用 drag 時需恢復以下三行，並同步恢復 state 宣告、handleMouseMove、handleMouseUp
        // setDragging(true);
        // setDraggedBlockIndex(index);
        // setDragStartpoint(e.clientX);
        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: atIdx }]));
      }
    };


    // [Drag 已停用] handleMouseUp：drag 提交用，啟用 drag 時需一併恢復 onMouseUp={handleMouseUp} 在 timeline div
    // const handleMouseUp = () => {
    //   // Move Mode 的 commit 用 mousedown 完成，mouseup 不應干預（否則會覆蓋剛提交的位置）
    //   if (dragging && !moveMode) {
    //     setDragging(false);
    //     setDraggedBlockIndex(null);
    //     dispatch(updateActionTable(tempActionTable));
    //   }
    // };
    // stretch mode
    // 開始邊緣 resize：掛載全域 mousemove/mouseup，透過 DOM 直接更新寬度（零延遲）
    // edge: 'left' | 'right'，tlIdx: timelineBlocks index
    const startBlockResize = (e, tlIdx, edge) => {
      const block = timelineBlocks[tlIdx];
      const partData = actionTable[armorIndex][partIndex];
      // 必須排除 black entry：當 black entry 與 colored entry 同時間（緊鄰 block），findIndex 若只比對時間會取到錯誤 index
      const atIdx = partData.findIndex(entry => entry.time === block.startTime && !isBlackEntry(entry));
      if (atIdx === -1) return;

      const blockStartTime = partData[atIdx].time;
      const blockEndTime   = partData[atIdx + 1]?.time ?? duration;

      const domEl = blockDomRefs.current[tlIdx];
      if (!domEl) return;

      // 與 move mode 同樣的理由：block 排在 .timeline 這一列的 content box 內，
      // 用外層含邊框的 .timeline-container 換算會有誤差
      const trackWidth = domEl.parentElement?.clientWidth ?? timelineRef?.current?.clientWidth ?? 0;
      if (!trackWidth || !duration) return;
      const pixelsPerMs = trackWidth / duration;
      resizeTrackWidthRef.current = trackWidth;

      // 右拖：同步縮小下一個 black block；左拖：同步縮小上一個 black block（避免 flex 重分配）
      const nextBlackDom     = edge === 'right' ? (blockDomRefs.current[tlIdx + 1] ?? null) : null;
      const nextBlackBlock   = edge === 'right' ? (timelineBlocks[tlIdx + 1] ?? null) : null;
      const nextBlackOrigPct = nextBlackBlock ? (nextBlackBlock.durationTime / duration) * 100 : 0;
      const prevBlackDom     = edge === 'left'  ? (blockDomRefs.current[tlIdx - 1] ?? null) : null;
      const prevBlackBlock   = edge === 'left'  ? (timelineBlocks[tlIdx - 1] ?? null) : null;
      const prevBlackOrigPct = prevBlackBlock ? (prevBlackBlock.durationTime / duration) * 100 : 0;

      resizeEdgeRef.current      = edge;
      resizeDragStartRef.current = e.clientX;
      resizedAtIdxRef.current    = atIdx;
      resizedDomRef.current      = domEl;
      resizeDragPixelsRef.current = 0;
      resizeOrigPctRef.current   = (block.durationTime / duration) * 100;
      domEl.style.zIndex = '100';

      resizeBlockStartRef.current = blockStartTime;
      resizeBlockEndRef.current   = blockEndTime;

      // 預覽的像素上下限與放開滑鼠時的提交共用同一份邊界計算，兩邊才不會算出不同答案。
      // bounds 保證包含邊界目前的位置，所以下限必定 <= 0、上限必定 >= 0，不會再出現
      // 夾緊區間反轉、把 block 硬推到跟鄰居黏在一起的情況。
      const rb = getResizeBounds(partData, atIdx, edge, duration);
      if (edge === 'right') {
        resizeRightBoundRef.current = rb.neighborTime;
        minResizePxRef.current = (rb.min - blockEndTime) * pixelsPerMs;
        maxResizePxRef.current = (rb.max - blockEndTime) * pixelsPerMs;
      } else {
        resizeLeftBoundRef.current = rb.neighborTime;
        minResizePxRef.current = (rb.min - blockStartTime) * pixelsPerMs;
        maxResizePxRef.current = (rb.max - blockStartTime) * pixelsPerMs;
      }

      const handleResizeMouseMove = (ev) => {
        const rawDelta = ev.clientX - resizeDragStartRef.current;
        const clamped  = Math.max(minResizePxRef.current, Math.min(maxResizePxRef.current, rawDelta));
        resizeDragPixelsRef.current = clamped;
        const origPct = resizeOrigPctRef.current;
        if (resizeEdgeRef.current === 'right') {
          // 右拖：擴大此 block 同時縮小緊鄰的下一個 black block，
          // 使 flex 總寬不變，避免後面的 block 跟著位移
          resizedDomRef.current.style.width = `calc(${origPct}% + ${clamped}px)`;
          if (nextBlackDom) {
            nextBlackDom.style.width = `calc(${nextBlackOrigPct}% - ${clamped}px)`;
          }
        } else {
          // 左拖：縮小上一個 black block 同時調整此 block 寬度（對稱於右拖邏輯）
          // prevBlack(+clamped) + colored(-clamped) = 常數，flex 總寬不變
          resizedDomRef.current.style.width = `calc(${origPct}% - ${clamped}px)`;
          if (prevBlackDom) {
            prevBlackDom.style.width = `calc(${prevBlackOrigPct}% + ${clamped}px)`;
          }
        }
      };

      const handleResizeMouseUp = () => {
        const dragPx    = resizeDragPixelsRef.current;
        const savedIdx  = resizedAtIdxRef.current;
        const savedEdge = resizeEdgeRef.current;

        // 將最終計算結果提升到 produce 外，供 DOM 直接更新使用
        let committedEnd   = null; // right edge 時設定
        let committedStart = null; // left  edge 時設定

        const trackWidth = resizeTrackWidthRef.current;
        if (savedIdx !== null && trackWidth > 0) {
          const dur = durationRef.current;
          const rawDeltaMs = (dragPx * dur) / trackWidth;

          const updatedTable = produce(actionTableRef.current, (draft) => {
            const pd = draft[armorIndex][partIndex];
            if (pd[savedIdx] === undefined) return;

            // commit 時從當前 pd 重新計算邊界，與拖曳預覽用的是同一個函式
            const b = getResizeBounds(pd, savedIdx, savedEdge, dur);

            if (savedEdge === 'right') {
              if (pd[savedIdx + 1] === undefined) return;

              committedEnd = snapEdgeWithin(resizeBlockEndRef.current + rawDeltaMs, b.min, b.max);
              pd[savedIdx + 1].time = committedEnd;

              // 修正孤立黑色 entry 的時間順序：若 savedIdx+2 之後有時間小於 committedEnd 的黑色 entry，
              // 將其夾緊到 committedEnd，避免負 durationTime 造成所有 block 位移錯誤
              for (let j = savedIdx + 2; j < pd.length; j++) {
                if (!isBlackEntry(pd[j])) break;
                if (pd[j].time < committedEnd) pd[j].time = committedEnd;
              }

            } else {
              committedStart = snapEdgeWithin(resizeBlockStartRef.current + rawDeltaMs, b.min, b.max);
              pd[savedIdx].time = committedStart;

              // 修正孤立黑色 entry 的時間順序：若 savedIdx-1 之前有時間大於 committedStart 的黑色 entry，
              // 將其夾緊到 committedStart，避免負 durationTime 造成所有 block 位移錯誤
              for (let j = savedIdx - 1; j >= 0; j--) {
                if (!isBlackEntry(pd[j])) break;
                if (pd[j].time > committedStart) pd[j].time = committedStart;
              }
            }
          });
          dispatch(updateActionTable(updatedTable));
        }

        // DOM 直接設為最終正確寬度，而非清空為 ''。
        // 原因：dispatch 後 timelineBlocks 需經兩步 effect 鏈才更新（actionTable → tempActionTable → timelineBlocks）。
        // 若先清空，React reconciler 在 timelineBlocks 尚未更新時因 virtual DOM width 前後相同而不更新真實 DOM，
        // 導致 block 以 width:'' 顯示（寬度 0，視覺消失）直到 timelineBlocks 終於更新為止。
        const dur = durationRef.current;

        if (resizedDomRef.current) {
          if (committedEnd !== null) {
            // 右邊拉伸：新寬度 = (newEnd - blockStart) / dur
            resizedDomRef.current.style.width = `${((committedEnd - resizeBlockStartRef.current) / dur) * 100}%`;
          } else if (committedStart !== null) {
            // 左邊拉伸：新寬度 = (blockEnd - newStart) / dur
            resizedDomRef.current.style.width = `${((resizeBlockEndRef.current - committedStart) / dur) * 100}%`;
          } else {
            resizedDomRef.current.style.width = '';
          }
          resizedDomRef.current.style.marginLeft = '';
          resizedDomRef.current.style.zIndex     = '';
        }

        if (nextBlackDom) {
          if (committedEnd !== null) {
            // 右拉：相鄰黑色 block 新寬度 = (nextColoredStart - newEnd) / dur
            // resizeRightBoundRef 在 mousedown 時設定；sentinel(dur+50) 代表無右鄰，延伸至歌曲末端
            const nextColoredStart = Math.min(resizeRightBoundRef.current, dur);
            nextBlackDom.style.width = `${((nextColoredStart - committedEnd) / dur) * 100}%`;
          } else {
            nextBlackDom.style.width = '';
          }
        }

        if (prevBlackDom) {
          if (committedStart !== null) {
            // 左拉：相鄰黑色 block 新寬度 = (newStart - prevColoredEnd) / dur
            // resizeLeftBoundRef sentinel(-50) 代表無左鄰，從 0ms 開始
            const prevColoredEnd = Math.max(resizeLeftBoundRef.current, 0);
            prevBlackDom.style.width = `${((committedStart - prevColoredEnd) / dur) * 100}%`;
          } else {
            prevBlackDom.style.width = '';
          }
        }

        resizeEdgeRef.current       = null;
        resizeDragStartRef.current  = null;
        resizedAtIdxRef.current     = null;
        resizedDomRef.current       = null;
        resizeDragPixelsRef.current = 0;
        resizeTrackWidthRef.current = 0;
        setHoverEdge(null);

        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup',   handleResizeMouseUp);
      };

      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup',   handleResizeMouseUp);
    };

    /* [Drag 已停用] handleMouseMove：drag 期間即時更新 tempActionTable。
       啟用時需一併恢復 state 宣告、handleMouseUp，以及 onMouseMove={handleMouseMove} 在 timeline div。
    const handleMouseMove = (e) => {
      // 如果没有拖动行为或没有正在拖动的方块，直接返回
      if (!dragging || draggedBlockIndex === null) return;

      // 确保 timelineRef 已经被初始化
      if (!timelineRef?.current) {
        console.warn("timelineRef is not initialized");
        return;
      }

      // 获取 timeline 容器的边界信息
      const rect = timelineRef.current.getBoundingClientRect();

      // 计算拖动的距离和对应的时间
      const draggedDistance = e.clientX - dragStartpoint; // 拖动的像素距离
      const draggedTime =
        Math.floor(((draggedDistance / rect.width) * duration) / 50) * 50; // 将拖动距离转换为时间

      // 使用 Immer 深拷贝并更新方块位置
      const updatedTable = produce(tempActionTable, (draft) => {
        const direction = e.clientX > dragStartpoint ? "right" : "left"; // 判断拖动方向
        const partData = draft[armorIndex][partIndex]; // 获取当前部位的数据

        // 如果拖动方向是向右
        if (direction === "right") {
          if (
            hoveredBlock?.rightedge && // 当前拖动的方块是右边界
            hoveredBlock?.rightindex === draggedBlockIndex // 并且是当前拖动的方块
          ) {
            // 如果存在下一个方块
            if (tempActionTable[armorIndex][partIndex][draggedBlockIndex + 2]) {
              const nextBlockTime =
                tempActionTable[armorIndex][partIndex][draggedBlockIndex + 2]
                  .time;
              const currentBlockTime =
                tempActionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                  .time;

              // 检查当前和下一个方块之间的时间间隔是否大于 50
              if (nextBlockTime - currentBlockTime > blackthreshold) {
                partData[draggedBlockIndex + 1].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                    .time + draggedTime;
              } else {
                // 如果时间间隔不足 50，同时调整下一个方块的位置
                partData[draggedBlockIndex + 1].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                    .time + draggedTime;
                partData[draggedBlockIndex + 2].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                    .time +
                  draggedTime +
                  blackthreshold;
              }
            }
          } else if (
            hoveredBlock?.leftedge && // 当前拖动的方块是左边界
            hoveredBlock?.leftindex === draggedBlockIndex
          ) {
            // 如果拖动后时间不会超过下一个方块的时间
            if (
              tempActionTable[armorIndex][partIndex][draggedBlockIndex].time +
                draggedTime <
              tempActionTable[armorIndex][partIndex][draggedBlockIndex + 1].time
            ) {
              partData[draggedBlockIndex].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                draggedTime;
            }
          } else {
            // 普通情况下向右拖动
            if (tempActionTable[armorIndex][partIndex][draggedBlockIndex + 2]) {
              partData[draggedBlockIndex].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                draggedTime;

              const nextBlockTime =
                tempActionTable[armorIndex][partIndex][draggedBlockIndex + 2]
                  .time;
              const currentBlockTime =
                tempActionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                  .time;

              if (nextBlockTime - currentBlockTime > blackthreshold) {
                partData[draggedBlockIndex + 1].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                    .time + draggedTime;
              } else {
                partData[draggedBlockIndex + 1].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                    .time + draggedTime;
                partData[draggedBlockIndex + 2].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                    .time +
                  draggedTime +
                  blackthreshold;
              }
            } else {
              // 如果没有后续方块
              if (
                actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time +
                  draggedTime <
                duration
              ) {
                partData[draggedBlockIndex].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                  draggedTime;
                partData[draggedBlockIndex + 1].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                    .time + draggedTime;
              } else {
                partData[draggedBlockIndex + 1].time = duration; // 防止超出音频范围
              }
            }
          }
        } else {
          // 如果拖动方向是向左
          if (
            hoveredBlock?.rightedge && // 当前拖动的方块是右边界
            hoveredBlock?.rightindex === draggedBlockIndex
          ) {
            if (
              tempActionTable[armorIndex][partIndex][draggedBlockIndex].time <
              tempActionTable[armorIndex][partIndex][draggedBlockIndex + 1]
                .time +
                draggedTime
            ) {
              partData[draggedBlockIndex + 1].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time +
                draggedTime;
            }
          } else if (
            hoveredBlock?.leftedge && // 当前拖动的方块是左边界
            hoveredBlock?.leftindex === draggedBlockIndex
          ) {
            if (
              actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                draggedTime >
              0
            ) {
              partData[draggedBlockIndex].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                draggedTime;

              if (
                tempActionTable[armorIndex][partIndex][draggedBlockIndex - 2]
              ) {
                const previousBlockTime =
                  tempActionTable[armorIndex][partIndex][draggedBlockIndex]
                    .time;
                const secondPreviousBlockTime =
                  tempActionTable[armorIndex][partIndex][draggedBlockIndex - 1]
                    .time;

                if (
                  previousBlockTime - secondPreviousBlockTime <
                  blackthreshold
                ) {
                  partData[draggedBlockIndex - 1].time =
                    actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                    draggedTime -
                    blackthreshold;
                }
              }
            }
          } else {
            // 普通情况下向左拖动
            if (
              actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                draggedTime >
              0
            ) {
              partData[draggedBlockIndex + 1].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time +
                draggedTime;
              partData[draggedBlockIndex].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                draggedTime;

              if (
                tempActionTable[armorIndex][partIndex][draggedBlockIndex - 2]
              ) {
                const previousBlockTime =
                  tempActionTable[armorIndex][partIndex][draggedBlockIndex]
                    .time;
                const secondPreviousBlockTime =
                  tempActionTable[armorIndex][partIndex][draggedBlockIndex - 1]
                    .time;

                if (
                  previousBlockTime - secondPreviousBlockTime <
                  blackthreshold
                ) {
                  partData[draggedBlockIndex - 1].time =
                    actionTable[armorIndex][partIndex][draggedBlockIndex].time +
                    draggedTime -
                    blackthreshold;
                }
              }
            }
          }
        }
      });

      // 更新 Redux 中的临时 ActionTable
      dispatch(updateTempActionTable(updatedTable));
    };
    */ // [Drag 已停用] end of handleMouseMove

    return (
      <div
        className="timeline"
        ref={timelineRef} // 設置 ref
        style={{
          flex: `0 0 ${height}%`,
          width: "100%",
          display: "flex",
          alignItems: "center",
          overflow: moveMode ? "visible" : "hidden", // move mode 時允許 block 超出容器邊界顯示
          border: "1px solid rgb(63, 63, 63)",
          boxSizing: "border-box",
          padding: "0px",
          opacity: hidden ? 0 : 1, // 如果 hidden 为 true，則隱藏內容
          pointerEvents: hidden ? "none" : "auto", // 禁用鼠标事件
        }}
        // [Drag 已停用] 啟用 drag 時需恢復以下兩行
        // onMouseMove={handleMouseMove}
        // onMouseUp={handleMouseUp}
      >
      {timelineBlocks.map((block, index) => {
        // --- 0. 查找 actionTable 中的實際 index（timelineBlocks 與 actionTable 索引不對齊）---
        const partData = actionTable[armorIndex]?.[partIndex];
        const atIdx = partData?.findIndex(entry => entry.time === block.startTime && !(entry?.color?.R === 0 && entry?.color?.G === 0 && entry?.color?.B === 0)) ?? -1;

        // --- 1. 定義狀態變數 ---
        // 是否在目前這條 Timeline 的選中清單中
        const isCurrentlyInMultiSelect = atIdx !== -1 && multiSelectedBlocks.some(b => 
          b.armorIndex === armorIndex && 
          b.partIndex === partIndex && 
          b.blockIndex === atIdx
        );

        // A. 判斷是否為「貼上目標」(綠色)：在複製模式下且被點擊選中
        const isPasteTarget = isCopying && isCurrentlyInMultiSelect;

        // B. 判斷是否為「複製來源」(橘色)：從剪貼簿讀取當初 Ctrl+C 的位置
        const isCopySource = isCopying && clipboard?.sourceBlocks?.some(b => 
          b.armorIndex === armorIndex && 
          b.partIndex === partIndex && 
          b.blockIndex === atIdx
        );

        // C. 判斷是否為「普通選取」(橘色)：非複製模式下的正常選取
        const isNormalSelected = !isCopying && isCurrentlyInMultiSelect;

        // --- 2. 顏色與樣式邏輯 ---
        const color = block.color || { R: 0, G: 0, B: 0, A: 1 };
        const currentBlockData = atIdx !== -1 ? partData[atIdx] : undefined;
        const isFade = currentBlockData?.linear === 1;

        // 定義背景
        let backgroundStyle;
        if (isFade) {
          const partTimeline = partData;
          const nextBlock = partTimeline?.[atIdx + 1];
          const nextNextBlock = partTimeline?.[atIdx + 2];
          const isBlack = (c) => c && c.R === 0 && c.G === 0 && c.B === 0;
          let endColor = { R: 0, G: 0, B: 0, A: 1 };
          if (nextBlock && !isBlack(nextBlock.color)) endColor = nextBlock.color;
          else if (nextNextBlock) endColor = nextNextBlock.color;
          backgroundStyle = `linear-gradient(to right, rgba(${color.R},${color.G},${color.B},${color.A}), rgba(${endColor.R},${endColor.G},${endColor.B},${endColor.A}))`;
        } else {
          backgroundStyle = `rgba(${color.R}, ${color.G}, ${color.B}, ${color.A})`;
        }

        // 計算框線顏色
        const colorDistance = (c1, c2) => Math.sqrt(
          Math.pow((c1.R||0)-(c2.R||0),2) + Math.pow((c1.G||0)-(c2.G||0),2) + Math.pow((c1.B||0)-(c2.B||0),2)
        );
        let selectionBorderColor = "#FFA500"; // 橘色
        if (colorDistance(color, { R: 255, G: 165, B: 0 }) < 200) {
          selectionBorderColor = "#00FFFF"; // 改為青色
        }

          const isBlackBlock = color.R === 0 && color.G === 0 && color.B === 0;

          // 設定 blockStyle
          const blockStyle = {
            display: "inline-block",
            background: backgroundStyle,
            width: `${(block.durationTime / duration) * 100}%`,
            height: "90%",
            position: "relative",
            borderRadius: "7px",
            zIndex: (isPasteTarget || isCopySource) ? 10 : 1,
            // 優先權：貼上目標(綠) > 複製來源(橘) > 普通選取
            border: isPasteTarget
              ? "4px solid #00FF00"
              : (isCopySource || isNormalSelected ? `3px solid ${selectionBorderColor}` : "none"),
            boxSizing: "border-box",
            cursor: "default",
          };

          // [Drag 已停用] 以下三個 handler 供舊版 drag 邊緣偵測使用，啟用 drag 時需一併恢復 hoveredBlock state
          // const handleMouseLeave2 = (edge) => {
          //   setHoveredBlock((prev) => {
          //     const updatedBlock = { ...prev, [edge]: false };
          //     if (edge === "leftedge") updatedBlock.leftindex = null;
          //     if (edge === "rightedge") updatedBlock.rightindex = null;
          //     return updatedBlock;
          //   });
          // };
          // const handleMouseMoveLeft = (index) => {
          //   setHoveredBlock((prev) => ({ ...prev, leftedge: true, leftindex: index }));
          // };
          // const handleMouseMoveRight = (index) => {
          //   setHoveredBlock((prev) => ({ ...prev, rightedge: true, rightindex: index }));
          // };
          // 邊緣偵測：僅對已選中的有色 block 偵測游標位置以顯示 ew-resize 游標
          // （isNormalSelected 已在上方宣告）
          const EDGE_THRESHOLD = 8; // px

          const handleBlockMouseMove = (ev) => {
            // resizeDragStartRef 不為 null 代表正在 resize，跳過 state 更新避免觸發 React 重繪覆蓋直接設定的 DOM style
            if (moveMode || isBlackBlock || !isNormalSelected || resizeDragStartRef.current !== null) return;
            const r = ev.currentTarget.getBoundingClientRect();
            const offsetX = ev.clientX - r.left;
            if (offsetX <= EDGE_THRESHOLD) {
              setHoverEdge({ index, edge: 'left' });
            } else if (offsetX >= r.width - EDGE_THRESHOLD) {
              setHoverEdge({ index, edge: 'right' });
            } else if (hoverEdge?.index === index) {
              setHoverEdge(null);
            }
          };

          const handleBlockMouseLeave = () => {
            // move mode 或 resize 進行中，不觸發 state 更新（避免 React re-render 覆蓋直接設定的 DOM style）
            if (moveMode || resizeDragStartRef.current !== null) return;
            if (hoverEdge?.index === index) setHoverEdge(null);
          };

          // 游標優先序：resize 邊緣 > move mode > 預設
          const blockCursor = (!moveMode && hoverEdge?.index === index)
            ? 'ew-resize'
            : (moveMode && !isBlackBlock ? 'grab' : 'default');

          // 貼到空白處時，用一條綠線標出貼上的位置（空白區段可能很寬，
          // 只把整段框起來看不出來會貼在哪裡）
          const pasteAnchor = isCopying ? multiSelectedBlocks[0] : null;
          const showPasteAnchor =
            pasteAnchor?.pasteTime != null &&
            pasteAnchor.armorIndex === armorIndex &&
            pasteAnchor.partIndex === partIndex &&
            block.durationTime > 0 &&
            pasteAnchor.pasteTime >= block.startTime &&
            pasteAnchor.pasteTime <= block.startTime + block.durationTime;
          const pasteAnchorPct = showPasteAnchor
            ? ((pasteAnchor.pasteTime - block.startTime) / block.durationTime) * 100
            : 0;

          return (
            <div
              key={index}
              ref={(el) => { blockDomRefs.current[index] = el; }}
              style={{
                ...blockStyle,
                cursor: blockCursor,
                // [Drag 已停用] hoveredBlock 懸停透明度，啟用 drag 時恢復：
                // ...(hoveredBlock?.index === index ? { opacity: 0.85 } : { opacity: 1 }),
              }}
              className="timeline-block"
              onMouseMove={moveMode ? undefined : handleBlockMouseMove}
              onMouseLeave={moveMode ? undefined : handleBlockMouseLeave}
              onMouseDown={(e) => handleMouseDown(e, index)}
            >
              {showPasteAnchor && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${pasteAnchorPct}%`,
                    width: "2px",
                    backgroundColor: "#00FF00",
                    boxShadow: "0 0 4px #00FF00",
                    pointerEvents: "none",
                    zIndex: 3,
                  }}
                />
              )}
              {currentBlockData?.linear === 1 && (
                <FontAwesomeIcon
                  icon={faWandMagicSparkles}
                  size="xl"
                  style={{
                    position: "absolute",
                    top: "5px",
                    right: "5px",
                    color: "white",
                    zIndex: 2,
                  }}
                />
              )}
              {" "}
              {/*
              {/* 如果不是黑色方块，渲染左右虛擬檢測塊
              {!(
                block.color.R === 0 &&
                block.color.G === 0 &&
                block.color.B === 0 &&
                block.color.A === 1
              ) && (
                <>
                  {/* 左側虛擬檢測方塊 
                  <div
                    style={{
                      position: "absolute",
                      left: "-5px",
                      width: "50px",
                      height: "80%",
                      backgroundColor: "transparent", // 透明
                      cursor: "pointer", // 改變鼠標樣式
                      zIndex: 5,
                    }}
                    onMouseMove={() => handleMouseMoveLeft(index)}
                    onMouseLeave={() => handleMouseLeave2("leftedge")}
                  />
                  {/* 右側虛擬檢測方塊  
                  <div
                    style={{
                      position: "absolute",
                      right: "-5px",
                      width: "50px",
                      height: "80%",
                      backgroundColor: "transparent", // 透明
                      cursor: "pointer", // 改變鼠標樣式
                      zIndex: 5,
                    }}
                    onMouseMove={() => handleMouseMoveRight(index)}
                    onMouseLeave={() => handleMouseLeave2("rightedge")}
                  />{" "}
                  {hoveredBlock?.leftindex === index &&
                    hoveredBlock.leftedge && (
                      <FontAwesomeIcon
                        style={leftarrowStyle}
                        icon={faRightToBracket}
                        size="lg"
                      />
                    )}
                  {hoveredBlock?.rightindex === index &&
                    hoveredBlock.rightedge && (
                      <FontAwesomeIcon
                        style={rightarrowStyle}
                        icon={faRightToBracket}
                        size="lg"
                      />
                    )}
                </>
              )}
              */}
            </div>
          );
        })}
      </div>
    );
  }
);

export default memo(Timeline);
