import React, { useRef, useState, useEffect, forwardRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  updateActionTable,
  updateTimelineBlocks,
  updateTempActionTable,
  updateIsColorChangeActive,
  updateMultiSelectedBlocks,
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
    const [dragging, setDragging] = useState(false); // 是否正在拖動方塊位置
    const [resizing, setResizing] = useState(false); // 是否正在調整方塊寬度
    const [draggedBlockIndex, setDraggedBlockIndex] = useState(null); // 被拖動的方塊索引
    const [dragStartpoint, setDragStartpoint] = useState(null); // 拖動的起始點（鼠標位置）
    const [dragStartTime, setDragStartTime] = useState(null); // 拖動開始時的色塊初始 startTime
    const [resizeStartpoint, setResizeStartpoint] = useState(null); // 寬度調整的起始點（鼠標位置）
    const [resizeStartTime, setResizeStartTime] = useState(null); // 寬度調整時的初始時間點

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

      // 新格式: 直接使用 startTime/endTime 生成視覺化方塊
      const newBlocks = [];
      tempActionTable[armorIndex][partIndex].forEach((block, index) => {
        // 新格式已經有 startTime 和 endTime
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
<<<<<<< HEAD
      // 如果點擊在右邊緣（調整寬度區域），則忽略拖動邏輯
      const blockRect = e.currentTarget.getBoundingClientRect();
      const distanceFromRight = blockRect.right - e.clientX;
      if (distanceFromRight <= 10) {
        // 右邊緣調整，不執行拖動邏輯
        return;
      }

      e.stopPropagation();

      const partData = tempActionTable?.[armorIndex]?.[partIndex];
      if (!partData || !partData[index]) return;

      const currentBlock = partData[index];

      setDragging(true);
      setDraggedBlockIndex(index);
      setDragStartpoint(e.clientX); // 記錄鼠標按下的位置
      setDragStartTime(currentBlock.startTime); // 記錄色塊的初始 startTime
=======
      e.stopPropagation();

      const block = timelineBlocks[index];

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
>>>>>>> 7ca4da396943de1f136440c3745a54867cf826b5

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

    // 處理右邊緣拖動事件（調整當前色塊寬度）
    const handleResizeMouseDown = (e, index) => {
      e.stopPropagation();
      const nextBlockIdx = index + 1;
      const partData = tempActionTable?.[armorIndex]?.[partIndex];

      // 檢查是否有下一個色塊
      if (!partData || !partData[nextBlockIdx]) {
        console.warn("No next block to resize");
        return;
      }

      // 新格式: 使用 startTime 和 endTime
      const currentBlock = partData[index];
      const currentEndTime = currentBlock.endTime;

      console.log(`[Resize Start] Dragging right edge of block ${index}`);
      console.log(`  Current block: ${currentBlock.startTime}ms - ${currentEndTime}ms`);
      console.log(`  Current block width: ${currentEndTime - currentBlock.startTime}ms`);

      setResizing(true);
      setDraggedBlockIndex(index);
      setResizeStartpoint(e.clientX);
      setResizeStartTime(currentEndTime); // 記錄當前色塊的初始結束時間

      // 同時選中該方塊
      dispatch(
        updateSelectedBlock({ armorIndex, partIndex, blockIndex: index })
      );
    };

    // 手動合併相鄰的相同顏色色塊
    const handleMergeBlocks = () => {
      if (
        !selectedBlock ||
        selectedBlock.armorIndex !== armorIndex ||
        selectedBlock.partIndex !== partIndex
      ) {
        console.warn("No valid block selected for merging");
        return;
      }

      const blockIndex = selectedBlock.blockIndex;
      const timeline = actionTable[armorIndex]?.[partIndex];
      
      if (!timeline || blockIndex >= timeline.length - 1) {
        console.warn("Cannot merge: no next block or invalid selection");
        return;
      }

      const currentBlock = timeline[blockIndex];
      const nextBlock = timeline[blockIndex + 1];

      // 檢查兩個色塊之間是否有間隙
      if (currentBlock.endTime !== nextBlock.startTime) {
        console.warn(`Cannot merge: there is a gap between blocks (${currentBlock.endTime}ms to ${nextBlock.startTime}ms)`);
        return;
      }

      // 合併兩個色塊 - 將當前色塊的 endTime 設為下一個色塊的 endTime，並刪除下一個色塊
      const updatedActionTable = produce(actionTable, (draft) => {
        const draftTimeline = draft[armorIndex][partIndex];
        draftTimeline[blockIndex].endTime = draftTimeline[blockIndex + 1].endTime;
        draftTimeline.splice(blockIndex + 1, 1);
      });

      dispatch(updateActionTable(updatedActionTable));
      console.log(`Merged block ${blockIndex} (${currentBlock.startTime}-${currentBlock.endTime}ms) with block ${blockIndex + 1} (${nextBlock.startTime}-${nextBlock.endTime}ms)`);
    };

    // 處理鼠標放開事件
    const handleMouseUp = () => {
      if (dragging) {
        setDragging(false); // 停止拖動
        setDraggedBlockIndex(null);
        setDragStartTime(null); // 清除初始時間
        dispatch(updateActionTable(tempActionTable)); // 更新 actionTable
        // console.log(tempActionTable);
      }
      if (resizing) {
        setResizing(false); // 停止調整寬度
        setDraggedBlockIndex(null);
        dispatch(updateActionTable(tempActionTable)); // 更新 actionTable
      }
    };

    // 處理鼠標移動事件，用於拖動方塊或調整寬度
    const handleMouseMove = (e) => {
      // 如果正在調整寬度
      if (resizing && draggedBlockIndex !== null) {
        if (!timelineRef?.current) return;

        const rect = timelineRef.current.getBoundingClientRect();
        // 計算鼠標移動距離轉換為時間（對齊 50ms）
        const resizedDistance = e.clientX - resizeStartpoint;
        const resizedTime = Math.floor(((resizedDistance / rect.width) * duration) / 50) * 50;

        const updatedTable = produce(tempActionTable, (draft) => {
          const partData = draft[armorIndex][partIndex];
          const currentBlock = partData[draggedBlockIndex];
          const oldEndTime = currentBlock.endTime;

          // 計算當前色塊的新結束時間
          let newEndTime = resizeStartTime + resizedTime;

          // 確保當前色塊至少 50ms 寬
          newEndTime = Math.max(currentBlock.startTime + 50, newEndTime);

          // 確保不超過音頻總長度
          newEndTime = Math.min(newEndTime, duration);

          // 計算位移量
          const timeShift = newEndTime - oldEndTime;

          console.log(`[Resize] Block ${draggedBlockIndex} width: ${oldEndTime - currentBlock.startTime}ms → ${newEndTime - currentBlock.startTime}ms`);
          console.log(`[Resize] Time shift: ${timeShift}ms`);

          // 更新當前色塊的結束時間
          currentBlock.endTime = newEndTime;

          // 移動所有後續色塊（保持它們的寬度）
          for (let i = draggedBlockIndex + 1; i < partData.length; i++) {
            partData[i].startTime += timeShift;
            partData[i].endTime += timeShift;

            // 確保不超過音頻總長度
            if (partData[i].endTime > duration) {
              partData[i].endTime = duration;
              partData[i].startTime = Math.max(0, duration - (partData[i].endTime - partData[i].startTime));
            }
          }
        });

        dispatch(updateTempActionTable(updatedTable));
        return; // 寬度調整時不執行拖動邏輯
      }

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
      const draggedDistance = e.clientX - dragStartpoint; // 拖動的像素距離
      const draggedTime = Math.floor(((draggedDistance / rect.width) * duration) / 50) * 50; // 將拖動距離轉換為時間

      const updatedTable = produce(tempActionTable, (draft) => {
        const partData = draft[armorIndex][partIndex]; // 獲取當前部位的數據
        const block = partData[draggedBlockIndex];
        if (!block) return;

        // 新格式: 計算新的 startTime 和 endTime（保持寬度不變）
        const blockWidth = block.endTime - block.startTime;
        let newStartTime = Math.max(0, dragStartTime + draggedTime); // 使用初始 startTime

        // 確保不超過下一個色塊的開始時間（保持至少 50ms 的間隔）
        const nextBlockIdx = draggedBlockIndex + 1;
        if (nextBlockIdx < partData.length) {
          const nextBlockStartTime = partData[nextBlockIdx].startTime;
          newStartTime = Math.min(newStartTime, nextBlockStartTime - blockWidth - 50);
        }

        // 確保不超過音頻總長度
        newStartTime = Math.min(newStartTime, duration - blockWidth);

        // 確保不超過前一個色塊的結束時間（保持至少 50ms 的間隔）
        if (draggedBlockIndex > 0) {
          const prevBlockEndTime = partData[draggedBlockIndex - 1].endTime;
          newStartTime = Math.max(newStartTime, prevBlockEndTime + 50);
        }

        // 更新色塊的 startTime 和 endTime（保持寬度）
        partData[draggedBlockIndex].startTime = newStartTime;
        partData[draggedBlockIndex].endTime = newStartTime + blockWidth;
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
          position: "relative", // 設置為相對定位，讓子元素的絕對定位有參考點
          overflow: "hidden",
          border: "1px solid rgb(63, 63, 63)",
          padding: "0px",
          opacity: hidden ? 0 : 1, // 如果 hidden 为 true，则隐藏内容
          pointerEvents: hidden ? "none" : "auto", // 禁用鼠标事件
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
<<<<<<< HEAD
        {timelineBlocks.map((block, index) => {
          let backgroundStyle;
          const isSelected =
            selectedBlock?.armorIndex === armorIndex &&
            selectedBlock?.partIndex === partIndex &&
            selectedBlock?.blockIndex === index;
          // 預設選取框顏色
          let selectionBorderColor = "#FFA500"; // 橘色
          const colorThreshold = 200; // 設定距離閾值

          // 取得對應的原始資料（可能為 undefined）和漸變標記
          const currentBlockData = actionTable[armorIndex]?.[partIndex]?.[index];
          const isFade = currentBlockData?.linear === 1;

          const color = block.color || { R: 0, G: 0, B: 0, A: 1 };
=======
      {timelineBlocks.map((block, index) => {
        // --- 1. 定義狀態變數 ---
        // 是否在目前這條 Timeline 的選中清單中
        const isCurrentlyInMultiSelect = multiSelectedBlocks.some(b => 
          b.armorIndex === armorIndex && 
          b.partIndex === partIndex && 
          b.blockIndex === index
        );
>>>>>>> 7ca4da396943de1f136440c3745a54867cf826b5

        // A. 判斷是否為「貼上目標」(綠色)：在複製模式下且被點擊選中
        const isPasteTarget = isCopying && isCurrentlyInMultiSelect;

<<<<<<< HEAD
          // 如果選取的方塊顏色和預設選取框顏色相似，就改變選取框顏色
          if (colorDistance(color, { R: 255, G: 165, B: 0 }) < colorThreshold) {
            selectionBorderColor = "#00FFFF"; // 改成青色
          }

          if (isFade) {
            const partTimeline = actionTable[armorIndex]?.[partIndex];
            const nextBlock = partTimeline?.[index + 1];

            // 新方案：直接使用下一個塊的顏色，或默認為黑色
            let endColor = { R: 0, G: 0, B: 0, A: 1 }; // Default to black

            if (nextBlock) {
              endColor = nextBlock.color;
            }

            const startColorString = `rgba(${color.R}, ${color.G}, ${color.B}, ${color.A})`;
            const endColorString = `rgba(${endColor.R}, ${endColor.G}, ${endColor.B}, ${endColor.A})`;
            backgroundStyle = `linear-gradient(to right, ${startColorString}, ${endColorString})`;
          } else {
            backgroundStyle = `rgba(${color.R}, ${color.G}, ${color.B}, ${color.A})`;
          }
=======
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
>>>>>>> 7ca4da396943de1f136440c3745a54867cf826b5

          // 設定 blockStyle - 使用絕對定位以正確顯示色塊位置
          const blockStyle = {
            position: "absolute",
            left: `${(block.startTime / duration) * 100}%`,
            background: backgroundStyle,
            width: `${(block.durationTime / duration) * 100}%`,
            height: "90%",
            borderRadius: "7px",
            // border: isSelected || isMultiSelected ? `3px solid ${selectionBorderColor}` : "none",
            zIndex: (isPasteTarget || isCopySource) ? 10 : 1,
            // 優先權：貼上目標(綠) > 複製來源(橘) > 普通選取
            border: isPasteTarget 
              ? "4px solid #00FF00" 
              : (isCopySource || isNormalSelected ? `3px solid ${selectionBorderColor}` : "none"),
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
              key={index}
              style={{
                ...blockStyle,
                ...(hoveredBlock?.index === index
                  ? { opacity: 0.85 } // 懸停時透明度
                  : { opacity: 1 }), // 預設透明度
                position: "relative", // 確保子元素可以絕對定位
              }}
              className="timeline-block"
              onMouseDown={(e) => handleMouseDown(e, index)} // 點擊方塊選中
              onMouseMove={(e) => {
                // 偵測是否在右邊緣（10px）
                const blockRect = e.currentTarget.getBoundingClientRect();
                const distanceFromRight = blockRect.right - e.clientX;
                if (distanceFromRight <= 10) {
                  e.currentTarget.style.cursor = "ew-resize"; // 改變游標為可調整大小
                } else {
                  e.currentTarget.style.cursor = "grab";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.cursor = "default";
              }}
            >
              {/* 右邊緣調整區域 */}
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  width: "10px",
                  height: "100%",
                  cursor: "ew-resize",
                  backgroundColor: "rgba(255, 255, 255, 0)", // 透明背景，方便拖動
                  zIndex: 3,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation(); // 阻止事件冒泡到父元素
                  handleResizeMouseDown(e, index);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.3)"; // 懸停時顯示邊緣
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0)";
                }}
              />
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
