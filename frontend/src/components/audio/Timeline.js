import React, { useRef, useState, useEffect, forwardRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  updateActionTable,
  updateTimelineBlocks,
  updateSelectedBlock,
  updateTempActionTable,
  updateIsColorChangeActive,
} from "../../redux/actions";
import cloneDeep from "lodash/cloneDeep";
import { produce } from "immer";

// Timeline 組件
const Timeline = forwardRef(
  ({ zoomValue, height, armorIndex, partIndex, hidden }, timelineRef) => {
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
    const actionTable = useSelector((state) => state.profiles.actionTable); // 原始動作表
    const tempActionTable = useSelector(
      (state) => state.profiles.tempActionTable
    ); // 臨時動作表
    const duration = useSelector((state) => state.profiles.duration); // 總時長
    const selectedBlock = useSelector((state) => state.profiles.selectedBlock); // 全局選中方塊
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
      e.stopPropagation();

      const block = timelineBlocks[index];
      if (block.color.R === 0 && block.color.G === 0 && block.color.B === 0) {
        dispatch(updateSelectedBlock({})); // 更新 Redux
        return;
      }

      setDragging(true);
      setDraggedBlockIndex(index);
      setDragStartpoint(e.clientX); // 記錄鼠標按下的位置

      // 通知父组件更新全局选中状态
      dispatch(
        updateSelectedBlock({ armorIndex, partIndex, blockIndex: index })
      );
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

          // 設定 blockStyle
          const blockStyle = {
            display: "inline-block",
            backgroundColor: `rgba(${color.R}, ${color.G}, ${color.B}, ${color.A})`,
            width: `${(block.durationTime / duration) * 100}%`,
            height: "90%",
            position: "relative",
            borderRadius: "7px",
            border: isSelected ? `3px solid ${selectionBorderColor}` : "none",
            boxSizing: "border-box",
            zIndex: 1,
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
              style={{
                ...blockStyle,
                ...(hoveredBlock?.index === index
                  ? { opacity: 0.85 } // 懸停時透明度
                  : { opacity: 1 }), // 預設透明度
              }}
              className="timeline-block"
              onMouseDown={(e) => handleMouseDown(e, index)} // 點擊方塊選中
            >
              {" "}
              {/*
              {/* 如果不是黑色方块，渲染左右虚拟检测块  
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
