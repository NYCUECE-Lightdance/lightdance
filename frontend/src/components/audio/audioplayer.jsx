import React, { useRef, useState, useEffect, createRef } from "react";
import { store } from "../../redux/store.js"; // 確保引入你的 Redux store
import { useSelector, useDispatch } from "react-redux";
import {
  updateActionTable,
  updateClipboard,
  updateMultiSelectedBlocks,
  // updateMusicIndex,
} from "../../redux/actions.js";
import "./audioplayer.css";
import Waveform from "./waveform.jsx";
import Timeline from "./Timeline.jsx";
import { produce } from "immer";
import {
  updateChosenColor,
  updatePaletteColor,
  updateIsColorChangeActive,
  updatePlaybackRate,
  updateCurrentTime,
} from "../../redux/actions.js";
import { API_ENDPOINTS } from "../../config/api.js";
import { insertColor } from "../../utils/actionTable/insertColor.js";
import { cutAt } from "../../utils/actionTable/cut.js";
import { applyBlink } from "../../utils/actionTable/blink.js";
import { applyGradient, inferGradientColors } from "../../utils/actionTable/gradient.js";
import { shift as shiftTimeRange } from "../../utils/actionTable/shift.js";
import { paste as pasteSegments } from "../../utils/actionTable/paste.js";
import { deleteRange as deleteRangeUtil } from "../../utils/actionTable/deleteRange.js";
import MusicSelector from "./MusicSelector.jsx";
import ShiftTool from "./ShiftTool.jsx";
import PlayerControls from "./PlayerControls.jsx";
import TrackToolbar from "./TrackToolbar.jsx";
import EffectMenu from "./EffectMenu.jsx";

const MAXZOOMVALUE = 100;

function AudioPlayer({ setButtonState, timelineRef }) {
  const dispatch = useDispatch();
  const data = useSelector((state) => state.profiles.data);
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

  const [shiftStep, setShiftStep] = useState(0); // 0: 關閉, 1: 選起始, 2: 選結束, 3: 選目標
  const [shiftTimes, setShiftTimes] = useState({ start: 0, end: 0, target: 0 });

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
    const cleaned = pasteSegments(actionTable, {
      targetArmor,
      targetPart,
      offset,
      copiedData,
      blackthreshold,
    });
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
        handleAlphaChoose(alphaValue);
      } else if (event.key === "0") {
        // 檢測 Ctrl + 0
        event.preventDefault();
        handleAlphaChoose(1.0);
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
    if (multiSelectedBlocks.length === 0) {
      console.warn("No block selected.");
      return;
    }
    const { armorIndex, partIndex } = multiSelectedBlocks[0];
    const { table, alignedTime } = insertColor(actionTable, {
      armor: armorIndex,
      part: partIndex,
      time: currentTime,
      color,
      duration,
    });
    dispatch(updateCurrentTime(alignedTime));
    dispatch(updateActionTable(table));
  };

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

  const handleAlphaChoose = (alphaValue) => {
    if (multiSelectedBlocks.length === 0) return;

    const updatedActionTable = produce(actionTable, (draft) => {
      multiSelectedBlocks.forEach(({ armorIndex, partIndex, blockIndex }) => {
        const timeline = draft[armorIndex]?.[partIndex];
        if (timeline && timeline[blockIndex]?.color) {
          timeline[blockIndex].color.A = alphaValue;
        }
      });
    });

    dispatch(updateActionTable(updatedActionTable));
  };

  const handleZoom = (event) => {
    setZoomLevel(Math.floor(event.target.value));
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
    const cleaned = deleteRangeUtil(actionTable, {
      selections: multiSelectedBlocks,
      timelineBlocks,
    });
    dispatch(updateActionTable(cleaned));
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
    const viewBlock = timelineBlocks?.[armorIndex]?.[partIndex]?.[blockIndex];
    const updated = applyBlink(actionTable, {
      armor: armorIndex,
      part: partIndex,
      blockIndex,
      period,
      viewBlock,
    });
    dispatch(updateActionTable(updated));
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
    if (multiSelectedBlocks.length !== 1) return;
    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
    const updated = cutAt(actionTable, {
      armor: armorIndex,
      part: partIndex,
      blockIndex,
      currentTime,
    });
    dispatch(updateActionTable(updated));
    dispatch(
      updateMultiSelectedBlocks([{ armorIndex, partIndex, blockIndex: blockIndex + 2 }])
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
    // 檢查是否有選中任何 block
    if (!multiSelectedBlocks || multiSelectedBlocks.length === 0) {
      console.warn("No blocks selected to change brightness.");
      return;
    }
  
    const alphaValue = parseFloat(newBrightness);
  
    // 使用 Immer 更新 actionTable
    const updatedActionTable = produce(actionTable, (draft) => {
      multiSelectedBlocks.forEach(({ armorIndex, partIndex, blockIndex }) => {
        const timeline = draft[armorIndex]?.[partIndex];
        if (timeline && timeline[blockIndex]) {
          // 1. 更新每個選中點的 A (Alpha) 值
          timeline[blockIndex].color.A = alphaValue;
        }
      });
    });
  
    // 2. 更新到 Redux
    dispatch(updateActionTable(updatedActionTable));
  
    // 3. ✅ 同步更新 chosenColor (讓調色盤也知道現在 Alpha 變了)
    if (multiSelectedBlocks.length > 0) {
      const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
      const firstBlockColor = actionTable[armorIndex][partIndex][blockIndex].color;
      dispatch(updateChosenColor({ ...firstBlockColor, A: alphaValue }));
    }
  
    // 更新本地選單 UI 狀態
    setBrightness(newBrightness);
  };

  // ⚠️ 新規格 (B6 2026-04-07)：使用者直接指定首尾顏色，預設取前後最近非黑色塊。
  // 舊參數 (startBrightness, interval, endBrightness) 已不再使用，改傳 {startColor, endColor}。
  // 若呼叫端未提供顏色，從 timeline 推斷。
  const applyGradientEffect = (startColor, endColor) => {
    if (multiSelectedBlocks.length !== 1) return;
    const { armorIndex, partIndex, blockIndex } = multiSelectedBlocks[0];
    const timeline = actionTable?.[armorIndex]?.[partIndex] || [];
    const viewBlock = timelineBlocks?.[armorIndex]?.[partIndex]?.[blockIndex];
    if (!viewBlock) return;
    let s = startColor;
    let e = endColor;
    if (!s || !e) {
      const inferred = inferGradientColors(timeline, blockIndex);
      s = s || inferred.startColor;
      e = e || inferred.endColor;
    }
    const updated = applyGradient(actionTable, {
      armor: armorIndex,
      part: partIndex,
      blockIndex,
      startColor: s,
      endColor: e,
      viewBlock,
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

  const executeTimeShift = (start, end, target) => {
    const cleaned = shiftTimeRange(actionTable, {
      start,
      end,
      target,
      blackthreshold,
    });
    dispatch(updateActionTable(cleaned));
    dispatch(updateCurrentTime(target));
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
        <MusicSelector onChangeStopPlaying={() => isPlaying && setIsPlaying(false)} />
        <ShiftTool
          shiftStep={shiftStep}
          shiftTimes={shiftTimes}
          currentTime={currentTime}
          onStart={() => setShiftStep(1)}
          onConfirm={handleShiftStep}
          onCancel={resetShift}
        />
        <EffectMenu onSetLinear={handleSetLinear} onApplyBlink={applyBlinkEffect} />
        <TrackToolbar
          onGoLeft={handleGoLeft}
          onGoRight={handleGoRight}
          onCut={handleCut}
          onDelete={ClickedDelete}
          brightness={brightness}
          onBrightnessChange={handleBrightnessChange}
          onColorChange={ClickedColorChange}
          playbackRate={playbackRate}
          onSpeedChange={handleSpeedChange}
        />
        <PlayerControls
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          currentTime={currentTime}
          duration={duration}
          zoomLevel={zoomLevel}
          maxZoom={MAXZOOMVALUE}
          onZoomChange={handleZoom}
          onZoomMinus={handleminuszoom}
          onZoomPlus={handlepluszoom}
          volume={volume}
          onVolumeChange={handleVolumeChange}
        />
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
