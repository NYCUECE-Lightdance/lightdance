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
    const [hoveredBlock, setHoveredBlock] = useState({
      leftedge: false, // 是否在左邊緣
      rightedge: false, // 是否在右邊緣
      leftindex: null, // 左邊緣的方塊索引
      rightindex: null, // 右邊緣的方塊索引
    });
    const [dragging, setDragging] = useState(false); // 是否正在拖動方塊
    const [draggedBlockIndex, setDraggedBlockIndex] = useState(null); // 被拖動的方塊索引
    const [dragStartpoint, setDragStartpoint] = useState(null); // 拖動的起始點

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

    // Move Mode：進入時掛載全域滑鼠事件，離開時清除
    // 操作邏輯：點 block → 開始跟蹤滑鼠移動（不需按住）→ 再點任意位置 → 提交並退出
    useEffect(() => {
      if (!moveMode) {
        // move mode 結束時確保 DOM 樣式清除
        if (moveDraggedDomRef.current) {
          moveDraggedDomRef.current.style.transform = '';
          moveDraggedDomRef.current.style.zIndex = '';
          moveDraggedDomRef.current.style.overflow = '';
        }
        moveDragStartRef.current = null;
        moveDraggedIdxRef.current = null;
        moveDraggedDomRef.current = null;
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
          tempActionTable[armorIndex][partIndex]?.[index + 1]?.time || duration;

        const { R, G, B, A } = entry.color || {};
        const newBlock = {
          startTime,
          durationTime: nextStartTime - startTime,
          color: { R, G, B, A },
        };

        const lastBlock = newBlocks[index - 1];
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

        minDragPxRef.current   = (leftBoundTime  - blockStartTime) * pixelsPerMs;
        maxDragPxRef.current   = (rightBoundTime - blockEndTime)   * pixelsPerMs;
        moveDragStartRef.current   = e.clientX;
        moveDraggedIdxRef.current  = atIdx;   // ← 存 actionTable index，不是 timelineBlocks index
        moveDraggedDomRef.current  = blockDomRefs.current[index] ?? null;
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
        setDragging(true);
        setDraggedBlockIndex(index);
        setDragStartpoint(e.clientX);

        // Notify parent component to update global selected state
        dispatch(updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: index }]));
      }
    };

    // 處理鼠標放開事件
    const handleMouseUp = () => {
      if (dragging) {
        setDragging(false); // 停止拖動
        setDraggedBlockIndex(null);
        dispatch(updateActionTable(tempActionTable)); // 更新 actionTable
        // console.log(tempActionTable);
      }
    };

    // 處理鼠標移動事件，用於拖動方塊
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

    return (
      <div
        className="timeline"
        ref={timelineRef} // 設置 ref
        style={{
          height: `${height}%`, // 動態設置高度
          width: "100%",
          display: "flex",
          alignItems: "center",
          overflow: moveMode ? "visible" : "hidden", // move mode 時允許 block 超出容器邊界顯示
          border: "1px solid rgb(63, 63, 63)",
          padding: "0px",
          opacity: hidden ? 0 : 1, // 如果 hidden 为 true，则隐藏内容
          pointerEvents: hidden ? "none" : "auto", // 禁用鼠标事件
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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

          const handleMouseLeave2 = (edge) => {
            setHoveredBlock((prev) => {
              const updatedBlock = { ...prev, [edge]: false };
              if (edge === "leftedge") updatedBlock.leftindex = null;
              if (edge === "rightedge") updatedBlock.rightindex = null;
              return updatedBlock;
            });
          };

          const handleMouseMoveLeft = (index) => {
            setHoveredBlock((prev) => ({
              ...prev,
              leftedge: true,
              leftindex: index,
            }));
          };

          const handleMouseMoveRight = (index) => {
            setHoveredBlock((prev) => ({
              ...prev,
              rightedge: true,
              rightindex: index,
            }));
          };
          return (
            <div
              key={index}
              ref={(el) => { blockDomRefs.current[index] = el; }}
              style={{
                ...blockStyle,
                cursor: moveMode && !isBlackBlock ? 'grab' : 'default',
                ...(hoveredBlock?.index === index
                  ? { opacity: 0.85 } // 懸停時透明度
                  : { opacity: 1 }), // 預設透明度
              }}
              className="timeline-block"
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
