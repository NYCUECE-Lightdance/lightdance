import React, { useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./Armor.css";
import {
  updateActionTable,
  updateCurrentTime,
} from "../redux/actions";

const Armor = (props) => {
  const dispatch = useDispatch();
  const data = useSelector((state) => state.profiles.data);
  const actionTable = data?.actionTable || [];
  const time = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration);
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const favoriteColor = useSelector((state) => state.profiles.favoriteColor);
  const selectedBlock = useSelector((state) => state.profiles.selectedBlock);
  const myId = props.index;
  const blackthreshold = 10;
  useEffect(() => {
    console.log("data: ", data);
  }, [data]);

  // 根據部位名稱和當前時間計算顏色
  const getColorForPart = (part) => {
    const partData = actionTable?.[myId]?.[part] || [];

    // 找到包含當前時間的色塊 (startTime <= time < endTime)
    const activeBlock = partData.find(
      (block) => block.startTime <= time && time < block.endTime
    );

    const colorData = activeBlock?.color || {
      R: 0,
      G: 0,
      B: 0,
      A: 1,
    };

    return `rgb(${Math.round(colorData.R * colorData.A)},
                ${Math.round(colorData.G * colorData.A)},
                ${Math.round(colorData.B * colorData.A)})`;
  };

  const partNames = [
    "head",
    "shoulderPads",
    "bodyUpper",
    "belt_arms",
    "legsUpper",
    "legsLower",
    "shoes",
  ];

  const colors = Object.fromEntries(
    partNames.map((name, index) => [name, getColorForPart(index)])
  );

  function insertArray(part) {
    const partData = actionTable[myId]?.[part] || [];
    const nowTime = Math.floor(time / 50) * 50;
    dispatch(updateCurrentTime(nowTime)); // 更新 Redux

    const updatedActionTable = actionTable.map((player, playerIndex) => {
      if (playerIndex === myId) {
        const updatedPlayer = { ...player };
        let updatedPartData = [...player[part]];

        // 新格式: { startTime, endTime, color, linear }
        // 檢查是否有色塊包含當前時間點
        const existingIndex = updatedPartData.findIndex(
          (block) => block.startTime <= nowTime && nowTime < block.endTime
        );

        if (existingIndex !== -1) {
          // 如果當前時間在某個色塊內部，更新該色塊的顏色
          updatedPartData = updatedPartData.map((block, index) =>
            index === existingIndex
              ? { ...block, color: { ...chosenColor } }
              : block
          );
        } else {
          // 否則創建新色塊，默認長度為 5000ms (5秒)
          let newEndTime = Math.min(nowTime + 5000, duration);

          // 檢查是否與下一個色塊重疊
          const nextBlock = updatedPartData.find(
            (block) => block.startTime > nowTime
          );

          if (nextBlock && newEndTime > nextBlock.startTime) {
            // 如果會重疊，調整 endTime 為下一個色塊的 startTime
            newEndTime = nextBlock.startTime;
          }

          // 確保至少有 50ms 寬度
          if (newEndTime - nowTime < 50) {
            console.warn(`Not enough space to create new block at ${nowTime}ms`);
            return updatedPlayer;
          }

          const newBlock = {
            startTime: nowTime,
            endTime: newEndTime,
            color: { ...chosenColor },
            linear: 0,
          };

          // 找到應該插入的位置（保持時間順序）
          const insertIndex = updatedPartData.findIndex(
            (block) => block.startTime > nowTime
          );

          if (insertIndex === -1) {
            // 如果沒找到比 nowTime 更大的時間，則追加到末尾
            updatedPartData.push(newBlock);
          } else {
            // 否則在找到的位置前插入
            updatedPartData.splice(insertIndex, 0, newBlock);
          }

          console.log(`[Item] Created new block: ${nowTime}ms - ${newEndTime}ms`);
        }

        updatedPlayer[part] = updatedPartData;
        return updatedPlayer;
      }
      return player;
    });

    dispatch(updateActionTable(updatedActionTable)); // 更新 Redux
  }


  const isSelected = (part) => {
    return (
      selectedBlock &&
      selectedBlock.armorIndex === myId &&
      selectedBlock.partIndex === part
    );
  };
  // 處理部位顏色更改
  const handleColorChange = (part) => {
    insertArray(part);
  };
  const renderHighlight = (
    x,
    y,
    width,
    height,
    shape = "rect",
    options = {}
  ) => {
    const { r = null, cx = null, cy = null, transform = null } = options;

    if (shape === "rect") {
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke="white"
          strokeWidth="2"
          transform={transform || null}
        />
      );
    }

    if (shape === "circle") {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="2"
        />
      );
    }

    return null;
  };
  return (
    <div>
      <svg width="242" height="459.8" viewBox="10 0 222 459.8">
        {/* Head */}
        {isSelected(0) &&
          renderHighlight(null, null, null, null, "circle", {
            r: 36.5,
            cx: 121,
            cy: 60.5,
          })}
        {isSelected(0) && renderHighlight(96.8, 2, 12.5, 40.4)}
        {isSelected(0) && renderHighlight(133.1, 2, 12.5, 40.4)}
        <circle
          cx="121"
          cy="60.5"
          r="36.3"
          fill={colors.head}
          onClick={() => handleColorChange(0)}
        />
        <rect
          x="96.8"
          y="2"
          width="12.1"
          height="40"
          fill={colors.head}
          onClick={() => handleColorChange(0)}
        />
        <rect
          x="133.1"
          y="2"
          width="12.1"
          height="40"
          fill={colors.head}
          onClick={() => handleColorChange(0)}
        />

        {/* Shoulders */}
        {isSelected(1) && renderHighlight(42.4, 103.8, 36.7, 12.5)}
        {isSelected(1) && renderHighlight(163.4, 103.8, 36.7, 12.5)}
        <rect
          x="42.4"
          y="103.8"
          width="36.3"
          height="12.1"
          fill={colors.shoulderPads}
          onClick={() => handleColorChange(1)}
        />
        <rect
          x="163.4"
          y="103.8"
          width="36.3"
          height="12.1"
          fill={colors.shoulderPads}
          onClick={() => handleColorChange(1)}
        />

        {/* Upper Body */}
        {isSelected(2) && renderHighlight(84.7, 113.9, 73, 34.6)}
        <rect
          x="84.7"
          y="113.9"
          width="72.6"
          height="34.2"
          fill={colors.bodyUpper}
          onClick={() => handleColorChange(2)}
        />

        {/* Belt & Arms */}
        {isSelected(3) && renderHighlight(98.7, 169.4, 45.1, 22.5)}
        {isSelected(3) && renderHighlight(48.4, 121, 24.6, 73)}
        {isSelected(3) && renderHighlight(169.4, 121, 24.6, 73)}
        <rect
          x="98.7"
          y="169.4"
          width="44.7"
          height="22.1"
          fill={colors.belt_arms}
          onClick={() => handleColorChange(3)}
        />
        <rect
          x="48.4"
          y="121"
          width="24.2"
          height="72.6"
          fill={colors.belt_arms}
          onClick={() => handleColorChange(3)}
        />
        <rect
          x="169.4"
          y="121"
          width="24.2"
          height="72.6"
          fill={colors.belt_arms}
          onClick={() => handleColorChange(3)}
        />

        {/* Legs */}
        {isSelected(4) &&
          renderHighlight(439.5, 205.5, 31.2, 32.8, "rect", {
            transform: "skewX(-60.5)",
          })}
        {isSelected(4) &&
          renderHighlight(-232.7, 205.5, 30.9, 32.8, "rect", {
            transform: "skewX(60.5)",
          })}
        <rect
          x="439.5"
          y="205.5"
          width="31.2"
          height="32.4"
          fill={colors.legsUpper}
          transform="skewX(-60.5)"
          onClick={() => handleColorChange(4)}
        />
        <rect
          x="-232.7"
          y="205.5"
          width="30.3"
          height="32.4"
          fill={colors.legsUpper}
          transform="skewX(60.5)"
          onClick={() => handleColorChange(4)}
        />

        {/* Lower Legs */}
        {isSelected(5) && renderHighlight(90.7, 235.1, 24.6, 60.9)}
        {isSelected(5) && renderHighlight(127.1, 235.1, 24.6, 60.9)}
        <rect
          x="90.7"
          y="235.1"
          width="24.2"
          height="60.5"
          fill={colors.legsLower}
          onClick={() => handleColorChange(5)}
        />
        <rect
          x="127.1"
          y="235.1"
          width="24.2"
          height="60.5"
          fill={colors.legsLower}
          onClick={() => handleColorChange(5)}
        />

        {/* Shoes */}
        {isSelected(6) && renderHighlight(66.6, 302.5, 48.8, 12.5)}
        {isSelected(6) && renderHighlight(127.1, 302.5, 48.8, 12.5)}
        <rect
          x="66.6"
          y="302.5"
          width="48.4"
          height="12.1"
          fill={colors.shoes}
          onClick={() => handleColorChange(6)}
        />
        <rect
          x="127.1"
          y="302.5"
          width="48.4"
          height="12.1"
          fill={colors.shoes}
          onClick={() => handleColorChange(6)}
        />
      </svg>
    </div>
  );
};

export default Armor;
