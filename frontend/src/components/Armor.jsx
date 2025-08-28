import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./Armor.css";
import {
  updateActionTable,
  updateCurrentTime,
} from "../redux/actions";

const Armor = (props) => {
  const dispatch = useDispatch();
  const actionTable = useSelector((state) => state.profiles.actionTable);
  const time = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration);
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const selectedBlock = useSelector((state) => state.profiles.selectedBlock);
  const myId = props.index;
  const blackthreshold = 10;
  useEffect(() => {
    console.log("actionTable: ", actionTable);
  }, [actionTable]);

  // 根據部位名稱和當前時間計算顏色
  const getColorForPart = (part) => {
    const partData = actionTable?.[myId]?.[part] || [];
    const timeIndex = binarySearchFirstGreater(partData, time);
    const colorData = partData?.[timeIndex - 1]?.color || {
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
    "weap_1",
    "weap_2",
  ];

  const colors = Object.fromEntries(
    partNames.map((name, index) => [name, getColorForPart(index)])
  );

  function insertArray(part) {
    const partData = actionTable?.[myId]?.[part] || [];
    const indexToCopy = binarySearchFirstGreater(partData, time);
    const nowTime = Math.floor(time / 50) * 50;
    dispatch(updateCurrentTime(nowTime));

    const updatedActionTableEntries = Object.entries(actionTable).map(
      ([playerIndex, player]) => {
        playerIndex = Number(playerIndex);
        if (playerIndex === myId) {
          const updatedPlayer = { ...player };
          let updatedPartData = [...(player[part] || [])];

          const newEntry = {
            time: nowTime,
            color: { ...chosenColor },
          };

          const nextElement = updatedPartData[indexToCopy];
          const previousElement =
            updatedPartData[indexToCopy - 1] || updatedPartData[indexToCopy];

          const isNextBlack =
            !nextElement ||
            (nextElement?.color?.R === 0 &&
              nextElement?.color?.G === 0 &&
              nextElement?.color?.B === 0);

          const isPreviousBlack =
            !previousElement ||
            (previousElement?.color?.R === 0 &&
              previousElement?.color?.G === 0 &&
              previousElement?.color?.B === 0);

          const existingIndex = updatedPartData.findIndex(
            (entry) => entry.time === nowTime
          );

          if (existingIndex !== -1) {
            updatedPartData = updatedPartData.map((entry, index) =>
              index === existingIndex
                ? { ...entry, color: { ...chosenColor } }
                : entry
            );
          } else if (indexToCopy === 0) {
            const blackArray2 = {
              time: duration,
              color: { R: 0, G: 0, B: 0, A: 1 },
            };
            updatedPartData.splice(partData.length, 0, newEntry, blackArray2);
          } else if (!isPreviousBlack && isNextBlack) {
            const blackArray = {
              time: nowTime - blackthreshold,
              color: { R: 0, G: 0, B: 0, A: 1 },
            };
            updatedPartData.splice(indexToCopy + 1, 0, blackArray, newEntry);
          } else if (!isPreviousBlack && !isNextBlack) {
            const blackArray = {
              time: nowTime - blackthreshold,
              color: { R: 0, G: 0, B: 0, A: 1 },
            };
            const blackArray2 = {
              time:
                nextElement?.time - blackthreshold || nowTime + blackthreshold,
              color: { R: 0, G: 0, B: 0, A: 1 },
            };
            updatedPartData.splice(
              indexToCopy + 1,
              0,
              blackArray,
              newEntry,
              blackArray2
            );
          } else if (isPreviousBlack && !isNextBlack) {
            const blackArray2 = {
              time:
                nextElement?.time - blackthreshold || nowTime + blackthreshold,
              color: { R: 0, G: 0, B: 0, A: 1 },
            };
            updatedPartData.splice(indexToCopy + 1, 0, newEntry, blackArray2);
          } else {
            updatedPartData.splice(partData.length, 0, newEntry);
          }

          updatedPartData.sort((a, b) => a.time - b.time);
          updatedPlayer[part] = updatedPartData;
          return [playerIndex, updatedPlayer];
        }
        return [playerIndex, player];
      }
    );

    const updatedActionTable = Object.fromEntries(updatedActionTableEntries);
    dispatch(updateActionTable(updatedActionTable));
  }

  // 二分搜尋找到對應時間
  // 先定義 binarySearchFirstGreater
  function binarySearchFirstGreater(arr, target) {
    if (!arr) return;
    let left = 0;
    let right = arr?.length - 1;
    let result = 0; // 默認值為 -1，如果找不到更大的數字

    while (left <= right) {
      let mid = Math.floor((left + right) / 2);
      if (arr[mid].time > target) {
        result = mid; // 找到候選
        right = mid - 1; // 繼續向左搜尋
      } else {
        left = mid + 1; // 向右移動
      }
    }
    return result;
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
        {isSelected(2) && renderHighlight(84.7, 113.9, 73, 40.6)}
        <rect
          x="84.7"
          y="113.9"
          width="72.6"
          height="40.2"
          fill={colors.bodyUpper}
          onClick={() => handleColorChange(2)}
        />
        {/* Belt & Arms */}
        {isSelected(3) && renderHighlight(106.7, 174.4, 29.1, 22.5)}
        {isSelected(3) && renderHighlight(48.4, 121, 24.6, 73)}
        {isSelected(3) && renderHighlight(169.4, 121, 24.6, 73)}
        <rect
          x="106.7"
          y="174.4"
          width="28.7"
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

        {/* 腿上 */}
        {isSelected(5) && renderHighlight(90.7, 215.1, 24.6, 80.9)}
        {isSelected(5) && renderHighlight(127.1, 215.1, 24.6, 80.9)}
        {isSelected(5) && renderHighlight(144.1, 163.1, 14.6, 30.9)}
        {isSelected(5) && renderHighlight(83.1, 163.1, 14.6, 30.9)}
        <rect
          x="90.7"
          y="215.1"
          width="24.2"
          height="80.5"
          fill={colors.legsLower}
          onClick={() => handleColorChange(5)}
        />
        <rect
          x="127.1"
          y="215.1"
          width="24.2"
          height="80.5"
          fill={colors.legsLower}
          onClick={() => handleColorChange(5)}
        />
        <rect
          x="144.1"
          y="163.1"
          width="14.2"
          height="30.5"
          fill={colors.legsLower}
          onClick={() => handleColorChange(5)}
        />
        <rect
          x="83.7"
          y="163.1"
          width="14.2"
          height="30.5"
          fill={colors.legsLower}
          onClick={() => handleColorChange(5)}
        />
        {/* 腿下 */}
        {isSelected(4) &&
          renderHighlight(150.5, 195.5, 25.2, 55.4, "rect", {
            transform: "skewX(-20)",
          })}
        {isSelected(4) &&
          renderHighlight(65, 195.5, 25.2, 55.4, "rect", {
            transform: "skewX(20)",
          })}
        <rect
          x="150.5"
          y="195.5"
          width="25.2"
          height="55.4"
          transform="skewX(-20)"
          fill={colors.legsUpper}
          onClick={() => handleColorChange(4)}
        />
        <rect
          x="65"
          y="195.5"
          width="25.2"
          height="55.4"
          fill={colors.legsUpper}
          transform="skewX(20)"
          onClick={() => handleColorChange(4)}
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
        {/* Sticks */}
        <rect
          x="230" // 調整這個數值來確保棍子在適當的位置
          y="240"
          width="12"
          height="80"
          fill={colors.weap_2}
          onClick={() => handleColorChange(8)}
        />
        <rect
          x="230" // 調整這個數值來確保棍子在適當的位置
          y="100"
          width="12"
          height="140"
          fill={colors.weap_1}
          onClick={() => handleColorChange(7)}
        />
        <rect
          x="230" // 調整這個數值來確保棍子在適當的位置
          y="20"
          width="12"
          height="80"
          fill={colors.weap_2}
          onClick={() => handleColorChange(8)}
        />
      </svg>
    </div>
  );
};

export default Armor;
