import React, { useRef, useState, useEffect, forwardRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  updateActionTable,
  updateTimelineBlocks,
  updateTempActionTable,
  updateIsColorChangeActive,
  updateMultiSelectedBlocks,
  updateMoveMode,
} from "../../redux/actions";

import cloneDeep from "lodash/cloneDeep";
import { produce } from "immer";
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
    const tempActionTable = useSelector(
      (state) => state.profiles.tempActionTable
    ); // 臨時動作表
    const duration = useSelector((state) => state.profiles.duration); // 總時長
    const multiSelectedBlocks = useSelector((state) => state.profiles.multiSelectedBlocks); // 全局多選中方塊
    const clipboard = useSelector((state) => state.profiles.clipboard);
    const blackthreshold = 10;
    const STRETCH_MIN_MS  = 50; // Stretch Mode：block 可縮到的最小持續時間（ms）
    const MIN_BLOCK_GAP_MS = 50; // 相鄰兩個有色 block 之間必須保留的最小間距（ms）

    // Move Mode 相關 ref（零延遲拖曳，不觸發 React 重繪）
    const moveMode = useSelector((state) => state.profiles.moveMode);
    const moveDragStartRef = useRef(null);   // 拖曳起始 clientX
    const moveDraggedIdxRef = useRef(null);  // 被拖曳的 block index
    const moveDraggedDomRef = useRef(null);  // 被拖曳的 DOM 元素
    const minDragPxRef = useRef(0);          // 最小可拖曳像素（向左）
    const maxDragPxRef = useRef(0);          // 最大可拖曳像素（向右）
    const moveDragPixelsRef = useRef(0);     // 目前拖曳偏移像素
    const blockDomRefs = useRef({});         // index → DOM element
    const isBlackEntry = (e) => e.color.R === 0 && e.color.G === 0 && e.color.B === 0;
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

    // Move Mode：進入時掛載全域滑鼠事件，離開時清除
    // 操作邏輯：點 block → 開始跟蹤滑鼠移動（不需按住）→ 再點任意位置 → 提交並退出
    useEffect(() => {
      if (!moveMode) {
        // M 鍵直接退出 move mode 時，若有正在追蹤的 block，先提交位置
        const idx = moveDraggedIdxRef.current;
        if (idx !== null && moveDragPixelsRef.current !== 0 && timelineRef?.current) {
          const dragPx = moveDragPixelsRef.current;
          const rect = timelineRef.current.getBoundingClientRect();
          const pixelsPerMs = rect.width / durationRef.current;
          const dt = Math.round((dragPx / pixelsPerMs) / 50) * 50;
          if (dt !== 0) {
            const curActionTable = actionTableRef.current;
            const partData = curActionTable[armorIndex]?.[partIndex];
            if (partData) {
              const updatedTable = produce(curActionTable, (draft) => {
                const pd = draft[armorIndex][partIndex];
                let i = idx;
                if (pd[i] === undefined) return;

                const blockDur      = (pd[i + 1]?.time ?? durationRef.current) - pd[i].time;
                const originalStart = pd[i].time;

                // 找左鄰有色 block 的尾端
                let leftBound = 0;
                for (let j = i - 1; j >= 0; j--) {
                  if (!isBlackEntry(pd[j])) { leftBound = pd[j + 1]?.time ?? 0; break; }
                }
                // 找右鄰有色 block 的起點
                let rightBound = durationRef.current;
                for (let j = i + 2; j < pd.length; j++) {
                  if (!isBlackEntry(pd[j])) { rightBound = pd[j].time; break; }
                }

                // 套用 dt 後顯式夾緊，確保與左右 block 保持 MIN_BLOCK_GAP_MS 間距
                const newStart = Math.max(
                  leftBound + MIN_BLOCK_GAP_MS,
                  Math.min(rightBound - blockDur - MIN_BLOCK_GAP_MS, originalStart + dt)
                );
                const newEnd = newStart + blockDur;

                pd[i].time = newStart;
                if (pd[i + 1] !== undefined) pd[i + 1].time = newEnd;

                // 清除因位移而排序違反的孤立黑色 entries
                if (newStart > originalStart) {
                  while (pd[i + 2] !== undefined && pd[i + 2].time <= pd[i + 1].time && isBlackEntry(pd[i + 2])) {
                    pd.splice(i + 2, 1);
                  }
                } else if (newStart < originalStart) {
                  while (i > 0 && pd[i - 1] !== undefined && pd[i - 1].time >= pd[i].time && isBlackEntry(pd[i - 1])) {
                    pd.splice(i - 1, 1);
                    i--;
                  }
                }
              });
              dispatch(updateActionTable(updatedTable));
            }
          }
        }
        // move mode 結束時確保 DOM 樣式清除
        if (moveDraggedDomRef.current) {
          moveDraggedDomRef.current.style.transform = '';
          moveDraggedDomRef.current.style.zIndex = '';
          moveDraggedDomRef.current.style.overflow = '';
        }
        moveDragStartRef.current = null;
        moveDraggedIdxRef.current = null;
        moveDraggedDomRef.current = null;
        moveDragPixelsRef.current = 0;
        return;
      }

      // 滑鼠移動時更新 block 的 DOM 位置（零延遲，不走 React）
      const handleGlobalMouseMove = (e) => {
        if (moveDragStartRef.current === null || !moveDraggedDomRef.current) return;
        const rawDelta = e.clientX - moveDragStartRef.current;
        const clamped = Math.max(minDragPxRef.current, Math.min(maxDragPxRef.current, rawDelta));
        moveDragPixelsRef.current = clamped;
        moveDraggedDomRef.current.style.transform = `translateX(${clamped}px)`;
      };

      // 任意點擊（mousedown）→ 提交目前位置並退出 move mode
      // 注意：點 block 本身的 mousedown 若是「選取新 block」會 stopPropagation，
      //       所以此 handler 只有在「已有追蹤中的 block」或「點空白處」時才觸發提交。
      const handleGlobalMouseDown = () => {
        const idx = moveDraggedIdxRef.current;
        if (idx !== null && timelineRef?.current) {
          const dragPx = moveDragPixelsRef.current;
          const rect = timelineRef.current.getBoundingClientRect();
          const pixelsPerMs = rect.width / durationRef.current;
          const dt = Math.round((dragPx / pixelsPerMs) / 50) * 50;

          if (dt !== 0) {
            const curActionTable = actionTableRef.current;
            const partData = curActionTable[armorIndex]?.[partIndex];
            if (partData) {
              const updatedTable = produce(curActionTable, (draft) => {
                const pd = draft[armorIndex][partIndex];
                let i = idx;
                if (pd[i] === undefined) return;

                const blockDur      = (pd[i + 1]?.time ?? durationRef.current) - pd[i].time;
                const originalStart = pd[i].time;

                // 找左鄰有色 block 的尾端
                let leftBound = 0;
                for (let j = i - 1; j >= 0; j--) {
                  if (!isBlackEntry(pd[j])) { leftBound = pd[j + 1]?.time ?? 0; break; }
                }
                // 找右鄰有色 block 的起點
                let rightBound = durationRef.current;
                for (let j = i + 2; j < pd.length; j++) {
                  if (!isBlackEntry(pd[j])) { rightBound = pd[j].time; break; }
                }

                // 套用 dt 後顯式夾緊，確保與左右 block 保持 MIN_BLOCK_GAP_MS 間距
                const newStart = Math.max(
                  leftBound + MIN_BLOCK_GAP_MS,
                  Math.min(rightBound - blockDur - MIN_BLOCK_GAP_MS, originalStart + dt)
                );
                const newEnd = newStart + blockDur;

                pd[i].time = newStart;
                if (pd[i + 1] !== undefined) pd[i + 1].time = newEnd;

                // 清除因位移而排序違反的孤立黑色 entries
                if (newStart > originalStart) {
                  while (pd[i + 2] !== undefined && pd[i + 2].time <= pd[i + 1].time && isBlackEntry(pd[i + 2])) {
                    pd.splice(i + 2, 1);
                  }
                } else if (newStart < originalStart) {
                  while (i > 0 && pd[i - 1] !== undefined && pd[i - 1].time >= pd[i].time && isBlackEntry(pd[i - 1])) {
                    pd.splice(i - 1, 1);
                    i--;
                  }
                }
              });
              dispatch(updateActionTable(updatedTable));
            }
          }

          if (moveDraggedDomRef.current) {
            moveDraggedDomRef.current.style.transform = '';
            moveDraggedDomRef.current.style.zIndex = '';
            moveDraggedDomRef.current.style.overflow = '';
          }
        }

        moveDragStartRef.current = null;
        moveDraggedIdxRef.current = null;
        moveDraggedDomRef.current = null;
        moveDragPixelsRef.current = 0;
        dispatch(updateMoveMode(false));
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mousedown', handleGlobalMouseDown);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mousedown', handleGlobalMouseDown);
      };
    }, [moveMode, armorIndex, partIndex, dispatch]);

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

    // 在組件掛載時，將 actionTable 深拷貝到 tempActionTablef
    useEffect(() => {
      console.log("useeffect");
      dispatch(updateTempActionTable(cloneDeep(actionTable)));
      // console.log("tempActionTable: ", tempActionTable);
    }, [actionTable]);

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
          !e.target.closest(".effect-wrapper")
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
    useEffect(() => {
      if (
        !tempActionTable ||
        !tempActionTable[armorIndex] ||
        tempActionTable[armorIndex].length === 0
      ) {
        console.warn(
          `Invalid data structure at tempActionTable[${armorIndex}][${partIndex}]`
        );
        return;
      }

      const newBlocks = [];
      tempActionTable[armorIndex][partIndex].forEach((entry, index) => {
        const startTime = entry.time;
        const nextStartTime =
          tempActionTable[armorIndex][partIndex]?.[index + 1]?.time ?? duration; // ?? 而非 ||：time=0 是合法值

        const { R, G, B, A } = entry.color || {};
        const newBlock = {
          startTime,
          durationTime: nextStartTime - startTime,
          color: { R, G, B, A },
        };

        const lastBlock = newBlocks[newBlocks.length - 1];
        if (
          lastBlock &&
          lastBlock.startTime + lastBlock.durationTime === newBlock.startTime &&
          JSON.stringify(lastBlock.color) === JSON.stringify(newBlock.color)
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
    }, [tempActionTable, duration, armorIndex, partIndex, dispatch]);

    // 處理鼠標按下事件
    const handleMouseDown = (e, index) => {
      // ⚠️ stopPropagation 不可在此提前呼叫：
      // Move Mode 時必須根據情況決定是否攔截，讓全域 mousedown 能夠觸發提交/退出。

      const block = timelineBlocks[index];
      const isBlackBlock = block.color.R === 0 && block.color.G === 0 && block.color.B === 0;

      // Move Mode 邏輯：
      // - 若已在追蹤中 或 點到黑塊：不攔截 → 全域 mousedown 提交/退出
      // - 若尚未追蹤且點到有色 block：stopPropagation 開始追蹤（本次點擊是「選取」，不是「提交」）
      if (moveMode) {
        if (moveDraggedIdxRef.current !== null) return; // 已追蹤 → 讓全域 handler 提交
        if (isBlackBlock) return;                        // 黑塊 → 讓全域 handler 退出

        // 本次點擊是「選取 block 開始追蹤」，攔截讓全域 handler 無法立刻觸發提交
        e.stopPropagation();
        e.preventDefault();

        // Bug fix：timelineBlocks index ≠ actionTable index（刪除後相鄰黑塊合併導致偏移）
        // 用 block.startTime 反查 actionTable 真正的 index
        // 必須排除 black entry：當 black entry 與 colored entry 同時間（緊鄰 block），findIndex 若只比對時間會取到錯誤 index
        const partData = actionTable[armorIndex][partIndex];
        const atIdx = partData.findIndex(entry => entry.time === block.startTime && !isBlackEntry(entry));
        if (atIdx === -1) return;

        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: index }]));

        const rect = timelineRef.current?.getBoundingClientRect();
        if (!rect) return;

        const pixelsPerMs = rect.width / duration;
        const blockStartTime = partData[atIdx].time;
        const blockEndTime   = partData[atIdx + 1]?.time ?? duration;

        // 左邊界：往左跳過連續黑色 entry，找到前一個有色 block 的尾端
        // 這樣即使前一個 block 被刪除留下空洞，也能移到正確的邊界
        let leftSearchIdx = atIdx - 1;
        while (leftSearchIdx >= 0 && isBlackEntry(partData[leftSearchIdx])) {
          leftSearchIdx--;
        }
        // leftSearchIdx：前一個有色 block 的 index（-1 表示不存在）
        // 左邊界 = 前一個有色 block 尾端（其後第一個 black entry 的時間），無則為 0
        const leftBoundTime = leftSearchIdx >= 0
          ? (partData[leftSearchIdx + 1]?.time ?? 0)
          : 0;

        // 右邊界：往右跳過連續黑色 entry，找到下一個有色 block 的起點
        // 被刪除的 block 留下的孤立 black entry 會被跳過
        let rightSearchIdx = atIdx + 2;
        while (rightSearchIdx < partData.length && isBlackEntry(partData[rightSearchIdx])) {
          rightSearchIdx++;
        }
        // rightSearchIdx：下一個有色 block 的 index（partData.length 表示不存在）
        // 右邊界 = 下一個有色 block 的起始時間，無則為 duration
        const rightBoundTime = rightSearchIdx < partData.length
          ? partData[rightSearchIdx].time
          : duration;

        // 保留 50ms 緩衝，防止移動至恰好觸碰相鄰 block 而觸發刪除
        minDragPxRef.current   = Math.min(0, (leftBoundTime  - blockStartTime + 50) * pixelsPerMs);
        maxDragPxRef.current   = Math.max(0, (rightBoundTime - blockEndTime   - 50) * pixelsPerMs);
        moveDragStartRef.current   = e.clientX;
        moveDraggedIdxRef.current  = atIdx;   // ← 存 actionTable index，不是 timelineBlocks index
        moveDraggedDomRef.current  = e.currentTarget; // 直接用事件的 target，不依賴 blockDomRefs（避免 null-cycle）
        moveDragPixelsRef.current  = 0;

        // 拖曳時提高 z-index，確保移動中的 block 顯示在所有相鄰 block 上方
        if (moveDraggedDomRef.current) {
          moveDraggedDomRef.current.style.zIndex = '100';
          moveDraggedDomRef.current.style.overflow = 'visible';
        }
        return;
      }

      // 非 Move Mode：維持原本行為，攔截事件
      e.stopPropagation();

      // 邊緣 resize 邏輯：已選中的有色 block 在邊緣按下時啟動 resize，不進入普通選取流程
      {
        const isSelected = multiSelectedBlocks.some(b =>
          b.armorIndex === armorIndex && b.partIndex === partIndex && b.blockIndex === index
        );
        if (isSelected && !isBlackBlock && hoverEdge?.index === index) {
          e.preventDefault();
          startBlockResize(e, index, hoverEdge.edge);
          return;
        }
      }

      if (isCopying) {
        // 關鍵：在尋找貼上目標時，僅更新單選(綠框目標)
        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: index }]));
        return;
      }
      // If a black block is clicked, clear all selections.
      if (block.color.R === 0 && block.color.G === 0 && block.color.B === 0) {
        dispatch(updateMultiSelectedBlocks([]));
        return;
      }

      // Shift-click multi-selection logic
      const anchorBlock = multiSelectedBlocks[0];
      if (e.shiftKey && anchorBlock && anchorBlock.armorIndex === armorIndex && anchorBlock.partIndex === partIndex) {
        const startIdx = anchorBlock.blockIndex;
        const endIdx = index;

        const selectionStart = Math.min(startIdx, endIdx);
        const selectionEnd = Math.max(startIdx, endIdx);

        const newMultiSelected = [];
        for (let i = selectionStart; i <= selectionEnd; i++) {
          const currentBlock = timelineBlocks[i];
          // Filter out black blocks (transition blocks)
          const isBlackTransition = currentBlock.color.R === 0 && currentBlock.color.G === 0 && currentBlock.color.B === 0;
          if (!isBlackTransition) {
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
        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: index }]));
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

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pixelsPerMs = rect.width / duration;

      const blockStartTime = partData[atIdx].time;
      const blockEndTime   = partData[atIdx + 1]?.time ?? duration;

      const domEl = blockDomRefs.current[tlIdx];
      if (!domEl) return;

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

      if (edge === 'right') {
        // 右邊界：往右跳過連續黑色 entry，找下一個有色 block 的起點
        let rightSearchIdx = atIdx + 2;
        while (rightSearchIdx < partData.length && isBlackEntry(partData[rightSearchIdx])) rightSearchIdx++;
        // 若無下一個有色 block，設 duration+50 使 rightBound-50=duration，允許 block 延伸至末尾
        const rightBoundTime = rightSearchIdx < partData.length ? partData[rightSearchIdx].time : duration + 50;
        resizeRightBoundRef.current = rightBoundTime;
        // 保留 50ms 緩衝，防止擴展至恰好觸碰相鄰 block；向左最多縮到 STRETCH_MIN_MS
        maxResizePxRef.current = Math.max(0, (rightBoundTime - blockEndTime - 50) * pixelsPerMs);
        minResizePxRef.current = -(blockEndTime - blockStartTime - STRETCH_MIN_MS) * pixelsPerMs;
      } else {
        // 左邊界：往左跳過連續黑色 entry，找上一個有色 block 的尾端
        let leftSearchIdx = atIdx - 1;
        while (leftSearchIdx >= 0 && isBlackEntry(partData[leftSearchIdx])) leftSearchIdx--;
        // 若無前一個有色 block，設 -50 使 leftBound+50=0，允許 block 從 0ms 開始
        const leftBoundTime = leftSearchIdx >= 0 ? (partData[leftSearchIdx + 1]?.time ?? 0) : -50;
        resizeLeftBoundRef.current = leftBoundTime;
        // 保留 50ms 緩衝，防止擴展至恰好觸碰相鄰 block；向右最多縮到 STRETCH_MIN_MS
        minResizePxRef.current = Math.min(0, (leftBoundTime - blockStartTime + 50) * pixelsPerMs);
        maxResizePxRef.current = (blockEndTime - STRETCH_MIN_MS - blockStartTime) * pixelsPerMs;
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

        if (savedIdx !== null && timelineRef?.current) {
          const r = timelineRef.current.getBoundingClientRect();
          if (r.width > 0) {
            const pxPerMs = r.width / durationRef.current;
            const rawDeltaMs = dragPx / pxPerMs;
            const dur = durationRef.current;

            const updatedTable = produce(actionTableRef.current, (draft) => {
              const pd = draft[armorIndex][partIndex];

              if (savedEdge === 'right') {
                if (pd[savedIdx + 1] === undefined) return;

                // commit 時從當前 pd 重新查找右邊界（最近的有色 block 起點）
                // 無右鄰 block 時設 dur+50，使 rightBound-50=dur，允許 block 延伸至歌曲末端
                let rightBound = dur + 50;
                for (let j = savedIdx + 2; j < pd.length; j++) {
                  if (!isBlackEntry(pd[j])) { rightBound = pd[j].time; break; }
                }
                const blockStart = pd[savedIdx].time;
                const rawTarget  = Math.round((resizeBlockEndRef.current + rawDeltaMs) / 50) * 50;
                committedEnd     = Math.max(blockStart + STRETCH_MIN_MS, Math.min(rightBound - 50, rawTarget));
                pd[savedIdx + 1].time = committedEnd;

                // 修正孤立黑色 entry 的時間順序：若 savedIdx+2 之後有時間小於 committedEnd 的黑色 entry，
                // 將其夾緊到 committedEnd，避免負 durationTime 造成所有 block 位移錯誤
                for (let j = savedIdx + 2; j < pd.length; j++) {
                  if (!isBlackEntry(pd[j])) break;
                  if (pd[j].time < committedEnd) pd[j].time = committedEnd;
                }

              } else {
                if (pd[savedIdx] === undefined) return;

                // commit 時從當前 pd 重新查找左邊界（最近的有色 block 終點）
                // leftBound + 50 = 允許的最早起點：有左鄰時 = prevEnd，無時 = 0ms
                let leftBound = -50; // sentinel：無左鄰 block 時 leftBound+50=0，允許延伸至 0ms
                for (let j = savedIdx - 1; j >= 0; j--) {
                  if (!isBlackEntry(pd[j])) {
                    leftBound = pd[j + 1]?.time ?? 0;
                    break;
                  }
                }
                const blockEnd   = pd[savedIdx + 1]?.time ?? dur;
                const rawTarget  = Math.round((resizeBlockStartRef.current + rawDeltaMs) / 50) * 50;
                committedStart   = Math.min(blockEnd - STRETCH_MIN_MS, Math.max(leftBound + 50, rawTarget));
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
        // --- 1. 定義狀態變數 ---
        // 是否在目前這條 Timeline 的選中清單中
        const isCurrentlyInMultiSelect = multiSelectedBlocks.some(b => 
          b.armorIndex === armorIndex && 
          b.partIndex === partIndex && 
          b.blockIndex === index
        );

        // A. 判斷是否為「貼上目標」(綠色)：在複製模式下且被點擊選中
        const isPasteTarget = isCopying && isCurrentlyInMultiSelect;

        // B. 判斷是否為「複製來源」(橘色)：從剪貼簿讀取當初 Ctrl+C 的位置
        const isCopySource = isCopying && clipboard?.sourceBlocks?.some(b => 
          b.armorIndex === armorIndex && 
          b.partIndex === partIndex && 
          b.blockIndex === index
        );

        // C. 判斷是否為「普通選取」(橘色)：非複製模式下的正常選取
        const isNormalSelected = !isCopying && isCurrentlyInMultiSelect;

        // --- 2. 顏色與樣式邏輯 ---
        const color = block.color || { R: 0, G: 0, B: 0, A: 1 };
        const currentBlockData = actionTable[armorIndex]?.[partIndex]?.[index];
        const isFade = currentBlockData?.linear === 1;

        // 定義背景
        let backgroundStyle;
        if (isFade) {
          const partTimeline = actionTable[armorIndex]?.[partIndex];
          const nextBlock = partTimeline?.[index + 1];
          const nextNextBlock = partTimeline?.[index + 2];
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

export default Timeline;
