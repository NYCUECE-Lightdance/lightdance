import React, { useRef, useState, useEffect, forwardRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  updateActionTable,
  updateTimelineBlocks,
  updateSelectedBlock,
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

// Timeline 組件
const Timeline = forwardRef(
  ({ zoomValue, height, armorIndex, partIndex, hidden }, timelineRef) => {
    const dispatch = useDispatch();

    // **狀態變數**

    // 方塊相關狀態
    const [dragging, setDragging] = useState(false); // 是否正在拖動方塊
    const [draggedBlockIndex, setDraggedBlockIndex] = useState(null); // 被拖動的方塊索引
    const [dragStartpoint, setDragStartpoint] = useState(null); // 拖動的起始點

    // move mode ref and state
    const [movingBlockIdx, setMovingBlockIdx] = useState(null); 
    const movingBlockIdxRef = useRef(null);  // 與 movingBlockIdx 同步的 ref，供 callback 讀取
    const moveDragPixelsRef = useRef(0);     
    const draggedBlockDomRef = useRef(null); 
    const moveDragStartRef = useRef(0);      
    const minDragPxRef = useRef(-Infinity);  
    const maxDragPxRef = useRef(Infinity);   
    const commitMoveRef = useRef(null);

    // 畫布相關狀態
    const canvasRef = useRef(null); // timeline 的畫布引用
    const [canvasWidth, setCanvasWidth] = useState(1600); // 預設畫布寬度
    const [canvasHeight, setCanvasHeight] = useState(100); // 固定畫布高度

    // Redux 狀態
    const timelineBlocks = useSelector(
      (state) => state.profiles.timelineBlocks?.[armorIndex]?.[partIndex] || [] // 當前時間軸的方塊數據
    );
    const actionTable = useSelector((state) => state.profiles.actionTable); // 原始動作表
    const tempActionTable = useSelector(
      (state) => state.profiles.tempActionTable
    ); // 臨時動作表
    const duration = useSelector((state) => state.profiles.duration); // 總時長
    const selectedBlock = useSelector((state) => state.profiles.selectedBlock); // 全局選中方塊
    const multiSelectedBlocks = useSelector((state) => state.profiles.multiSelectedBlocks); // 全局多選中方塊
    const moveMode = useSelector((state) => state.profiles.moveMode); // 移動模式
    const blackthreshold = 10;

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
          dispatch(updateSelectedBlock({})); // 更新 Redux
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
          tempActionTable[armorIndex][partIndex]?.[index + 1]?.time ?? duration;

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

    const commitMove = () => {
      const blockIdx = movingBlockIdxRef.current;
      if (blockIdx === null) return;

      const rect = timelineRef.current?.getBoundingClientRect();
      if (rect) {
        const orig = actionTable[armorIndex][partIndex];
        const blockStart = orig[blockIdx]?.time;
        const blockEnd   = orig[blockIdx + 1]?.time;

        if (blockStart !== undefined && blockEnd !== undefined) {
          const leftBoundary  = orig[blockIdx - 1]?.time ?? 0;
          const rightBoundary = orig[blockIdx + 2]?.time ?? duration;
          const timeDelta = Math.floor((moveDragPixelsRef.current / rect.width * duration) / 50) * 50;

          let clampedDelta = timeDelta;
          if (blockStart + clampedDelta < leftBoundary)  clampedDelta = leftBoundary - blockStart;
          if (blockEnd   + clampedDelta > rightBoundary) clampedDelta = rightBoundary - blockEnd;
          // 絕對邊界安全夾：確保不超出音軌範圍
          if (blockStart + clampedDelta < 0)        clampedDelta = -blockStart;
          if (blockEnd   + clampedDelta > duration) clampedDelta = duration - blockEnd;
          // 嚴格順序保證：blockStart 不能等於左鄰居時間（避免兩 entry 時間相同）
          if (blockStart + clampedDelta === leftBoundary && blockIdx > 0) {
            const adjusted = clampedDelta + 50;
            if (blockEnd + adjusted <= rightBoundary && blockEnd + adjusted <= duration) {
              clampedDelta = adjusted;
            }
          }
          if (clampedDelta !== 0) {
            const finalTable = produce(actionTable, (draft) => {
              draft[armorIndex][partIndex][blockIdx].time     = blockStart + clampedDelta;
              draft[armorIndex][partIndex][blockIdx + 1].time = blockEnd   + clampedDelta;
            });
            dispatch(updateActionTable(finalTable));
          }
        }
      }

      if (draggedBlockDomRef.current) {
        draggedBlockDomRef.current.style.transform = "";
        draggedBlockDomRef.current.style.zIndex    = "";
        draggedBlockDomRef.current = null;
      }
      moveDragPixelsRef.current    = 0;
      movingBlockIdxRef.current    = null;
      setMovingBlockIdx(null);
      dispatch(updateMoveMode(false)); // 退出移動模式
    };
    commitMoveRef.current = commitMove; 

    // tracking mousemove 
    useEffect(() => {
      if (movingBlockIdx === null) return;

      const onMouseMove = (e) => {
        const rawDelta = e.clientX - moveDragStartRef.current;
        const clamped  = Math.max(minDragPxRef.current, Math.min(maxDragPxRef.current, rawDelta));
        moveDragPixelsRef.current = clamped;
        if (draggedBlockDomRef.current) {
          draggedBlockDomRef.current.style.transform = `translateX(${clamped}px)`;
          draggedBlockDomRef.current.style.zIndex    = "10";
        }
      };

      document.addEventListener("mousemove", onMouseMove);
      return () => document.removeEventListener("mousemove", onMouseMove);
    }, [movingBlockIdx]);

    useEffect(() => {
      if (!moveMode) {
        // moveMode is cancelled（press M or icon）
        if (movingBlockIdxRef.current !== null) {
          commitMoveRef.current();
        }
        return;
      }

      const onMouseDown = () => {
        if (movingBlockIdxRef.current !== null) {
          commitMoveRef.current(); // MOVING → commit 位置並退出
        } else {
          dispatch(updateMoveMode(false)); // READY → 直接退出，不須 commit
        }
      };

      document.addEventListener("mousedown", onMouseDown);
      return () => document.removeEventListener("mousedown", onMouseDown);
    }, [moveMode]);

    // 處理鼠標按下事件
    const handleMouseDown = (e, index) => {
      e.stopPropagation();

      const block = timelineBlocks[index];
      const isBlack = block.color.R === 0 && block.color.G === 0 && block.color.B === 0;

      if (isBlack) {
        dispatch(updateSelectedBlock({}));
        dispatch(updateMultiSelectedBlocks([]));
        return;
      }

      // ── 移動模式：點擊選取方塊，開始跟隨滑鼠 ──────────────────────────
      if (moveMode) {
        // 阻止此 mousedown 傳遞到 document 的 onMouseDown（避免立即 commit）
        e.nativeEvent.stopImmediatePropagation();

        // 若已有方塊在移動，先 commit 它再退出
        if (movingBlockIdxRef.current !== null) {
          commitMoveRef.current();
          return;
        }

        dispatch(updateSelectedBlock({ armorIndex, partIndex, blockIndex: index }));
        dispatch(updateMultiSelectedBlocks([]));

        draggedBlockDomRef.current = e.currentTarget;
        moveDragStartRef.current = e.clientX;
        moveDragPixelsRef.current = 0;

        // 預算左右邊界（像素），供 mousemove 夾緊用
        if (timelineRef?.current) {
          const rect = timelineRef.current.getBoundingClientRect();
          const orig = actionTable[armorIndex][partIndex];
          const bs = orig[index]?.time;
          const be = orig[index + 1]?.time;
          if (bs !== undefined && be !== undefined) {
            const scale = rect.width / duration;
            const neighborMin = (orig[index - 1]?.time ?? 0)       - bs;
            const neighborMax = (orig[index + 2]?.time ?? duration) - be;
            const trackMin    = 0        - bs; // blockStart 不能低於 0
            const trackMax    = duration - be; // blockEnd 不能超過 duration
            minDragPxRef.current = Math.max(neighborMin, trackMin) * scale;
            maxDragPxRef.current = Math.min(neighborMax, trackMax) * scale;
          } else {
            minDragPxRef.current = 0;
            maxDragPxRef.current = 0;
          }
        }

        movingBlockIdxRef.current = index;
        setMovingBlockIdx(index); // 觸發 useEffect 掛載全域事件
        return;
      }

      // ── 一般模式：Shift 多選 或 單選 + 拖曳縮放 ──────────────────────
      if (e.shiftKey && selectedBlock && selectedBlock.armorIndex === armorIndex && selectedBlock.partIndex === partIndex) {
        const selectionStart = Math.min(selectedBlock.blockIndex, index);
        const selectionEnd   = Math.max(selectedBlock.blockIndex, index);
        const newMultiSelected = [];
        for (let i = selectionStart; i <= selectionEnd; i++) {
          const b = timelineBlocks[i];
          if (!(b.color.R === 0 && b.color.G === 0 && b.color.B === 0)) {
            newMultiSelected.push({ armorIndex, partIndex, blockIndex: i });
          }
        }
        dispatch(updateMultiSelectedBlocks(newMultiSelected));
      } else {
        dispatch(updateMultiSelectedBlocks([]));
        setDragging(true);
        setDraggedBlockIndex(index);
        setDragStartpoint(e.clientX);
        draggedBlockDomRef.current = e.currentTarget;
        moveDragPixelsRef.current = 0;
        dispatch(updateSelectedBlock({ armorIndex, partIndex, blockIndex: index }));
      }
    };

    // 處理鼠標放開事件
    const handleMouseUp = () => {
      if (!dragging) return;
      dispatch(updateActionTable(tempActionTable));
      setDragging(false);
      setDraggedBlockIndex(null);
    };

    // 處理鼠標移動事件，用於拖動方塊
    const handleMouseMove = (e) => {
      if (!dragging || draggedBlockIndex === null) return;
      if (!timelineRef?.current) {
        console.warn("timelineRef is not initialized");
        return;
      }

      // ── 一般拖曳（平移整個方塊）：更新 Redux 臨時狀態 ───────────────────
      const rect = timelineRef.current.getBoundingClientRect();
      const draggedDistance = e.clientX - dragStartpoint;
      const draggedTime =
        Math.floor(((draggedDistance / rect.width) * duration) / 50) * 50;

      const updatedTable = produce(tempActionTable, (draft) => {
        const partData = draft[armorIndex][partIndex];
        const direction = e.clientX > dragStartpoint ? "right" : "left";
        if (direction === "right") {
          if (tempActionTable[armorIndex][partIndex][draggedBlockIndex + 2]) {
            partData[draggedBlockIndex].time =
              actionTable[armorIndex][partIndex][draggedBlockIndex].time + draggedTime;
            const nextBlockTime =
              tempActionTable[armorIndex][partIndex][draggedBlockIndex + 2].time;
            const currentBlockTime =
              tempActionTable[armorIndex][partIndex][draggedBlockIndex + 1].time;
            if (nextBlockTime - currentBlockTime > blackthreshold) {
              partData[draggedBlockIndex + 1].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time + draggedTime;
            } else {
              partData[draggedBlockIndex + 1].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time + draggedTime;
              partData[draggedBlockIndex + 2].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time + draggedTime + blackthreshold;
            }
          } else {
            if (actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time + draggedTime < duration) {
              partData[draggedBlockIndex].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex].time + draggedTime;
              partData[draggedBlockIndex + 1].time =
                actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time + draggedTime;
            } else {
              partData[draggedBlockIndex + 1].time = duration;
            }
          }
        } else {
          if (actionTable[armorIndex][partIndex][draggedBlockIndex].time + draggedTime > 0) {
            partData[draggedBlockIndex + 1].time =
              actionTable[armorIndex][partIndex][draggedBlockIndex + 1].time + draggedTime;
            partData[draggedBlockIndex].time =
              actionTable[armorIndex][partIndex][draggedBlockIndex].time + draggedTime;
            if (tempActionTable[armorIndex][partIndex][draggedBlockIndex - 2]) {
              const previousBlockTime =
                tempActionTable[armorIndex][partIndex][draggedBlockIndex].time;
              const secondPreviousBlockTime =
                tempActionTable[armorIndex][partIndex][draggedBlockIndex - 1].time;
              if (previousBlockTime - secondPreviousBlockTime < blackthreshold) {
                partData[draggedBlockIndex - 1].time =
                  actionTable[armorIndex][partIndex][draggedBlockIndex].time + draggedTime - blackthreshold;
              }
            }
          }
        }
      });

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
          overflow: "hidden",
          border: "1px solid rgb(63, 63, 63)",
          padding: "0px",
          opacity: hidden ? 0 : 1, // 如果 hidden 为 true，则隐藏内容
          pointerEvents: hidden ? "none" : "auto", // 禁用鼠标事件
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {timelineBlocks.map((block, index) => {
          const color = block.color || { R: 0, G: 0, B: 0, A: 1 };
          const isSelected =
            selectedBlock?.armorIndex === armorIndex &&
            selectedBlock?.partIndex === partIndex &&
            selectedBlock?.blockIndex === index;

          const isMultiSelected = multiSelectedBlocks.some(b => 
              b.armorIndex === armorIndex && 
              b.partIndex === partIndex && 
              b.blockIndex === index
          );

          // 計算顏色距離的函式
          const colorDistance = (color1, color2) => {
            return Math.sqrt(
              Math.pow(color1.R - color2.R, 2) +
                Math.pow(color1.G - color2.G, 2) +
                Math.pow(color1.B - color2.B, 2)
            );
          };

          // 預設選取框顏色
          let selectionBorderColor = "#FFA500"; // 橘色
          const colorThreshold = 200; // 設定距離閾值

          // 如果選取的方塊顏色和預設選取框顏色相似，就改變選取框顏色
          if (colorDistance(color, { R: 255, G: 165, B: 0 }) < colorThreshold) {
            selectionBorderColor = "#00FFFF"; // 改成青色
          }

          const currentBlockData = actionTable[armorIndex]?.[partIndex]?.[index];
          const isFade = currentBlockData?.linear === 1;

          let backgroundStyle;

          if (isFade) {
            const partTimeline = actionTable[armorIndex]?.[partIndex];
            const nextBlock = partTimeline?.[index + 1];
            const nextNextBlock = partTimeline?.[index + 2];
            const isBlack = (c) => c && c.R === 0 && c.G === 0 && c.B === 0;

            let endColor = { R: 0, G: 0, B: 0, A: 1 }; // Default to black

            if (nextBlock && !isBlack(nextBlock.color)) {
              endColor = nextBlock.color;
            } else if (nextNextBlock) {
              endColor = nextNextBlock.color;
            }

            const startColorString = `rgba(${color.R}, ${color.G}, ${color.B}, ${color.A})`;
            const endColorString = `rgba(${endColor.R}, ${endColor.G}, ${endColor.B}, ${endColor.A})`;
            backgroundStyle = `linear-gradient(to right, ${startColorString}, ${endColorString})`;
          } else {
            backgroundStyle = `rgba(${color.R}, ${color.G}, ${color.B}, ${color.A})`;
          }

          // 設定 blockStyle
          const isBlackBlock = color.R === 0 && color.G === 0 && color.B === 0;
          const blockStyle = {
            display: "inline-block",
            background: backgroundStyle,
            width: `${(block.durationTime / duration) * 100}%`,
            height: "90%",
            position: "relative",
            borderRadius: "7px",
            border: isSelected || isMultiSelected ? `3px solid ${selectionBorderColor}` : "none",
            boxSizing: "border-box",
            zIndex: 1,
            cursor: moveMode && !isBlackBlock ? "grab" : "pointer",
          };

          return (
            <div
              style={blockStyle}
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
