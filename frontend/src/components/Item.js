import React, { useRef, useEffect } from "react";
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
  const favoriteColor = useSelector((state) => state.profiles.favoriteColor);
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
  ];

  const colors = Object.fromEntries(
    partNames.map((name, index) => [name, getColorForPart(index)])
  );

  function insertArray(part) {
    const partData = actionTable[myId]?.[part] || [];
    const indexToCopy = binarySearchFirstGreater(partData, time);

    if (indexToCopy === 0) {
      console.log("partData: ", partData.length);
    }
    console.log("indexToCopy: ", indexToCopy);
    // 將時間 floor 到最近的 50 毫秒
    const nowTime = Math.floor(time / 50) * 50;
    dispatch(updateCurrentTime(nowTime)); // 更新 Redux
    // audioRef.current.currentTime = nowTime / 1000;

    const updatedActionTable = actionTable.map((player, playerIndex) => {
      if (playerIndex === myId) {
        const updatedPlayer = { ...player };
        let updatedPartData = [...player[part]];

        const newEntry = {
          time: nowTime,
          color: { ...chosenColor },
        };

        const nextElement = updatedPartData[indexToCopy];
        const isNextBlack =
          indexToCopy === 0
            ? true
            : nextElement?.color?.R === 0 &&
              nextElement?.color?.G === 0 &&
              nextElement?.color?.B === 0;

        const previousElement =
          updatedPartData[indexToCopy - 1] || updatedPartData[indexToCopy];

        const isPreviousBlack =
          indexToCopy === 0
            ? true
            : previousElement?.color?.R === 0 &&
              previousElement?.color?.G === 0 &&
              previousElement?.color?.B === 0;

        console.log("isPreviousBlack: ", isPreviousBlack);
        console.log("isNextBlack: ", isNextBlack);
        // 插入新資料及過渡黑色區塊
        if (nowTime - blackthreshold > 0) {
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
            console.log(partData.length);
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
          } else if (isPreviousBlack && isNextBlack) {
            updatedPartData.splice(partData.length, 0, newEntry);
          } else if (isPreviousBlack) {
            const blackArray2 = {
              time: duration,
              color: { R: 0, G: 0, B: 0, A: 1 },
            };
            console.log(partData.length);
            updatedPartData.splice(partData.length, 0, newEntry, blackArray2);
          } else {
            const blackArray2 = {
              time: duration,
              color: { R: 0, G: 0, B: 0, A: 1 },
            };
            updatedPartData.splice(indexToCopy + 1, 0, newEntry, blackArray2);
          }
        } else {
          updatedPartData.splice(indexToCopy + 1, 0, newEntry);
        }

        // **排序 partData 依據 time**
        updatedPartData.sort((a, b) => a.time - b.time);

        updatedPlayer[part] = updatedPartData;
        return updatedPlayer;
      }
      return player;
    });

    dispatch(updateActionTable(updatedActionTable)); // 更新 Redux
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
