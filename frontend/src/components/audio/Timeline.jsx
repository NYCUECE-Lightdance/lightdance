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
    const STRETCH_MIN_MS = 50; // Stretch Mode：block 可縮到的最小持續時間（ms）

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
                if (pd[i] !== undefined)     pd[i].time += dt;
                if (pd[i + 1] !== undefined) pd[i + 1].time += dt;
                if (dt > 0) {
                  while (pd[i + 2] !== undefined && pd[i + 2].time <= pd[i + 1].time) {
                    pd.splice(i + 2, 1);
                  }
                } else {
                  while (i > 0 && pd[i - 1] !== undefined && pd[i - 1].time >= pd[i].time) {
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
                let i = idx; // 用 local i，因為 splice 會改變陣列長度

                if (pd[i] !== undefined)     pd[i].time += dt;
                if (pd[i + 1] !== undefined) pd[i + 1].time += dt;

                if (dt > 0) {
                  // 向右移動：移除後方因排序違反的 black entries（被刪除的空洞留下的殘餘）
                  while (pd[i + 2] !== undefined && pd[i + 2].time <= pd[i + 1].time) {
                    pd.splice(i + 2, 1);
                  }
                } else {
                  // 向左移動：移除前方因排序違反的 black entries
                  while (i > 0 && pd[i - 1] !== undefined && pd[i - 1].time >= pd[i].time) {
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

      // 新格式: 直接使用 startTime/endTime 生成視覺化方塊
      const newBlocks = [];
      tempActionTable[armorIndex][partIndex].forEach((block, index) => {
        const newBlock = {
          startTime: block.startTime,
          durationTime: block.endTime - block.startTime,
          color: block.color || null,
          blockIndex: index, // 保留原始索引用於操作
        };

        newBlocks.push(newBlock);
      });

      console.log(`[Timeline] Generated ${newBlocks.length} timeline blocks`);

      dispatch(
        updateTimelineBlocks({
          armorIndex,
          partIndex,
          value: newBlocks,
        })
      );
    }, [tempActionTable, duration, armorIndex, partIndex, dispatch]);

    // 處理鼠標按下事件（中心拖動）
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

        // Bug fix：timelineBlocks index ≠ actionTable index
        const partData = actionTable[armorIndex][partIndex];
        const atIdx = partData.findIndex(entry => entry.time === block.startTime);
        if (atIdx === -1) return;

        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: index }]));

        const rect = timelineRef.current?.getBoundingClientRect();
        if (!rect) return;

        const pixelsPerMs = rect.width / duration;
        const blockStartTime = partData[atIdx].time;
        const blockEndTime   = partData[atIdx + 1]?.time ?? duration;

        const isBlackEntry = (e) => e.color.R === 0 && e.color.G === 0 && e.color.B === 0;

        let leftSearchIdx = atIdx - 1;
        while (leftSearchIdx >= 0 && isBlackEntry(partData[leftSearchIdx])) {
          leftSearchIdx--;
        }
        const leftBoundTime = leftSearchIdx >= 0
          ? (partData[leftSearchIdx + 1]?.time ?? 0)
          : 0;

        let rightSearchIdx = atIdx + 2;
        while (rightSearchIdx < partData.length && isBlackEntry(partData[rightSearchIdx])) {
          rightSearchIdx++;
        }
        const rightBoundTime = rightSearchIdx < partData.length
          ? partData[rightSearchIdx].time
          : duration;

        minDragPxRef.current   = (leftBoundTime  - blockStartTime) * pixelsPerMs;
        maxDragPxRef.current   = (rightBoundTime - blockEndTime)   * pixelsPerMs;
        moveDragStartRef.current   = e.clientX;
        moveDraggedIdxRef.current  = atIdx;
        moveDraggedDomRef.current  = e.currentTarget;
        moveDragPixelsRef.current  = 0;

        if (moveDraggedDomRef.current) {
          moveDraggedDomRef.current.style.zIndex = '100';
          moveDraggedDomRef.current.style.overflow = 'visible';
        }
        return;
      }

      // 非 Move Mode：維持原本行為，攔截事件
      e.stopPropagation();

      // 邊緣 resize 邏輯
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
        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: index }]));
        return;
      }
      if (block.color.R === 0 && block.color.G === 0 && block.color.B === 0) {
        dispatch(updateMultiSelectedBlocks([]));
        return;
      }

      const anchorBlock = multiSelectedBlocks[0];
      if (e.shiftKey && anchorBlock && anchorBlock.armorIndex === armorIndex && anchorBlock.partIndex === partIndex) {
        const startIdx = anchorBlock.blockIndex;
        const endIdx = index;
        const selectionStart = Math.min(startIdx, endIdx);
        const selectionEnd = Math.max(startIdx, endIdx);
        const newMultiSelected = [];
        for (let i = selectionStart; i <= selectionEnd; i++) {
          const currentBlock = timelineBlocks[i];
          const isBlackTransition = currentBlock.color.R === 0 && currentBlock.color.G === 0 && currentBlock.color.B === 0;
          if (!isBlackTransition) {
            newMultiSelected.push({ armorIndex, partIndex, blockIndex: i });
          }
        }
        dispatch(updateMultiSelectedBlocks(newMultiSelected));
      } else {
        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: index }]));
      }
    };

    const startBlockResize = (e, tlIdx, edge) => {
      const block = timelineBlocks[tlIdx];
      const partData = actionTable[armorIndex][partIndex];
      const atIdx = partData.findIndex(entry => entry.time === block.startTime);
      if (atIdx === -1) return;

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pixelsPerMs = rect.width / duration;

      const blockStartTime = partData[atIdx].time;
      const blockEndTime   = partData[atIdx + 1]?.time ?? duration;
      const isBlackEntry = (entry) => entry.color.R === 0 && entry.color.G === 0 && entry.color.B === 0;

      const domEl = blockDomRefs.current[tlIdx];
      if (!domEl) return;

      const nextBlackDom    = edge === 'right' ? (blockDomRefs.current[tlIdx + 1] ?? null) : null;
      const nextBlackBlock  = edge === 'right' ? (timelineBlocks[tlIdx + 1] ?? null) : null;
      const nextBlackOrigPct = nextBlackBlock ? (nextBlackBlock.durationTime / duration) * 100 : 0;

      resizeEdgeRef.current      = edge;
      resizeDragStartRef.current = e.clientX;
      resizedAtIdxRef.current    = atIdx;
      resizedDomRef.current      = domEl;
      resizeDragPixelsRef.current = 0;
      resizeOrigPctRef.current   = (block.durationTime / duration) * 100;
      domEl.style.zIndex = '100';

      if (edge === 'right') {
        let rightSearchIdx = atIdx + 2;
        while (rightSearchIdx < partData.length && isBlackEntry(partData[rightSearchIdx])) rightSearchIdx++;
        const rightBoundTime = rightSearchIdx < partData.length ? partData[rightSearchIdx].time : duration;
        maxResizePxRef.current = (rightBoundTime - blockEndTime) * pixelsPerMs;
        minResizePxRef.current = -(blockEndTime - blockStartTime - STRETCH_MIN_MS) * pixelsPerMs;
      } else {
        let leftSearchIdx = atIdx - 1;
        while (leftSearchIdx >= 0 && isBlackEntry(partData[leftSearchIdx])) leftSearchIdx--;
        const leftBoundTime = leftSearchIdx >= 0 ? (partData[leftSearchIdx + 1]?.time ?? 0) : 0;
        minResizePxRef.current = (leftBoundTime - blockStartTime) * pixelsPerMs;
        maxResizePxRef.current = (blockEndTime - STRETCH_MIN_MS - blockStartTime) * pixelsPerMs;
      }

      const handleResizeMouseMove = (ev) => {
        const rawDelta = ev.clientX - resizeDragStartRef.current;
        const clamped  = Math.max(minResizePxRef.current, Math.min(maxResizePxRef.current, rawDelta));
        resizeDragPixelsRef.current = clamped;
        const origPct = resizeOrigPctRef.current;
        if (resizeEdgeRef.current === 'right') {
          resizedDomRef.current.style.width = `calc(${origPct}% + ${clamped}px)`;
          if (nextBlackDom) {
            nextBlackDom.style.width = `calc(${nextBlackOrigPct}% - ${clamped}px)`;
          }
        } else {
          resizedDomRef.current.style.marginLeft = `${clamped}px`;
          resizedDomRef.current.style.width      = `calc(${origPct}% + ${-clamped}px)`;
        }
      };

      const handleResizeMouseUp = () => {
        const dragPx   = resizeDragPixelsRef.current;
        const savedIdx = resizedAtIdxRef.current;
        const savedEdge = resizeEdgeRef.current;

        if (savedIdx !== null && dragPx !== 0 && timelineRef?.current) {
          const r = timelineRef.current.getBoundingClientRect();
          const pxPerMs = r.width / durationRef.current;
          const dt = Math.round((dragPx / pxPerMs) / 50) * 50;

          if (dt !== 0) {
            const updatedTable = produce(actionTableRef.current, (draft) => {
              const pd = draft[armorIndex][partIndex];
              let i = savedIdx;
              if (savedEdge === 'right') {
                if (pd[i + 1] !== undefined) pd[i + 1].time += dt;
                if (dt > 0) {
                  while (pd[i + 2] !== undefined && pd[i + 2].time <= pd[i + 1].time) {
                    pd.splice(i + 2, 1);
                  }
                }
              } else {
                if (pd[i] !== undefined) pd[i].time += dt;
                if (dt < 0) {
                  while (i > 0 && pd[i - 1] !== undefined && pd[i - 1].time >= pd[i].time) {
                    pd.splice(i - 1, 1);
                    i--;
                  }
                }
              }
            });
            dispatch(updateActionTable(updatedTable));
          }
        }

        if (nextBlackDom) nextBlackDom.style.width = '';
        if (resizedDomRef.current) {
          resizedDomRef.current.style.width      = '';
          resizedDomRef.current.style.marginLeft = '';
          resizedDomRef.current.style.zIndex     = '';
        }
        resizeEdgeRef.current      = null;
        resizeDragStartRef.current = null;
        resizedAtIdxRef.current    = null;
        resizedDomRef.current      = null;
        resizeDragPixelsRef.current = 0;
        setHoverEdge(null);

        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup',   handleResizeMouseUp);
      };

      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup',   handleResizeMouseUp);
    };

    return (
      <div
        className="timeline"
        ref={timelineRef}
        style={{
          height: `${height}%`,
          width: "100%",
          display: "flex",
          alignItems: "center",
          overflow: moveMode ? "visible" : "hidden",
          border: "1px solid rgb(63, 63, 63)",
          padding: "0px",
          opacity: hidden ? 0 : 1,
          pointerEvents: hidden ? "none" : "auto",
        }}
      >

      {timelineBlocks.map((block, index) => {
        const isCurrentlyInMultiSelect = multiSelectedBlocks.some(b => 
          b.armorIndex === armorIndex && 
          b.partIndex === partIndex && 
          b.blockIndex === index
        );

        const isPasteTarget = isCopying && isCurrentlyInMultiSelect;
        const isCopySource = isCopying && clipboard?.sourceBlocks?.some(b => 
          b.armorIndex === armorIndex && 
          b.partIndex === partIndex && 
          b.blockIndex === index
        );
        const isNormalSelected = !isCopying && isCurrentlyInMultiSelect;

        const color = block.color || { R: 0, G: 0, B: 0, A: 1 };
        const currentBlockData = actionTable[armorIndex]?.[partIndex]?.[index];
        const isFade = currentBlockData?.linear === 1;

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

        let selectionBorderColor = "#FFA500";
        if (colorDistance(color, { R: 255, G: 165, B: 0 }) < 200) {
          selectionBorderColor = "#00FFFF";
        }

        const isBlackBlock = color.R === 0 && color.G === 0 && color.B === 0;

        const blockStyle = {
          position: "absolute",
          left: `${(block.startTime / duration) * 100}%`,
          background: backgroundStyle,
          width: `${(block.durationTime / duration) * 100}%`,
          height: "90%",
          borderRadius: "7px",
          zIndex: (isPasteTarget || isCopySource) ? 10 : 1,
          border: isPasteTarget
            ? "4px solid #00FF00"
            : (isCopySource || isNormalSelected ? `3px solid ${selectionBorderColor}` : "none"),
          boxSizing: "border-box",
          cursor: "default",
        };

        const EDGE_THRESHOLD = 8;
        const handleBlockMouseMove = (ev) => {
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
          if (moveMode || resizeDragStartRef.current !== null) return;
          if (hoverEdge?.index === index) setHoverEdge(null);
        };

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
          </div>
        );
      })}
      </div>
    );
  }
);

export default Timeline;
