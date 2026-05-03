import React, { useRef, useState, useEffect, createRef } from "react";
import { store } from "../../redux/store.js"; // 確保引入你的 Redux store
import { useSelector, useDispatch } from "react-redux";
import {
  updateActionTable,
  updateClipboard,
  updateMultiSelectedBlocks,
  toggleMoveMode,
  // updateMusicIndex,
} from "../../redux/actions.js";
import "./audioplayer.css";
import Waveform from "./waveform.jsx";
import { musicNames } from "./musicData.js";
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
  faCheck,
  faTimes,
  faArrowsLeftRight,
} from "@fortawesome/free-solid-svg-icons";
import { produce } from "immer";
import {
  updateChosenColor,
  updatePaletteColor,
  updateIsColorChangeActive,
  updatePlaybackRate,
  updateCurrentTime,
  updateMusicFilename,
} from "../../redux/actions.js";
import { API_ENDPOINTS } from "../../config/api.js"; 
import { set } from "lodash";

const MAXZOOMVALUE = 100;

const ensureBlackBefore = (timeline, targetTime, threshold = 10) => {
  const blackTime = targetTime - threshold;
  if (blackTime <= 0) return;

  // 尋找 blackTime 附近的點
  const existingIdx = timeline.findIndex(p => Math.abs(p.time - blackTime) < 5);
  
  if (existingIdx !== -1) {
    // 如果已經有黑點就不用動，但如果是有顏色的點，就把他變黑
    const p = timeline[existingIdx];
    if (p.color.R !== 0 || p.color.G !== 0 || p.color.B !== 0) {
      p.color = { R: 0, G: 0, B: 0, A: 1 };
      p.linear = 0;
    }
  } else {
    // 檢查 blackTime 之前的最後一個點
    const prevPoints = timeline.filter(p => p.time < blackTime);
    if (prevPoints.length > 0) {
      const lastPoint = prevPoints[prevPoints.length - 1];
      // 如果前一個點不是黑色的，則必須補一個黑點
      if (lastPoint.color.R !== 0 || lastPoint.color.G !== 0 || lastPoint.color.B !== 0) {
        timeline.push({
          time: blackTime,
          color: { R: 0, G: 0, B: 0, A: 1 },
          linear: 0
        });
      }
    }
  }
};
function AudioPlayer({ setButtonState, timelineRef }) {
  const dispatch = useDispatch();
  const data = useSelector((state) => state.profiles.data);
  // const musicIndex = data?.music_index ?? 2;
  const userName = useSelector((state) => state.profiles.user);
  const musicFilename = data?.music_filename || "2026_funding.mp3";
  const showPart = useSelector((state) => state.profiles.showPart);
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration); // 音樂總長度
  const actionTable = data?.actionTable || []; // Redux 狀態中的動作表
  const timelineBlocks = useSelector((state) => state.profiles.timelineBlocks); // Redux 狀態中的時間軸區塊
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const favoriteColor = useSelector((state) => state.profiles.favoriteColor);
  const isColorChangeActive = useSelector(
    (state) => state.profiles.isColorChangeActive
  );
  const clipboard = useSelector((state) => state.profiles.clipboard);
  const multiSelectedBlocks = useSelector((state) => state.profiles.multiSelectedBlocks);
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
  const [apiMusicList, setApiMusicList] = useState([]);
  const [shiftStep, setShiftStep] = useState(0); // 0: 關閉, 1: 選起始, 2: 選結束, 3: 選目標
  const [shiftTimes, setShiftTimes] = useState({ start: 0, end: 0, target: 0 });
  const [uniformAlphaVisible, setUniformAlphaVisible] = useState(false);
  const uniformAlphaRef = useRef(null);

  useEffect(() => {
    const handleClickOutsideUniformAlpha = (e) => {
      if (
        uniformAlphaVisible &&
        uniformAlphaRef.current &&
        !uniformAlphaRef.current.contains(e.target)
      ) {
        setUniformAlphaVisible(false);
      }
    };
  
    document.addEventListener("click", handleClickOutsideUniformAlpha);
  
    return () => {
      document.removeEventListener("click", handleClickOutsideUniformAlpha);
    };
  }, [uniformAlphaVisible]);

  useEffect(() => {
    const fetchMusicList = async () => {
      if (!userName) return;
      try {
        const response = await fetch(`${API_ENDPOINTS.BASE}/get_music_list/${userName}`);
        const data = await response.json();
        if (data && data.music_list) {
          setApiMusicList(data.music_list);
        }
      } catch (error) {
        console.error("抓取音樂清單失敗:", error);
      }
    };
  
    fetchMusicList();
  }, [userName]);
  
  // 處理選單切換音樂
  const handleMusicChange = (e) => {
    const newFilename = e.target.value;
    // 更新 Redux 中的 music_filename
    dispatch(updateMusicFilename(newFilename)); 
    // 如果正在播放，停止播放以觸發 waveform 重新載入
    if (isPlaying) {
      setIsPlaying(false);
    }
  };

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
    console.log("multiSelectedBlocks for debugging:", multiSelectedBlocks);
  }, [multiSelectedBlocks]);

  useEffect(() => {
    elRefs.current = showPart.map((_, i) => elRefs.current[i] || createRef());
  }, [showPart]);

  useEffect(() => {
    if (
      isColorChangeActive &&
      multiSelectedBlocks.length > 0 &&
      chosenColor
    ) {
      // 使用 Immer 深拷贝并更新
      const updatedActionTable = produce(actionTable, (draft) => {
        multiSelectedBlocks.forEach(({ armorIndex, partIndex, blockIndex }) => {
          const timeline = draft[armorIndex][partIndex];
          if (timeline && timeline[blockIndex]) {
            timeline[blockIndex].color = chosenColor; // 更新 block 的颜色
          }
        });
      });

      // 通过 Redux 更新 actionTable
      dispatch(updateActionTable(updatedActionTable));

      console.log("Updated actionTable with new color:", chosenColor);

      // 重置调色状态
    }
  }, [isColorChangeActive, chosenColor, multiSelectedBlocks, actionTable, dispatch]);

  useEffect(() => {
    if (duration > 0) {
      const progress = (currentTime / duration) * 100; // 計算播放進度的百分比
      setProgressWidth(progress);
    }
  }, [currentTime, duration]);

  useEffect(() => {
    if (multiSelectedBlocks.length > 0) {
      const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
      const block = actionTable?.[armorIndex]?.[partIndex]?.[blockIndex];
      console.log("Selected block for brightness:", multiSelectedBlocks[0], block);
      if (block && block.color && block.color.A !== undefined) {
        setBrightness(block.color.A); // 同步選取的區塊的 alpha 值到亮度控制項
      }
    }
  }, [multiSelectedBlocks, actionTable]);

    // 在 AudioPlayer 內部新增狀態
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = () => {
    let startTime, endTime, armorIndex, partIndex, copiedPoints;
    let sourceBlocksInfo = []; // ✅ 初始化變數，確保其在整個 handleCopy 作用域可用

    // 1. 優先檢查是否有多選 (Shift 多選)
    if (multiSelectedBlocks && multiSelectedBlocks.length > 0) {
      const firstBlockPos = multiSelectedBlocks[0];
      armorIndex = firstBlockPos.armorIndex;
      partIndex = firstBlockPos.partIndex;
      sourceBlocksInfo = multiSelectedBlocks; // 儲存多選陣列

      const blocks = timelineBlocks[armorIndex][partIndex];
      const selectedIndices = multiSelectedBlocks.map(b => b.blockIndex);
      const minIdx = Math.min(...selectedIndices);
      const maxIdx = Math.max(...selectedIndices);

      startTime = blocks[minIdx].startTime;
      endTime = blocks[maxIdx].startTime + blocks[maxIdx].durationTime;
    } 
    // 2. 如果沒有多選，檢查是否有單選 (點擊單個 Block)
    // 注意：這裡假設您的 selectedBlock 格式為 { armorIndex, partIndex, blockIndex }
    else if (multiSelectedBlocks.length === 0 && data?.selectedBlock?.armorIndex !== undefined) {
      const sBlock = data.selectedBlock;
      armorIndex = sBlock.armorIndex;
      partIndex = sBlock.partIndex;
      sourceBlocksInfo = [sBlock]; // ✅ 將單選包裝成陣列，這樣渲染邏輯就統一了

      const block = timelineBlocks?.[armorIndex]?.[partIndex]?.[sBlock.blockIndex];
      if (!block) {
        console.warn("找不到選中的方塊資料");
        return;
      }

      startTime = block.startTime;
      endTime = block.startTime + block.durationTime;
    } 
    else {
      console.warn("請先選取方塊再進行複製。");
      return;
    }

    // 3. 從 actionTable 提取資料
    const timelineData = actionTable[armorIndex][partIndex];
    copiedPoints = timelineData.filter(p => p.time >= startTime && p.time <= endTime);

    if (copiedPoints.length === 0) return;

    // 4. 存入剪貼簿
    dispatch(updateClipboard({
      type: "range_fixed_time",
      data: JSON.parse(JSON.stringify(copiedPoints)),
      startTime: startTime,
      endTime: endTime,
      sourceBlocks: sourceBlocksInfo // 現在保證這裡一定有值
    }));

    setIsCopying(true); // 進入模式，讓 Timeline 顯示標記
    console.log("複製成功:", multiSelectedBlocks.length > 0 ? "區間" : "單一區塊");
  };
  const executeAdvancedPaste = (targetArmor, targetPart, offset, copiedData) => {
    const updatedActionTable = produce(actionTable, (draft) => {
      let timeline = draft[targetArmor][targetPart];
      if (!Array.isArray(timeline)) return;
  
      // A. 產生平移後的點 (根據傳入的 offset)
      const movedPoints = copiedData.map(p => ({ ...p, time: p.time + offset }));
      const newStart = movedPoints[0].time;
      const newEnd = movedPoints[movedPoints.length - 1].time;
  
      // B. 清理衝突區間：移除目標部位在 [newStart, newEnd] 內的所有點
      const indicesToRemove = new Set();
      let lastConflictIdx = -1;
      timeline.forEach((item, idx) => {
        if (item.time >= newStart && item.time <= newEnd) {
          indicesToRemove.add(idx);
          lastConflictIdx = idx;
        }
      });
  
      // 衝突後方黑塊清理：如果衝突結束後緊跟黑塊，也刪除
      if (lastConflictIdx !== -1 && lastConflictIdx + 1 < timeline.length) {
        const nextP = timeline[lastConflictIdx + 1];
        if (nextP.color.R === 0 && nextP.color.G === 0 && nextP.color.B === 0) {
          indicesToRemove.add(lastConflictIdx + 1);
        }
      }
  
      let nextTimeline = timeline.filter((_, idx) => !indicesToRemove.has(idx));
  
      // C. 插入點位並排序
      nextTimeline = [...nextTimeline, ...movedPoints].sort((a, b) => a.time - b.time);
  
      // D. 智慧黑點緩衝 (檢查起點前方是否需要黑點)
      const firstColorPoint = movedPoints.find(p => p.color.R !== 0 || p.color.G !== 0 || p.color.B !== 0);
      if (firstColorPoint) {
        ensureBlackBefore(nextTimeline, firstColorPoint.time, blackthreshold);
      }
  
      draft[targetArmor][targetPart] = nextTimeline.sort((a, b) => a.time - b.time);
    });
  
    // E. 全域重複清理並更新 Redux
    const cleaned = removeDuplicateBlackBlocks(updatedActionTable);
    dispatch(updateActionTable(cleaned));
    setIsCopying(false);
    dispatch(updateMultiSelectedBlocks([]));
  };

  const handlePasteAlignedToTarget = () => {
    if (!clipboard || multiSelectedBlocks.length === 0) return;

    const { armorIndex: targetArmor, partIndex: targetPart, blockIndex: targetBlockIdx } = multiSelectedBlocks[0];
    const targetTime = timelineBlocks[targetArmor][targetPart][targetBlockIdx].startTime;
    
    // 計算偏移量：目標時間 - 複製內容的第一個點的時間
    const offset = targetTime - clipboard.data[0].time;

    executeAdvancedPaste(targetArmor, targetPart, offset, clipboard.data);
  };

  const handlePasteFixedTime = () => {
    if (!clipboard || multiSelectedBlocks.length === 0) return;
    executeAdvancedPaste(multiSelectedBlocks[0].armorIndex, multiSelectedBlocks[0].partIndex, 0, clipboard.data);
  };
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

    if (event.key === "Escape") {
      if (isCopying) {
        event.preventDefault(); // ✅ 攔截瀏覽器預設行為
        event.stopPropagation();
        setIsCopying(false);
        dispatch(updateMultiSelectedBlocks([]));
        console.log("Cancel Copying Mode");
        return;
      }
    }
    if (event.key === "b" || event.key === "B") {
      event.preventDefault();
      if (multiSelectedBlocks.length === 1) {
        const userInput = window.prompt("請輸入頻閃間隔 (ms)，必須為 50 的倍數：", "100");
        if (userInput !== null) { // 如果使用者沒點取消
          applyBlinkEffect(userInput);
        }
      } else {
        console.warn("Please select exactly one block to use Blink effect.");
      }
    }
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

    if (event.shiftKey) {
      // Shift + C: 複製整個部位
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        console.log("Shift + C: Copy whole timeline");
        handleWholeCopy();
      }
      // Shift + V: 貼上整個部位 (整條覆蓋)
      else if (event.key === "v" || event.key === "V") {
        if (!event.ctrlKey) { // 排除 Ctrl+Shift+V
          event.preventDefault();
          console.log("Shift + V: Paste whole timeline");
          handleWholePaste();
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        console.log("Shift + ArrowRight pressed. Moving right.");
        handleGoRight();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        console.log("Shift + ArrowLeft pressed. Moving left.");
        handleGoLeft();
      }
    }

    // if (event.shiftKey && event.key === "ArrowRight") {
    //   event.preventDefault();
    //   console.log("Shift + ArrowRight pressed. Moving right.");
    //   handleGoRight();
    // }
    // if (event.shiftKey && event.key === "ArrowLeft") {
    //   event.preventDefault();
    //   console.log("Shift + ArrowLeft pressed. Moving left.");
    //   handleGoLeft();
    // }
    if (event.key === "m" || event.key === "M") {
      event.preventDefault();
      dispatch(toggleMoveMode());
    }
    if (event.key === "p" || event.key === "P") {
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
      // if (event.key === "c" || event.key === "C") {
      //   event.preventDefault();
      //   handleWholeCopy();
      // }
      // // Ctrl+V: 貼上
      // else if (event.key === "v" || event.key === "V") {
      //   event.preventDefault();
      //   handleWholePaste();
      // }
      // Ctrl + C: 只要有東西被選中就執行
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        console.log("觸發 Ctrl+C");
        handleCopy(); 
      }
      // 處理 Ctrl + V 家族 (保持原樣)
      else if (event.key === "v" || event.key === "V") {
        event.preventDefault();
        if (event.shiftKey) {
          handlePasteFixedTime(); 
        } else {
          handlePasteAlignedToTarget(); 
        }
      }
      // Ctrl+數字: 設定透明度
      else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(event.key)) {
        event.preventDefault();
        const alphaValue = parseFloat(event.key) / 10;
        handleBrightnessChange(alphaValue);
      } else if (event.key === "0") {
        event.preventDefault();
        handleBrightnessChange(0);
      }
    }
    if (event.shiftKey &&
      ["1", "2", "3", "4", "5", "6", "7", "8"].includes(event.key)
    ) {
      event.preventDefault();
      const colorIndex = parseInt(event.key) - 1;
      handleFavoriteColorInsert(colorIndex);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (multiSelectedBlocks && multiSelectedBlocks.length > 0) {
        handleMultiDelete();
      } else {
        console.log("Delete or Backspace pressed for single block.");
        ClickedDelete();
      }
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
  }, [currentTime, multiSelectedBlocks]); // 確保每次變化時都重新綁定事件處理器

  const handleFavoriteColorInsert = (colorIndex) => {
    const row = Math.floor(colorIndex / favoriteColor[0].length); // 計算第幾列
    const col = colorIndex % favoriteColor[0].length; // 計算第幾行
    insertFavoriteColorArray(favoriteColor[row % favoriteColor.length][col]);
  };

  const insertFavoriteColorArray = (color) => {
    console.log("insertFavoriteColor: ", color);
    if (multiSelectedBlocks.length === 0) {
      console.warn("No block selected.");
      return;
    }

    const { armorIndex, partIndex } = multiSelectedBlocks[0];
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
    if (multiSelectedBlocks.length === 0) return;

    const updatedActionTable = produce(actionTable, (draft) => {
      const row = Math.floor(index / favoriteColor[0].length); // 計算第幾列
      const col = index % favoriteColor[0].length; // 計算第幾行
      const newColor = { ...favoriteColor[row % favoriteColor.length][col] };

      multiSelectedBlocks.forEach(({ armorIndex, partIndex, blockIndex }) => {
        const timeline = draft[armorIndex]?.[partIndex];
        if (timeline && timeline[blockIndex]) {
          timeline[blockIndex].color = { ...newColor };
        }
      });
    });

    dispatch(updateActionTable(updatedActionTable));
  };

  // const handleAlphaChoose = (alphaValue) => {
  //   if (multiSelectedBlocks.length === 0) return;

  //   const updatedActionTable = produce(actionTable, (draft) => {
  //     multiSelectedBlocks.forEach(({ armorIndex, partIndex, blockIndex }) => {
  //       const timeline = draft[armorIndex]?.[partIndex];
  //       if (timeline && timeline[blockIndex]?.color) {
  //         timeline[blockIndex].color.A = alphaValue;
  //       }
  //     });
  //   });

  //   dispatch(updateActionTable(updatedActionTable));
  // };

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

  const handleMultiDelete = () => {
    console.log("Blacking out multiple blocks:", multiSelectedBlocks);
  
    const groupedByPart = multiSelectedBlocks.reduce((acc, block) => {
      const key = `${block.armorIndex}-${block.partIndex}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(block.blockIndex);
      return acc;
    }, {});
  
    const updatedActionTable = produce(actionTable, (draft) => {
      Object.keys(groupedByPart).forEach(key => {
        const [armorIndexStr, partIndexStr] = key.split('-');
        const armorIndex = parseInt(armorIndexStr, 10);
        const partIndex = parseInt(partIndexStr, 10);
        const blockIndexes = groupedByPart[key];
  
        const minBlockIndex = Math.min(...blockIndexes);
        const maxBlockIndex = Math.max(...blockIndexes);
  
        const partTimelineFromView = timelineBlocks[armorIndex]?.[partIndex];
        const partTimelineFromActionTable = draft[armorIndex]?.[partIndex];
        
        if (!partTimelineFromView || !partTimelineFromActionTable) return;
  
        const firstTimelineBlock = partTimelineFromView[minBlockIndex];
        const lastTimelineBlock = partTimelineFromView[maxBlockIndex];
  
        if (!firstTimelineBlock || !lastTimelineBlock) return;
  
        const selectionStartTime = firstTimelineBlock.startTime;
        const selectionEndTime = lastTimelineBlock.startTime + lastTimelineBlock.durationTime;
  
        const startIndexToActionTable = partTimelineFromActionTable.findIndex(entry => entry.time === selectionStartTime);
        
        if (startIndexToActionTable === -1) return;
  
        partTimelineFromActionTable[startIndexToActionTable].color = { R: 0, G: 0, B: 0, A: 1 };
        partTimelineFromActionTable[startIndexToActionTable].linear = 0;
  
        let deleteStartIndex = startIndexToActionTable + 1;
        let deleteCount = 0;
        while (deleteStartIndex + deleteCount < partTimelineFromActionTable.length &&
               partTimelineFromActionTable[deleteStartIndex + deleteCount].time < selectionEndTime) {
          deleteCount++;
        }
  
        if (deleteCount > 0) {
          partTimelineFromActionTable.splice(deleteStartIndex, deleteCount);
        }
      });
    });
  
    const cleanedActionTable = removeDuplicateBlackBlocks(updatedActionTable);
  
    dispatch(updateActionTable(cleanedActionTable));
    dispatch(updateMultiSelectedBlocks([]));
  };

  const ClickedDelete = () => {
    if (multiSelectedBlocks.length === 0) return;
    handleMultiDelete();
  };

  const handleSetLinear = () => {
    if (multiSelectedBlocks.length === 0) return;

    const updatedActionTable = produce(actionTable, (draft) => {
      multiSelectedBlocks.forEach(({ armorIndex, partIndex, blockIndex }) => {
        const block = draft[armorIndex]?.[partIndex]?.[blockIndex];
        if (block) {
          block.linear = block.linear === 1 ? 0 : 1;
        }
      });
    });

    dispatch(updateActionTable(updatedActionTable));
  };

  const applyBlinkEffect = (periodInput) => {
    const period = parseInt(periodInput, 10);
    if (isNaN(period) || period <= 0 || period % 50 !== 0) {
      alert("請輸入 50 的倍數！");
      return;
    }
  
    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
  
    const updatedActionTable = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex][partIndex];
      const viewBlock = timelineBlocks[armorIndex][partIndex][blockIndex];
      if (!viewBlock) return;
  
      // 1. 強制校正起始點到 50ms 網格
      const startTime = Math.round(viewBlock.startTime / 50) * 50;
      const totalDuration = viewBlock.durationTime;
      const activeBlock = timeline[blockIndex];
      const isLinear = activeBlock.linear === 1;
  
      let targetEndBlock = null;
      if (isLinear) {
        for (let i = blockIndex + 1; i < timeline.length; i++) {
          const p = timeline[i];
          if (p.color.R !== 0 || p.color.G !== 0 || p.color.B !== 0) {
            targetEndBlock = p;
            break;
          }
        }
      }
  
      const blinkCount = Math.floor(totalDuration / period);
      const newPoints = [];
  
      for (let i = 0; i < blinkCount; i++) {
        const baseTime = startTime + i * period; // 這裡絕對是 50 的倍數
        let currentColor = { ...activeBlock.color };
  
        if (isLinear && targetEndBlock) {
          const f = (baseTime - activeBlock.time) / (targetEndBlock.time - activeBlock.time);
          currentColor = {
            R: Math.round(activeBlock.color.R * (1 - f) + targetEndBlock.color.R * f),
            G: Math.round(activeBlock.color.G * (1 - f) + targetEndBlock.color.G * f),
            B: Math.round(activeBlock.color.B * (1 - f) + targetEndBlock.color.B * f),
            A: activeBlock.color.A * (1 - f) + targetEndBlock.color.A * f,
          };
        }
  
        // ✅ 彩色點：絕對對齊 50ms
        newPoints.push({ time: baseTime, color: currentColor, linear: 0 });
  
        // ✅ 黑色緩衝點：保留 10ms 縫隙（這點不會是 50 倍數，但能維持閃爍感）
        newPoints.push({
          time: baseTime + period - blackthreshold, 
          color: { R: 0, G: 0, B: 0, A: 1 },
          linear: 0,
        });
      }
  
      timeline.splice(blockIndex, 1, ...newPoints);
      timeline.sort((a, b) => a.time - b.time);
    });
  
    dispatch(updateActionTable(removeDuplicateBlackBlocks(updatedActionTable)));
    setEffectMenuVisible(false);
  };

  const removeDuplicateBlackBlocks = (actionTable) => {
    return produce(actionTable, (draft) => {
      Object.values(draft).forEach(armor => {
        Object.keys(armor).forEach(partKey => {
          let timeline = armor[partKey];
          if (!Array.isArray(timeline)) return;

          armor[partKey] = timeline.filter((block, index) => {
            const isBlack = block.color.R === 0 && block.color.G === 0 && block.color.B === 0;
            if (!isBlack) return true;

            const prev = timeline[index - 1];
            if (prev) {
              const prevIsBlack = prev.color.R === 0 && prev.color.G === 0 && prev.color.B === 0;
              // 如果連續兩個黑點，或者是時間點重疊/太接近的黑點，刪除後者
              if (prevIsBlack || Math.abs(block.time - prev.time) < 5) return false;
            }
            return true;
          });
        });
      });
    });
  };

  const ClickedColorChange = () => {
    console.log("Color Change clicked");

    if (multiSelectedBlocks.length === 0) return;

    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];

    const block =
      timelineBlocks?.[armorIndex]?.[partIndex]?.[blockIndex];

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
    if (multiSelectedBlocks.length === 0) return;

    const { armorIndex, partIndex } = multiSelectedBlocks[0];
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
    if (multiSelectedBlocks.length === 0) return;
    const { armorIndex, partIndex } = multiSelectedBlocks[0];
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
    if (multiSelectedBlocks.length !== 1) {
      console.warn("Cut operation is only valid when exactly one block is selected.");
      return;
    }
    
    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
    
    const updatedActionTable = produce(actionTable, (draft) => {
      const timeline = draft[armorIndex]?.[partIndex];
      const originalBlock = timeline?.[blockIndex];
      const nextBlock = timeline?.[blockIndex + 1];
      
      if (!originalBlock || !nextBlock || currentTime <= originalBlock.time || currentTime >= nextBlock.time) {
        console.warn("Cut operation is not valid at the current time.");
        return;
      }
  
      let newBlockColor = originalBlock.color;
      const isOriginalLinear = originalBlock.linear === 1;
  
      if (isOriginalLinear) {
        const gradientTargetBlock = timeline[blockIndex + 2];
        const startColor = originalBlock.color;
        const endColor = gradientTargetBlock?.color || { R: 0, G: 0, B: 0, A: 1 };
        const startTime = originalBlock.time;
        const endTime = nextBlock.time;
  
        if (endTime > startTime) {
          const ratio = (currentTime - startTime) / (endTime - startTime);
          newBlockColor = {
            R: Math.round(startColor.R * (1 - ratio) + endColor.R * ratio),
            G: Math.round(startColor.G * (1 - ratio) + endColor.G * ratio),
            B: Math.round(startColor.B * (1 - ratio) + endColor.B * ratio),
            A: ((startColor.A ?? 1) * (1 - ratio) + (endColor.A ?? 1) * ratio),
          };
        }
        originalBlock.linear = 1;
      }
      
      const newBlackBlock = {
        time: currentTime - blackthreshold,
        color: { R: 0, G: 0, B: 0, A: 1 },
        linear: 0,
      };
      
      const newBlock = {
        time: currentTime,
        color: newBlockColor,
        linear: isOriginalLinear ? 1 : 0,
      };
  
      timeline.splice(blockIndex + 1, 0, newBlackBlock, newBlock);
      timeline.sort((a, b) => a.time - b.time);
    });
  
    dispatch(updateActionTable(updatedActionTable));
    
    dispatch(
      updateMultiSelectedBlocks([{
        armorIndex,
        partIndex,
        blockIndex: blockIndex + 2,
      }])
    );
  };

  const handleWholeCopy = () => {
    console.log("Copy clicked");
    if (multiSelectedBlocks.length === 0) {
      console.warn("No block selected. Cannot copy.");
      return;
    }

    const { armorIndex, partIndex } = multiSelectedBlocks[0];

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

  const handleWholePaste = () => {
    console.log("Paste clicked");

    // 檢查剪貼簿是否有資料
    if (!clipboard || !clipboard.data || clipboard.data.length === 0) {
      console.warn("Clipboard is empty. Nothing to paste.");
      return;
    }

    // 檢查是否有選中的方塊
    if (multiSelectedBlocks.length === 0) {
      console.warn("No block selected. Cannot determine paste target.");
      return;
    }

    const { armorIndex: targetArmorIndex, partIndex: targetPartIndex } =
      multiSelectedBlocks[0];

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
      updateMultiSelectedBlocks([{
        armorIndex: targetArmorIndex,
        partIndex: targetPartIndex,
        blockIndex: newBlockIndex,
      }])
    );
  };

  const handleBrightnessChange = (newBrightness) => {
    if (!multiSelectedBlocks || multiSelectedBlocks.length === 0) {
      console.warn("No blocks selected to change brightness.");
      return;
    }
  
    const rawValue = Number(newBrightness);
  
    if (Number.isNaN(rawValue)) {
      console.warn("Invalid brightness value:", newBrightness);
      return;
    }
  
    const alphaValue = Math.max(0, Math.min(1, rawValue));
  
    const updatedActionTable = produce(actionTable, (draft) => {
      multiSelectedBlocks.forEach(({ armorIndex, partIndex, blockIndex }) => {
        const timeline = draft[armorIndex]?.[partIndex];
  
        if (timeline?.[blockIndex]?.color) {
          timeline[blockIndex].color.A = alphaValue;
        }
      });
    });
  
    dispatch(updateActionTable(updatedActionTable));
  
    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
    const firstBlockColor = actionTable?.[armorIndex]?.[partIndex]?.[blockIndex]?.color;
  
    if (firstBlockColor) {
      dispatch(updateChosenColor({ ...firstBlockColor, A: alphaValue }));
    }
  
    setBrightness(alphaValue);
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
    if (multiSelectedBlocks.length !== 1) {
      console.warn("Gradient effect is only valid when exactly one block is selected.");
      return;
    }

    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];

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

  const handleShiftStep = () => {
    const currentT = Math.floor(currentTime / 50) * 50; // 對齊 50ms 網格

    if (shiftStep === 0) {
      setShiftStep(1);
    } else if (shiftStep === 1) {
      setShiftTimes(prev => ({ ...prev, start: currentT }));
      setShiftStep(2);
    } else if (shiftStep === 2) {
      if (currentT <= shiftTimes.start) {
        alert("結束時間必須大於起始時間！");
        return;
      }
      setShiftTimes(prev => ({ ...prev, end: currentT }));
      setShiftStep(3);
    } else if (shiftStep === 3) {
      executeTimeShift(shiftTimes.start, shiftTimes.end, currentT);
      resetShift();
    }
  };

  const resetShift = () => {
    setShiftStep(0);
    setShiftTimes({ start: 0, end: 0, target: 0 });
  };

  // 3. 核心資料搬移邏輯
  const executeTimeShift = (start, end, target) => {
    const safeStart = Math.floor(start / 50) * 50;
    const safeEnd = Math.floor(end / 50) * 50;
    const safeTarget = Math.floor(target / 50) * 50;
  
    if (safeEnd <= safeStart) {
      alert("結束時間必須大於起始時間！");
      return;
    }
  
    const selectedTimes = [];
  
    Object.values(actionTable || {}).forEach((armor) => {
      Object.values(armor || {}).forEach((timeline) => {
        if (!Array.isArray(timeline)) return;
  
        timeline.forEach((p) => {
          if (
            p &&
            typeof p.time === "number" &&
            p.time >= safeStart &&
            p.time <= safeEnd
          ) {
            selectedTimes.push(p.time);
          }
        });
      });
    });
  
    if (selectedTimes.length === 0) {
      alert("選取區間內沒有任何光點可以平移！");
      return;
    }
  
    const globalFirstTime = Math.min(...selectedTimes);
    const offset = safeTarget - globalFirstTime;
  
    const updatedActionTable = produce(actionTable, (draft) => {
      Object.keys(draft).forEach((armorIdx) => {
        Object.keys(draft[armorIdx]).forEach((partIdx) => {
          const timeline = draft[armorIdx][partIdx];
  
          if (!Array.isArray(timeline)) return;
  
          const moveIndices = [];
  
          timeline.forEach((p, idx) => {
            if (p.time >= safeStart && p.time <= safeEnd) {
              moveIndices.push(idx);
            }
          });
  
          if (moveIndices.length === 0) return;
  
          const movedPoints = moveIndices.map((idx) => ({
            ...timeline[idx],
            color: { ...timeline[idx].color },
            time: timeline[idx].time + offset,
          }));
  
          const newStart = Math.min(...movedPoints.map((p) => p.time));
          const newEnd = Math.max(...movedPoints.map((p) => p.time));
  
          const toRemove = new Set(moveIndices);
  
          timeline.forEach((p, idx) => {
            if (p.time >= newStart && p.time <= newEnd) {
              toRemove.add(idx);
            }
          });
  
          let nextTimeline = timeline.filter((_, idx) => !toRemove.has(idx));
  
          nextTimeline = [...nextTimeline, ...movedPoints].sort(
            (a, b) => a.time - b.time
          );
  
          const firstColorPoint = movedPoints.find(
            (p) => p.color.R !== 0 || p.color.G !== 0 || p.color.B !== 0
          );
  
          if (firstColorPoint) {
            ensureBlackBefore(nextTimeline, firstColorPoint.time, blackthreshold);
          }
  
          draft[armorIdx][partIdx] = nextTimeline.sort((a, b) => a.time - b.time);
        });
      });
    });
  
    const cleanedActionTable = removeDuplicateBlackBlocks(updatedActionTable);
  
    dispatch(updateActionTable(cleanedActionTable));
    dispatch(updateCurrentTime(safeTarget));
  };

  const handleUniformAlphaButtonClick = (e) => {
    e?.stopPropagation();
  
    if (!multiSelectedBlocks || multiSelectedBlocks.length !== 1) {
      alert("請先只選取一個色塊");
      return;
    }
  
    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
    const selectedBlock = actionTable?.[armorIndex]?.[partIndex]?.[blockIndex];
  
    if (!selectedBlock?.color) {
      alert("找不到 selectedBlock 的顏色資料");
      return;
    }
  
    setUniformAlphaVisible((prev) => !prev);
  };
  
  const handleUniformSameColorAlphaChange = (newAlpha) => {
    if (!multiSelectedBlocks || multiSelectedBlocks.length !== 1) {
      alert("請先只選取一個色塊");
      return;
    }
  
    const rawValue = Number(newAlpha);
  
    if (Number.isNaN(rawValue)) {
      console.warn("Invalid alpha value:", newAlpha);
      return;
    }
  
    const alphaValue = Math.max(0, Math.min(1, rawValue));
  
    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
    const selectedColor = actionTable?.[armorIndex]?.[partIndex]?.[blockIndex]?.color;
  
    if (!selectedColor) {
      alert("找不到 selectedBlock 的顏色資料");
      return;
    }
  
    const targetR = Number(selectedColor.R);
    const targetG = Number(selectedColor.G);
    const targetB = Number(selectedColor.B);
  
    const updatedActionTable = produce(actionTable, (draft) => {
      Object.values(draft || {}).forEach((armor) => {
        Object.values(armor || {}).forEach((timeline) => {
          if (!Array.isArray(timeline)) return;
  
          timeline.forEach((block) => {
            const color = block?.color;
            if (!color) return;
  
            const sameColor =
              Number(color.R) === targetR &&
              Number(color.G) === targetG &&
              Number(color.B) === targetB;
  
            if (sameColor) {
              color.A = alphaValue;
            }
          });
        });
      });
    });
  
    dispatch(updateActionTable(updatedActionTable));
    dispatch(updateChosenColor({ ...selectedColor, A: alphaValue }));
    setBrightness(alphaValue);
    setUniformAlphaVisible(false);
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
      isCopying={isCopying}
    />
  ));

  return (
    <div className="audio-player-container">
      {isCopying && (
        <div className="copy-mode-banner">
          <span>📋 Copy Mode Active (Interval: {clipboard?.startTime}ms ~ {clipboard?.endTime}ms)</span>
          <span className="hint-text">Press [ESC] to Cancel or click Target then [Ctrl+V]</span>
        </div>
      )}
      <div className="controls">
        {/* 僅顯示目前的檔名，無選單功能 */}
        {/* <div className="current-track-display" style={{ marginRight: "10px", display: "flex", alignItems: "center" }}>
          <span className="badge bg-secondary" style={{ padding: "8px", fontSize: "14px" }}>
            🎵 {musicFilename}
          </span>
        </div> */}
        <div className="current-track-display" style={{ marginRight: "10px", display: "flex", alignItems: "center" }}>
          <div className="dropdown">
            <select
              className="dropdown-select"
              value={musicFilename}
              onChange={handleMusicChange}
              style={{ 
                minWidth: "150px", 
                backgroundColor: "#2c3e50", 
                color: "white", 
                border: "1px solid #34495e",
                borderRadius: "4px",
                padding: "5px"
              }}
            >
              {/* 如果目前的音樂不在清單中，顯示一個預設選項 */}
              {!apiMusicList.includes(musicFilename) && (
                <option value={musicFilename}>{musicFilename} (目前)</option>
              )}
              
              {apiMusicList.map((filename, index) => (
                <option key={index} value={filename}>
                  🎵 {filename}
                </option>
              ))}
            </select>
            <span className="tooltip">Switch Track</span>
          </div>
        </div>
        <div
          ref={uniformAlphaRef}
          className="uniform-alpha-wrapper"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="shift-main-button"
            onClick={handleUniformAlphaButtonClick}
          >
            <FontAwesomeIcon icon={faCircleHalfStroke} size="lg" />
            <span className="tooltip">Set opacity for all blocks with selected color</span>
          </button>

          {uniformAlphaVisible && (
            <div className="uniform-alpha-menu">
              {[
                { value: 0, label: "0%" },
                { value: 0.1, label: "10%" },
                { value: 0.2, label: "20%" },
                { value: 0.3, label: "30%" },
                { value: 0.4, label: "40%" },
                { value: 0.5, label: "50%" },
                { value: 0.6, label: "60%" },
                { value: 0.7, label: "70%" },
                { value: 0.8, label: "80%" },
                { value: 0.9, label: "90%" },
                { value: 1, label: "100%" },
              ].map((item) => (
                <button
                  key={item.value}
                  className="uniform-alpha-option"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUniformSameColorAlphaChange(item.value);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="shift-tool-wrapper">
          {shiftStep === 0 ? (
            <button className="shift-main-button" onClick={() => setShiftStep(1)}>
              <FontAwesomeIcon icon={faArrowsLeftRight} size="lg" />
              <span className="tooltip">Shift all light dance data within the interval</span>
            </button>
          ) : (
            <div className="shift-guide-panel">
              <span className="shift-message">
                {shiftStep === 1 && `[1/3] 設定「起始點」: ${Math.floor(currentTime/50)*50}ms`}
                {shiftStep === 2 && `[2/3] 起始: ${shiftTimes.start}ms -> 設定「結束點」`}
                {shiftStep === 3 && `[3/3] 區塊: ${shiftTimes.start}~${shiftTimes.end}ms -> 設定「目標位置」`}
              </span>
              <button className="shift-confirm-btn" onClick={handleShiftStep}>
                <FontAwesomeIcon icon={faCheck} /> 確定
              </button>
              <button className="shift-cancel-btn" onClick={resetShift}>
                <FontAwesomeIcon icon={faTimes} /> 取消
              </button>
            </div>
          )}
        </div>
        <div className="effect-wrapper">
          <button className="effect-button" onClick={handleEffect}>
            <FontAwesomeIcon icon={faWandMagicSparkles} size="lg" />
            <span className="tooltip">Effect</span>
          </button>

          {/* 一級選單 */}
          {effectMenuVisible && (
          <div className="effect-menu">
            <div
              className="effect-menu-item"
              onClick={() => {
                handleSetLinear();
                setEffectMenuVisible(false);
              }}
            >
              漸變 (L)
            </div>

            <div
              className="effect-menu-item"
              onClick={() => {
                const userInput = window.prompt("請輸入頻閃間隔 (ms)，必須為 50 的倍數：", "100");
                if (userInput !== null) {
                  applyBlinkEffect(userInput);
                }
              }}
            >
              頻閃 (B)
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
            <option value="0">0%</option>
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
          <span className="tooltip">Color( P )</span>
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
          <span className="current-time-box">{formatTime(currentTime)}</span>
          <span className="time-separator">/</span>
          <span className="duration-box">{formatTime(duration)}</span>
          {/* <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div> */}
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
          {shiftStep >= 2 && (
          <div
            className="shift-marker start-marker"
            style={{ left: `${(shiftTimes.start / duration) * 100}%` }}
          >
            <span className="marker-label">Start</span>
          </div>
          )}
          {shiftStep >= 3 && (
          <div
            className="shift-marker end-marker"
            style={{ left: `${(shiftTimes.end / duration) * 100}%` }}
          >
            <span className="marker-label">End</span>
          </div>
          )}
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
