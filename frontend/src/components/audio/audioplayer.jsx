import React, { useRef, useState, useEffect, createRef } from "react";
import { store } from "../../redux/store.js"; // 確保引入你的 Redux store
import { useSelector, useDispatch } from "react-redux";
import {
  updateActionTable,
  updateSelectedBlock,
  updateClipboard,
} from "../../redux/actions.js";
import "./audioplayer.css";
import Waveform from "./waveform.jsx";
import Timeline from "./Timeline.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrash,
  faPalette,
  faVolumeHigh,
  faArrowRight,
  faArrowLeft,
  faScissors,
  faPlay,
  faCircleHalfStroke,
  faPause,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { produce } from "immer";
import {
  updateChosenColor,
  updatePaletteColor,
  updateIsColorChangeActive,
  updatePlaybackRate,
  updateCurrentTime,
} from "../../redux/actions.js";
import { set } from "lodash";

const MAXZOOMVALUE = 100;

function AudioPlayer({ setButtonState, timelineRef }) {
  const dispatch = useDispatch();
  const showPart = useSelector((state) => state.profiles.showPart);
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration); // 音樂總長度
  const actionTable = useSelector((state) => state.profiles.actionTable); // Redux 狀態中的動作表
  const timelineBlocks = useSelector((state) => state.profiles.timelineBlocks); // Redux 狀態中的時間軸區塊
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const selectedBlock = useSelector((state) => state.profiles.selectedBlock);
  const favoriteColor = useSelector((state) => state.profiles.favoriteColor);
  const isColorChangeActive = useSelector(
    (state) => state.profiles.isColorChangeActive
  );
  const clipboard = useSelector((state) => state.profiles.clipboard);
  const playbackRate = useSelector((state) => state.profiles.playbackRate);

  const audioRef = useRef(null); // 音檔的引用
  const scrollRef = useRef(null); // 滾動條的容器
  const containerRef = useRef(null); // 波形的容器
  const [volume, setVolume] = useState(0.5); // 音量
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // 放大級別
  const [progressWidth, setProgressWidth] = useState(0); // 進度標誌
  const [brightness, setBrightness] = useState(1); // 預設亮度為 1 (100%)
  const [sourceNode, setSourceNode] = useState(null);
  const blackthreshold = 10;
  const elRefs = useRef([]);
  const isExternalSeekRef = useRef(false); // 🔥 用 ref 避免重渲染

  const prevTimeRef = useRef(currentTime);

  const [effectMenuVisible, setEffectMenuVisible] = useState(false);
  const [effectType, setEffectType] = useState(null); // 'gradient' | 'blink'
  const [gradientSettingsVisible, setGradientSettingsVisible] = useState(false);

  const [startBrightness, setStartBrightness] = useState(10);
  const [interval, setInterval] = useState(10);
  const [endBrightness, setEndBrightness] = useState(100);

  useEffect(() => {
    // 如果這不是外部觸發的跳轉，就跳過
    if (!isExternalSeekRef.current) {
      prevTimeRef.current = currentTime;
      return;
    }

    // ✅ 是我們自己用按鍵或 UI 觸發的跳轉！
    console.log("🔁 Detected external seek!");

    if (sourceNode) {
      try {
        sourceNode.stop();
      } catch (e) {
        console.warn("sourceNode already stopped");
      }
    }

    // 讓 waveform 自己重新處理播放
    setIsPlaying(false);
    setTimeout(() => setIsPlaying(true), 0);

    isExternalSeekRef.current = false; // ✅ 重設 flag
    prevTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    console.log("zoomLevel:", zoomLevel);
  }, [zoomLevel]);

  useEffect(() => {
    setButtonState(isPlaying);
  }, [isPlaying, setButtonState]);

  useEffect(() => {
    elRefs.current = showPart.map((_, i) => elRefs.current[i] || createRef());
  }, [showPart]);

  useEffect(() => {
    if (
      isColorChangeActive &&
      selectedBlock &&
      selectedBlock.armorIndex !== undefined &&
      selectedBlock.partIndex !== undefined &&
      selectedBlock.blockIndex !== undefined &&
      chosenColor
    ) {
      const { armorIndex, partIndex, blockIndex } = selectedBlock;

      // 使用 Immer 深拷贝并更新
      const updatedActionTable = produce(actionTable, (draft) => {
        const timeline = draft[armorIndex][partIndex];
        if (!timeline) return;

        if (timeline[blockIndex]) {
          timeline[blockIndex].color = chosenColor; // 更新 block 的颜色
        }
      });

      // 通过 Redux 更新 actionTable
      dispatch(updateActionTable(updatedActionTable));

      console.log("Updated actionTable with new color:", chosenColor);

      // 重置调色状态
    }
  }, [isColorChangeActive, chosenColor, selectedBlock, actionTable, dispatch]);

  useEffect(() => {
    if (duration > 0) {
      const progress = (currentTime / duration) * 100; // 計算播放進度的百分比
      setProgressWidth(progress);
    }
  }, [currentTime, duration]);

  useEffect(() => {
    if (
      selectedBlock &&
      selectedBlock.armorIndex !== undefined &&
      selectedBlock.partIndex !== undefined &&
      selectedBlock.blockIndex !== undefined
    ) {
      const block =
        actionTable?.[selectedBlock.armorIndex]?.[selectedBlock.partIndex]?.[
          selectedBlock.blockIndex
        ];
      console.log("Selected block:", selectedBlock, block);
      if (block && block.color && block.color.A !== undefined) {
        setBrightness(block.color.A); // 同步選取的區塊的 alpha 值到亮度控制項
      }
    }
  }, [selectedBlock, actionTable]);

  const keyPress = useRef(false);

  const handleKeyDown = (event) => {
    if (keyPress.current) return; // 避免重複觸發

    keyPress.current = true;
    setTimeout(() => (keyPress.current = false), 100);

    console.log(
      "Pressed key:",
      event.key,
      "Code:",
      event.code,
      "Shift:",
      event.shiftKey
    );

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (event.key === "ArrowRight") {
        console.log("ArrowRight pressed. Advancing 50ms");
        dispatch(
          updateCurrentTime(
            currentTime + 50 > duration
              ? Math.floor(duration / 50) * 50
              : currentTime + 50
          )
        );
      } else if (event.key === "ArrowLeft") {
        console.log("ArrowLeft pressed. Going back 50ms");
        dispatch(
          updateCurrentTime(currentTime - 50 < 0 ? 0 : currentTime - 50)
        );
      }
    }

    if (event.shiftKey && event.key === "ArrowRight") {
      event.preventDefault();
      console.log("Shift + ArrowRight pressed. Moving right.");
      handleGoRight();
    }
    if (event.shiftKey && event.key === "ArrowLeft") {
      event.preventDefault();
      console.log("Shift + ArrowLeft pressed. Moving left.");
      handleGoLeft();
    }
    if (event.key === "m") {
      event.preventDefault();
      ClickedColorChange();
    }
    if (event.key === "c" && !event.ctrlKey) {
      event.preventDefault();
      handleCut();
    }
    if (event.key === "L" || event.key === "l") { // Add shortcut for 'L' key
      event.preventDefault();
      console.log("L key pressed. Toggling linear property.");
      handleSetLinear();
    }

    if (["1", "2", "3", "4", "5", "6", "7", "8"].includes(event.key)) {
      console.log("Number key pressed.");
      event.preventDefault();
      handleFavoriteColorChoose(parseInt(event.key) - 1);
    }
    if (event.ctrlKey) {
      // Ctrl+C: 複製
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        handleCopy();
      }
      // Ctrl+V: 貼上
      else if (event.key === "v" || event.key === "V") {
        event.preventDefault();
        handlePaste();
      }
      // Ctrl+數字: 設定透明度
      else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(event.key)) {
        event.preventDefault();
        const alphaValue = parseFloat(event.key) / 10;
        handleAlphaChoose(alphaValue);
      } else if (event.key === "0") {
        // 檢測 Ctrl + 0
        event.preventDefault();
        handleAlphaChoose(1.0);
      }
    }
    if (
      event.shiftKey &&
      ["1", "2", "3", "4", "5", "6", "7", "8"].includes(event.key)
    ) {
      event.preventDefault();
      const colorIndex = parseInt(event.key) - 1;
      handleFavoriteColorInsert(colorIndex);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      console.log("Delete or Backspace pressed.");
      ClickedDelete();
    }

    if (event.key === " ") {
      // 監聽空白鍵
      event.preventDefault();
      console.log("Space pressed.");
      handlePlayPause();
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedBlock, currentTime]); // 依賴 selectedBlock，確保每次變化時都重新綁定事件處理器

  const handleFavoriteColorInsert = (colorIndex) => {
    const row = Math.floor(colorIndex / favoriteColor[0].length); // 計算第幾列
    const col = colorIndex % favoriteColor[0].length; // 計算第幾行
    insertFavoriteColorArray(favoriteColor[row % favoriteColor.length][col]);
  };

  const insertFavoriteColorArray = (color) => {
    console.log("insertFavoriteColor: ", color);
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined
    ) {
      console.warn("No block selected or invalid block index.");
      return;
    }

    const armorIndex = selectedBlock.armorIndex;
    const partIndex = selectedBlock.partIndex;
    const partData = actionTable[armorIndex]?.[partIndex] || [];
    const indexToCopy = binarySearchFirstGreater(partData, currentTime);

    if (indexToCopy === 0) {
      console.log("partData: ", partData.length);
    }
    console.log("indexToCopy: ", indexToCopy);

    // 將時間 floor 到最近的 50 毫秒
    const nowTime = Math.floor(currentTime / 50) * 50;
    dispatch(updateCurrentTime(nowTime)); // 更新 Redux

    const updatedActionTable = actionTable.map((player, playerIndex) => {
      if (playerIndex === armorIndex) {
        const updatedPlayer = { ...player };
        let updatedPartData = [...player[partIndex]];

        const newEntry = {
          time: nowTime,
          color: { ...color },
          linear: 0,
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
                ? { ...entry, color: { ...color } }
                : entry
            );
          } else if (indexToCopy === 0) {
            const blackArray2 = {
              time: duration,
              color: { R: 0, G: 0, B: 0, A: 1 },
              linear: 0,
            };
            updatedPartData.splice(partData.length, 0, newEntry, blackArray2);
          } else if (!isPreviousBlack && isNextBlack) {
            const blackArray = {
              time: nowTime - blackthreshold,
              color: { R: 0, G: 0, B: 0, A: 1 },
              linear: 0,
            };
            updatedPartData.splice(indexToCopy + 1, 0, blackArray, newEntry);
          } else if (!isPreviousBlack && !isNextBlack) {
            const blackArray = {
              time: nowTime - blackthreshold,
              color: { R: 0, G: 0, B: 0, A: 1 },
              linear: 0,
            };
            const blackArray2 = {
              time:
                nextElement?.time - blackthreshold || nowTime + blackthreshold,
              color: { R: 0, G: 0, B: 0, A: 1 },
              linear: 0,
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
              linear: 0,
            };
            updatedPartData.splice(indexToCopy + 1, 0, newEntry, blackArray2);
          } else if (isPreviousBlack && isNextBlack) {
            updatedPartData.splice(partData.length, 0, newEntry);
          } else {
            const blackArray2 = {
              time: duration,
              color: { R: 0, G: 0, B: 0, A: 1 },
              linear: 0,
            };
            updatedPartData.splice(indexToCopy + 1, 0, newEntry, blackArray2);
          }
        } else {
          updatedPartData.splice(indexToCopy + 1, 0, newEntry);
        }

        // **排序 partData 依據 time**
        updatedPartData.sort((a, b) => a.time - b.time);

        updatedPlayer[partIndex] = updatedPartData;
        return updatedPlayer;
      }
      return player;
    });

    dispatch(updateActionTable(updatedActionTable)); // 更新 Redux
  };

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

  const handlePlayPause = () => {
    if (!isPlaying) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const handleFavoriteColorChoose = (index) => {
    if (!selectedBlock) return;

    const { armorIndex, partIndex, blockIndex } = selectedBlock;
    if (
      !actionTable?.[armorIndex]?.[partIndex] ||
      !actionTable[armorIndex][partIndex][blockIndex]
    ) {
      return;
    }

    const updatedActionTable = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex][partIndex];
      if (!timeline) return;

      const row = Math.floor(index / favoriteColor[0].length); // 計算第幾列
      const col = index % favoriteColor[0].length; // 計算第幾行

      timeline[blockIndex].color = {
        ...favoriteColor[row % favoriteColor.length][col],
      };
      console.log("color:", favoriteColor[row % favoriteColor.length][col]);
    });

    console.log("color:", favoriteColor);

    dispatch(updateActionTable(updatedActionTable));
  };

  const handleAlphaChoose = (alphaValue) => {
    if (!selectedBlock) return;

    const { armorIndex, partIndex, blockIndex } = selectedBlock;
    if (
      !actionTable?.[armorIndex]?.[partIndex] ||
      !actionTable[armorIndex][partIndex][blockIndex]
    ) {
      return;
    }

    const updatedActionTable = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex][partIndex];
      if (!timeline) return;

      if (timeline[blockIndex]?.color) {
        timeline[blockIndex].color.A = alphaValue; // 設定透明度
        console.log(`Updated alpha to: ${alphaValue}`);
      }
    });

    dispatch(updateActionTable(updatedActionTable));
  };

  const handleZoom = (event) => {
    setZoomLevel(Math.floor(event.target.value));
  };

  const formatTime = (timeInMilliseconds) => {
    const minutes = Math.floor(timeInMilliseconds / 60000);
    const seconds = Math.floor((timeInMilliseconds % 60000) / 1000);
    const milliseconds = Math.floor(timeInMilliseconds % 1000);

    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}:${
      milliseconds < 100 ? "0" : ""
    }${milliseconds < 10 ? "0" : ""}${milliseconds}`;
  };

  const handleminuszoom = () => {
    setZoomLevel((prevZoom) =>
      Math.max((Math.round((prevZoom - 0.05) / 0.05) * 0.05).toFixed(2), 1)
    );
  };

  const handlepluszoom = () => {
    setZoomLevel((prevZoom) =>
      Math.min(
        (Math.round((prevZoom + 0.05) / 0.05) * 0.05).toFixed(2),
        MAXZOOMVALUE
      )
    );
  };

  const handleVolumeChange = (event) => {
    const newVolume = event.target.value;
    if (isPlaying) {
      setIsPlaying(false);
    }
    setVolume(newVolume);
  };

  const ClickedDelete = () => {
    console.log("Delete clicked");
    console.log("selectedBlock:", selectedBlock);

    // 確保選中的 block 有效
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined
    ) {
      console.warn("No block selected or invalid block index.");
      return;
    }

    const { armorIndex, partIndex, blockIndex } = selectedBlock;

    // 找到對應的 block
    const block = timelineBlocks?.[armorIndex]?.[partIndex]?.[blockIndex];

    if (!block || !block.startTime) {
      console.warn("Selected block has no valid startTime.");
      return;
    }

    const startTime = block.startTime;

    // **更新 actionTable**
    const updatedActionTable = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex][partIndex];
      if (!timeline) {
        console.warn("No corresponding timeline found in actionTable.");
        return;
      }

      // 找到對應的時間索引
      const timeIndex = timeline.findIndex((entry) => entry.time === startTime);
      console.log("Found time index:", timeIndex);
      if (timeIndex === -1) {
        console.warn("No corresponding time entry found in actionTable.");
        return;
      }

      // 如果後一個的顏色是黑色，也需要刪除
      const isNextBlockBlack =
        timeline[timeIndex + 1]?.color?.R === 0 &&
        timeline[timeIndex + 1]?.color?.G === 0 &&
        timeline[timeIndex + 1]?.color?.B === 0;

      // 刪除當前時間條目
      console.log("isNextBlockBlack:", isNextBlockBlack);
      timeline.splice(timeIndex, 1);

      if (isNextBlockBlack) {
        timeline.splice(timeIndex, 1);
      }

      dispatch(updateSelectedBlock({})); // 清空選中的 block
    });

    // **移除多餘的黑色塊**
    const cleanedActionTable = removeDuplicateBlackBlocks(updatedActionTable);

    console.log("Updated and cleaned actionTable:", cleanedActionTable);
    dispatch(updateActionTable(cleanedActionTable)); // 更新 Redux
  };

  const handleSetLinear = () => {
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined ||
      selectedBlock.blockIndex === undefined
    ) {
      console.warn("No block selected or invalid block index.");
      return;
    }

    const { armorIndex, partIndex, blockIndex } = selectedBlock;

    const updatedActionTable = produce(actionTable, (draft) => {
      const block = draft[armorIndex]?.[partIndex]?.[blockIndex];
      if (block) {
        // Toggle the linear property, ensuring it exists first
        block.linear = block.linear === 1 ? 0 : 1;
      }
    });

    dispatch(updateActionTable(updatedActionTable));
  };

  const removeDuplicateBlackBlocks = (actionTable) => {
    if (typeof actionTable !== "object" || actionTable === null)
      return actionTable;

    return Object.entries(actionTable).reduce((newTable, [armorKey, armor]) => {
      if (typeof armor !== "object" || armor === null) {
        newTable[armorKey] = armor;
        return newTable;
      }

      newTable[armorKey] = Object.fromEntries(
        Object.entries(armor).map(([partKey, part]) => {
          if (!Array.isArray(part)) return [partKey, part]; // 如果 `part` 不是陣列，直接返回

          let lastWasBlack = false; // 用來追蹤前一個是否是黑色區塊

          return [
            partKey,
            part.filter((block, index, arr) => {
              const isCurrentBlack =
                block?.color?.R === 0 &&
                block?.color?.G === 0 &&
                block?.color?.B === 0;

              if (isCurrentBlack && lastWasBlack) {
                // 如果前一個是黑色，這個也是黑色 -> 刪除這個
                return false;
              }

              lastWasBlack = isCurrentBlack; // 更新狀態
              return true;
            }),
          ];
        })
      );

      return newTable;
    }, {});
  };

  const ClickedColorChange = () => {
    console.log("Color Change clicked");

    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined ||
      selectedBlock.blockIndex === undefined
    ) {
      console.warn("No block selected or invalid block index.");
      return;
    }

    const block =
      timelineBlocks?.[selectedBlock.armorIndex]?.[selectedBlock.partIndex]?.[
        selectedBlock.blockIndex
      ];

    if (!block || !block.color) {
      console.warn("Selected block has no color information.");
      return;
    }

    // 更新 Redux 的颜色状态
    const blockColor = block.color;
    dispatch(updatePaletteColor(rgbaToHex(blockColor)));
    dispatch(updateChosenColor(blockColor));
    dispatch(updateIsColorChangeActive(true));
    console.log("Updated chosenColor:", blockColor);

    // 打开调色盘并同步颜色
    const palette = document.querySelector("#colorWell");
    if (palette) {
      palette.value = rgbaToHex(blockColor); // 将调色盘颜色更新为当前 block 的颜色
      palette.dispatchEvent(new Event("input")); // 手动触发 input 事件，确保颜色显示正确
      palette.click(); // 打开调色盘
    }
  };

  const rgbaToHex = (rgba) => {
    const r = rgba.R.toString(16).padStart(2, "0");
    const g = rgba.G.toString(16).padStart(2, "0");
    const b = rgba.B.toString(16).padStart(2, "0");

    return `#${r}${g}${b}`;
  };

  const handleSpeedChange = (speed) => {
    const newSpeed = parseFloat(speed); // 转换为数字
    dispatch(updatePlaybackRate(newSpeed));
  };

  const handleGoLeft = () => {
    console.log("go left");
    console.log("selectedBlock:", selectedBlock);
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined
    ) {
      console.warn("No timeline selected or invalid block index.");
      return;
    }

    const { armorIndex, partIndex } = selectedBlock;
    const timeline = actionTable[armorIndex]?.[partIndex];

    if (!timeline || timeline.length === 0) {
      console.warn("No valid timeline found for the selected block.");
      return;
    }

    // 获取比 currentTime 小的所有时间点并按降序排序
    const filteredTimes = timeline
      .map((block) => block.time)
      .filter((time) => time < currentTime)
      .sort((a, b) => b - a);

    // 获取最大时间点和次大时间点
    const previousTime = filteredTimes[0];
    const secondPreviousTime = filteredTimes[1];

    // 如果最大时间点与 currentTime 相差 10ms，则取次大时间点
    let selectedTime = previousTime;
    if (
      previousTime !== undefined &&
      secondPreviousTime !== undefined &&
      currentTime - previousTime === 10
    ) {
      selectedTime = secondPreviousTime;
    }

    if (selectedTime !== undefined) {
      selectedTime = Math.round(selectedTime / 50) * 50; // 四舍五入到最近的 10 毫秒
      // isExternalSeekRef.current = true; // 设置为外部跳转
      dispatch(updateCurrentTime(selectedTime)); // 更新 Redux 中的 currentTime
      // audioRef.current.currentTime = selectedTime / 1000; // 更新 audio 元素的播放時間
    } else {
      console.warn("No previous time point found.");
    }
  };

  const handleGoRight = () => {
    console.log("go right");
    console.log("selectedBlock:", selectedBlock);
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined
    ) {
      console.warn("No timeline selected or invalid block index.");
      return;
    }
    const { armorIndex, partIndex } = selectedBlock;
    const timeline = actionTable[armorIndex]?.[partIndex];
    console.log("timeline:", timeline);

    if (!timeline || timeline.length === 0) {
      console.warn("No valid timeline found for the selected block.");
      return;
    }

    // 获取比 currentTime 大的所有时间点并按升序排序
    const filteredTimes = timeline
      .map((block) => block.time)
      .filter((time) => time > currentTime)
      .sort((a, b) => a - b);

    if (filteredTimes.length === 0) {
      console.warn("No next time point found.");
      return;
    }

    // 最接近 currentTime 的最小时间点（第一小时间点）
    const firstTime = filteredTimes[0];
    // 第二小时间点（如果存在）
    const secondTime = filteredTimes[1];

    let nextTime = firstTime; // 默认为第一小时间点

    // 如果第一小时间点和第二小时间点相差 10 毫秒，取第二小时间点
    if (secondTime !== undefined && secondTime - firstTime === 10) {
      nextTime = secondTime;
    }
    if (nextTime !== undefined) {
      nextTime = Math.round(nextTime / 50) * 50; // 四舍五入到最近的 10 毫秒
      nextTime = Math.min(nextTime, duration); // 确保不超过音频总时长
      // isExternalSeekRef.current = true; // 设置为外部跳转
      dispatch(updateCurrentTime(nextTime)); // 更新 Redux 中的 currentTime
      console.log("currentTime:", currentTime);
    } else {
      console.warn("No next time point found.");
    }
  };

  const handleCut = () => {
    console.log("cut clicked");
    console.log("selectedBlock:", selectedBlock);
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined ||
      selectedBlock.blockIndex === undefined
    ) {
      console.warn("No block selected or invalid block index.");
      return;
    }

    const { armorIndex, partIndex, blockIndex } = selectedBlock;

    const block = actionTable?.[armorIndex]?.[partIndex]?.[blockIndex];
    if (!block) {
      console.warn("Selected block not found in the actionTable.");
      return;
    }
    if (block.time >= currentTime) {
      console.warn("Selected block is in the future.");
      return;
    }
    if (
      actionTable?.[armorIndex]?.[partIndex]?.[blockIndex + 1].time <
      currentTime
    ) {
      console.warn("Selected block is in the past.");
      return;
    }

    // 插入新的 block
    const updatedActionTable = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex][partIndex];
      if (!timeline) return;

      const originalBlock = timeline[blockIndex];
      if (!originalBlock || !originalBlock.time) return;

      // 新的 block 时间为原始 block 的时间加上一半的持续时间

      // 插入新的 block
      const newBlock = {
        ...originalBlock,
        time: currentTime,
      };

      const newBlackBlock = {
        time: currentTime - blackthreshold,
        color: { R: 0, G: 0, B: 0, A: 1 },
        linear: 0,
      };

      timeline.splice(blockIndex + 1, 0, newBlock, newBlackBlock);

      // 确保时间线保持排序
      timeline.sort((a, b) => a.time - b.time);
    });

    dispatch(updateActionTable(updatedActionTable));
    console.log("Action table after cut:", updatedActionTable);

    // 更新 selectedBlock，讓 blockIndex 增加 1
    dispatch(
      updateSelectedBlock({
        armorIndex,
        partIndex,
        blockIndex: blockIndex + 2,
      })
    );
  };

  const handleCopy = () => {
    console.log("Copy clicked");
    console.log("selectedBlock:", selectedBlock);

    // 檢查是否有選中的方塊
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined
    ) {
      console.warn("No block selected. Cannot copy.");
      return;
    }

    const { armorIndex, partIndex } = selectedBlock;

    // 取得整個部位的 timeline
    const timeline = actionTable?.[armorIndex]?.[partIndex];

    if (!timeline || timeline.length === 0) {
      console.warn("No timeline data found for the selected block.");
      return;
    }

    // 深拷貝 timeline 資料
    const copiedData = JSON.parse(JSON.stringify(timeline));

    // 更新 clipboard 狀態
    dispatch(
      updateClipboard({
        data: copiedData,
        sourceArmorIndex: armorIndex,
        sourcePartIndex: partIndex,
        timestamp: Date.now(),
      })
    );

    console.log(
      `Copied timeline for Armor ${armorIndex}, Part ${partIndex}:`,
      copiedData
    );
    console.log(`Total blocks copied: ${copiedData.length}`);
  };

  const handlePaste = () => {
    console.log("Paste clicked");
    console.log("selectedBlock:", selectedBlock);

    // 檢查剪貼簿是否有資料
    if (!clipboard || !clipboard.data || clipboard.data.length === 0) {
      console.warn("Clipboard is empty. Nothing to paste.");
      return;
    }

    // 檢查是否有選中的方塊
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined
    ) {
      console.warn("No block selected. Cannot determine paste target.");
      return;
    }

    const { armorIndex: targetArmorIndex, partIndex: targetPartIndex } =
      selectedBlock;

    console.log(`Pasting to Armor ${targetArmorIndex}, Part ${targetPartIndex}`);
    console.log(
      `Source: Armor ${clipboard.sourceArmorIndex}, Part ${clipboard.sourcePartIndex}`
    );

    // 深拷貝剪貼簿資料
    const pastedData = JSON.parse(JSON.stringify(clipboard.data));

    // 使用 Immer 更新 actionTable
    const updatedActionTable = produce(actionTable, (draft) => {
      // 完全覆蓋目標部位的 timeline
      draft[targetArmorIndex][targetPartIndex] = pastedData;
    });

    // 更新 Redux
    dispatch(updateActionTable(updatedActionTable));

    console.log(
      `Pasted ${pastedData.length} blocks to Armor ${targetArmorIndex}, Part ${targetPartIndex}`
    );

    // 貼上後，選中目標部位的第一個有效方塊（非黑色）
    let newBlockIndex = 0;
    for (let i = 0; i < pastedData.length; i++) {
      const block = pastedData[i];
      if (
        !(
          block.color.R === 0 &&
          block.color.G === 0 &&
          block.color.B === 0
        )
      ) {
        newBlockIndex = i;
        break;
      }
    }

    dispatch(
      updateSelectedBlock({
        armorIndex: targetArmorIndex,
        partIndex: targetPartIndex,
        blockIndex: newBlockIndex,
      })
    );
  };

  const handleBrightnessChange = (newBrightness) => {
    if (
      !selectedBlock ||
      selectedBlock.armorIndex === undefined ||
      selectedBlock.partIndex === undefined ||
      selectedBlock.blockIndex === undefined
    ) {
      console.warn("No block selected or invalid block index.");
      return;
    }

    const { armorIndex, partIndex, blockIndex } = selectedBlock;

    const updatedActionTable = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex][partIndex];
      if (!timeline || !timeline[blockIndex]) return;

      // 更新選取區塊的 alpha 值
      timeline[blockIndex].color.A = parseFloat(newBrightness);
    });

    // 更新 Redux 狀態
    dispatch(updateActionTable(updatedActionTable));

    // 更新本地狀態
    setBrightness(newBrightness);
  };

  const handleEffect = () => {
    // 切換最外層選單
    setEffectMenuVisible((vis) => !vis);
    // 如果收起時一併隱藏設定 panel
    if (effectMenuVisible) {
      setGradientSettingsVisible(false);
      setEffectType(null);
    }
  };

  const applyGradientEffect = (startBrightness, interval, endBrightness) => {
    if (
      !selectedBlock ||
      selectedBlock.armorIndex == null ||
      selectedBlock.partIndex == null ||
      selectedBlock.blockIndex == null
    ) {
      console.warn("No block selected or invalid indices.");
      return;
    }

    const { armorIndex, partIndex, blockIndex } = selectedBlock;

    const updated = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex][partIndex];
      if (!Array.isArray(timeline)) return;

      // 判斷方向：end 大於 start 就遞增，否則遞減
      const ascending = endBrightness > startBrightness;
      let current = startBrightness;
      let step = 0;

      // 用 while 讓 current 每次 + 或 - interval，直到過了 endBrightness
      while (
        (ascending && current <= endBrightness) ||
        (!ascending && current >= endBrightness)
      ) {
        const idx = blockIndex + step * 2;
        if (timeline[idx]) {
          timeline[idx].color.A = current / 100;
        }
        current += ascending ? interval : -interval;
        step += 1;
      }
    });

    dispatch(updateActionTable(updated));
  };

  const listitem = showPart.map((setting) => (
    <Timeline
      key={setting.id}
      armorIndex={setting.armorIndex}
      partIndex={setting.partIndex}
      hidden={setting.hidden}
      zoomValue={zoomLevel}
      ref={elRefs.current[showPart.findIndex((s) => s.id === setting.id)]}
      height={showPart.length <= 7 ? 100 / showPart.length : 14}
    />
  ));

  return (
    <div className="audio-player-container">
      <div className="controls">
        {/*<button className="effect-button" onClick={handleEffect}>
          <FontAwesomeIcon icon={faWandMagicSparkles} size="lg" />
          <span className="tooltip">Effect</span>
        </button>*/}
        <div className="effect-wrapper">
          <button className="effect-button" onClick={handleEffect}>
            <FontAwesomeIcon icon={faWandMagicSparkles} size="lg" />
            <span className="tooltip">Effect</span>
          </button>

          {/* 一級選單：選 gradient / blink */}
          {effectMenuVisible && (
            <div className="effect-menu">
              <div
                className="effect-menu-item"
                onClick={() => {
                  handleSetLinear();
                  setEffectMenuVisible(false);
                }}
              >
                漸變
              </div>
            </div>
          )}

          {/* 二級設定 panel：只在選了 gradient 時顯示 */}
          {gradientSettingsVisible && effectType === "gradient" && (
            <div className="gradient-settings-popup">
              {/* 起始亮度 */}
              <label>起始亮度：</label>
              <select
                className="dropdown-select"
                value={startBrightness}
                onChange={(e) => setStartBrightness(Number(e.target.value))}
              >
                {[...Array(10)].map((_, i) => {
                  const v = (i + 1) * 10;
                  return (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  );
                })}
              </select>

              {/* 間隔 */}
              <label>間隔：</label>
              <select
                className="dropdown-select"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
              >
                {[10, 20].map((v) => (
                  <option key={v} value={v}>
                    {v} %
                  </option>
                ))}
              </select>

              {/* 結束亮度 */}
              <label>結束亮度：</label>
              <select
                className="dropdown-select"
                value={endBrightness}
                onChange={(e) => setEndBrightness(Number(e.target.value))}
              >
                {[...Array(10)].map((_, i) => {
                  const v = (i + 1) * 10;
                  return (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  );
                })}
              </select>
              <div className="gradient-settings-actions">
                <button
                  onClick={() => {
                    applyGradientEffect(
                      startBrightness,
                      interval,
                      endBrightness
                    );
                    setGradientSettingsVisible(false);
                    setEffectMenuVisible(false);
                  }}
                >
                  Apply
                </button>
                <button
                  onClick={() => {
                    // 什麼都不做，只關掉面板
                    setGradientSettingsVisible(false);
                    setEffectMenuVisible(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="timeline-controls">
          <button className="timeline-left" onClick={handleGoLeft}>
            <FontAwesomeIcon icon={faArrowLeft} size="lg" />
            <span className="tooltip">Previous Time Point (Shift + ←)</span>
          </button>
          <button className="timeline-right" onClick={handleGoRight}>
            <FontAwesomeIcon icon={faArrowRight} size="lg" />
            <span className="tooltip">Next Time Point (Shift + →)</span>
          </button>
        </div>
        <button className="cut-button" onClick={handleCut}>
          <FontAwesomeIcon icon={faScissors} size="lg" />
          <span className="tooltip">Cut Selected Block ( C )</span>
        </button>
        <button className="delete-button" onClick={ClickedDelete}>
          <FontAwesomeIcon icon={faTrash} size="lg" /> {/* 垃圾桶图标 */}
          <span className="tooltip">Delete Selected Block ( Del )</span>
        </button>

        <div className="brightness-control">
          <FontAwesomeIcon icon={faCircleHalfStroke} />
          <select
            id="brightness-select"
            className="dropdown-select"
            value={brightness} // 綁定當前亮度
            onChange={(e) => handleBrightnessChange(e.target.value)} // 處理亮度變化
            style={{ marginLeft: "10px" }}
          >
            <option value="0.1">10%</option>
            <option value="0.2">20%</option>
            <option value="0.3">30%</option>
            <option value="0.4">40%</option>
            <option value="0.5">50%</option>
            <option value="0.6">60%</option>
            <option value="0.7">70%</option>
            <option value="0.8">80%</option>
            <option value="0.9">90%</option>
            <option value="1">100%</option>
          </select>
          <span className="tooltip">Brightness</span>
        </div>
        <button className="color-button" onClick={ClickedColorChange}>
          <FontAwesomeIcon icon={faPalette} size="lg" /> {/* 调色板图标 */}
          <span className="tooltip">Color( M )</span>
        </button>
        {/* 下拉式选单 */}
        <div className="dropdown">
          <select
            id="speed-select"
            className="dropdown-select"
            value={playbackRate || 1}
            onChange={(e) => handleSpeedChange(e.target.value)}
            style={{ marginLeft: "10px" }}
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
          <span className="tooltip">Playback speed</span>
        </div>
        <div className="play-control">
          <button className="play-button" onClick={handlePlayPause}>
            {isPlaying ? (
              <>
                <FontAwesomeIcon icon={faPause} size="lg" />
                <span className="tooltip">Pause ( Space )</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faPlay} size="lg" />
                <span className="tooltip">Play ( Space )</span>
              </>
            )}
          </button>
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        <div className="zoom-controls">
          <button onClick={handleminuszoom} disabled={zoomLevel < 1}>
            -
          </button>
          <input
            type="range"
            min="1"
            max={MAXZOOMVALUE}
            step="0.01"
            value={zoomLevel}
            onChange={handleZoom}
            className="zoom-slider"
          />
          <button onClick={handlepluszoom} disabled={zoomLevel > MAXZOOMVALUE}>
            +
          </button>
        </div>
        <div className="volume-control">
          <div className="volume-icon" style={{ color: "rgb(150, 146, 146)" }}>
            <FontAwesomeIcon icon={faVolumeHigh} size="lg" />
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            className="volume-slider"
            onChange={handleVolumeChange}
            style={{ width: "100px" }}
          />
        </div>
      </div>
      <div className="scroll-container" ref={scrollRef}>
        <div
          className="main-controlPanel"
          style={{
            width: `${100 * zoomLevel}%`, // 根据 zoomValue 动态调整容器宽度
          }}
        >
          <div
            className="timeline-container"
            ref={timelineRef}
            onKeyDown={handleKeyDown}
          >
            {listitem}
          </div>
          <div className="waveform-container" ref={containerRef}>
            {/* 波形顯示區域 */}
            <Waveform
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              // audioRef={audioRef}
              scrollRef={scrollRef}
              sourceNode={sourceNode}
              setSourceNode={setSourceNode}
              zoomValue={zoomLevel}
              containerRef={containerRef}
              volume={volume}
            />
          </div>
        </div>
      </div>
      <div
        className="progress-flag"
        style={{
          left: `${progressWidth}%`,
        }}
      ></div>

      {/* 放大/縮小滑桿 */}
    </div>
  );
}

export default AudioPlayer;
