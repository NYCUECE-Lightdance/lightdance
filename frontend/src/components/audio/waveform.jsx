import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import music from "./musicsrc/2026_funding.mp3";
import {
  updateCurrentTime,
  updateDuration,
  updateFullpeaks,
} from "../../redux/actions";

// 輔助函數：載入並解碼音頻
async function loadAudioData(url, audioContext) {
  const response = await fetch(url); // 從指定的 URL 獲取音頻文件
  const arrayBuffer = await response.arrayBuffer(); // 轉換為 ArrayBuffer
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer); // 解碼音頻數據
  return audioBuffer;
}

// 輔助函數：根據音頻數據獲取波峰
function getPeaks(audioBuffer, samplesPerPixel = 200000) {
  const channelData = audioBuffer.getChannelData(0); // 獲取左聲道數據
  const peaks = [];
  let maxPeak = 0;
  console.log("channelData", channelData.length);

  const blockSize = channelData.length / samplesPerPixel; // 計算每個區塊的大小
  for (let i = 0; i < samplesPerPixel; i++) {
    const blockStart = Math.floor(i * blockSize);
    const blockEnd = Math.floor(blockStart + blockSize);
    let max = 0;

    for (let j = blockStart; j < blockEnd; j++) {
      if (Math.abs(channelData[j]) > max) {
        max = Math.abs(channelData[j]); // 找到區塊內的最大值
      }
    }

    peaks.push(max); // 儲存該區塊的最大峰值
    if (max > maxPeak) maxPeak = max; // 更新整體最大峰值
  }

  // 將峰值正規化到 [0, 1] 範圍內
  const normalizedPeaks = peaks.map((peak) => peak / maxPeak);
  return normalizedPeaks;
}

// AudioWaveform 組件
const AudioWaveform = ({
  url,
  isPlaying,
  setIsPlaying,
  // audioRef,
  zoomValue,
  scrollRef,
  volume,
  sourceNode,
  setSourceNode,
  containerRef,
}) => {
  const canvasRef = useRef(null);
  const [audioContext] = useState(
    () => new (window.AudioContext || window.webkitAudioContext)()
  ); // 創建 AudioContext
  const dispatch = useDispatch();
  const duration = useSelector((state) => state.profiles.duration); // 獲取音頻總時長
  const currentTime = useSelector((state) => state.profiles.currentTime); // 獲取當前播放時間
  const fullPeaks = useSelector((state) => state.profiles.fullPeaks); // 獲取全分辨率的波峰數據
  const playbackRate = useSelector((state) => state.profiles.playbackRate); // 獲取播放速率
  const [canvasWidth, setCanvasWidth] = useState(0); // 設置 canvas 寬度
  const [canvasHeight, setCanvasHeight] = useState(0); // 設置 canvas 高度
  const [hoverTime, setHoverTime] = useState(null); // 懸停顯示的時間
  const [hoverPosition, setHoverPosition] = useState(null); // 懸停的 X 位置
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollPosition, setScrollPosition] = useState(0);
  const animationFrameRef = useRef(null); // 用於 requestAnimationFrame

  const [audioBuffer, setAudioBuffer] = useState(null);
  const gainNodeRef = useRef(null);

  const [startTime, setStartTime] = useState(0);
  const animationRef = useRef(null);
  // 監聽滾動並更新`scrollPosition`
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollRef.current) return;
      setScrollPosition(scrollRef.current.scrollLeft);
    };
    scrollRef.current?.addEventListener("scroll", handleScroll);
    return () => scrollRef.current?.removeEventListener("scroll", handleScroll);
  }, [scrollRef]);

  // 監聽視窗大小變化
  useEffect(() => {
    const updateViewportWidth = () => {
      if (scrollRef.current) {
        setViewportWidth(scrollRef.current.clientWidth);
      }
    };

    window.addEventListener("resize", updateViewportWidth);
    updateViewportWidth(); // 初始設定

    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  // 設置 canvas 大小
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight || 200; // 預設高度 200
      setCanvasWidth(containerWidth); // 設置 canvas 寬度
      setCanvasHeight(containerHeight); // 設置 canvas 高度
    }
  }, [containerRef, zoomValue]);

  // Handle playback
  useEffect(() => {
    if (isPlaying && audioBuffer) {
      const newSource = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      newSource.buffer = audioBuffer;
      newSource.playbackRate.value = playbackRate || 1;
      gainNode.gain.value = volume;
      gainNodeRef.current = gainNode;

      newSource.connect(gainNode).connect(audioContext.destination);
      const offset = currentTime / 1000; // 將毫秒轉換為秒
      const now = audioContext.currentTime;
      newSource.start(0, offset);
      setStartTime(now - offset);
      setSourceNode(newSource);

      newSource.onended = () => {
        setIsPlaying(false);
      };
    } else if (!isPlaying && sourceNode) {
      sourceNode.stop();
      const elapsed = audioContext.currentTime - startTime;
      const rawTime = elapsed * 1000; // 單位毫秒
      const alignedTime = Math.floor(rawTime / 50) * 50; // 對齊到 50ms
      dispatch(updateCurrentTime(alignedTime));
    }
  }, [isPlaying]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // 更新播放速度
  useEffect(() => {
    if (sourceNode && isPlaying) {
      sourceNode.playbackRate.value = playbackRate || 1;
      // 重新計算 startTime 以配合新的播放速度
      // 當前音訊位置 (毫秒) = currentTime
      // 實際經過時間 (秒) = audioContext.currentTime
      // 新的 startTime = 現在時間 - (當前音訊位置 / 新播放速度)
      const now = audioContext.currentTime;
      setStartTime(now - (currentTime / 1000) / (playbackRate || 1));
    }
  }, [playbackRate]);

  useEffect(() => {
    if (scrollRef?.current && duration > 0) {
      const container = scrollRef.current;
      const progress = currentTime / duration; // 當前播放比例
      const newScrollLeft = progress * canvasWidth - container.clientWidth / 2;

      // 最大 scrollLeft：canvas 寬度 - 容器寬度
      const maxScrollLeft = canvasWidth - container.clientWidth;

      // Clamp 範圍 [0, maxScrollLeft]
      container.scrollLeft = Math.max(
        0,
        Math.min(newScrollLeft, maxScrollLeft)
      );
    }
  }, [zoomValue, canvasWidth, duration, scrollRef]);

  useEffect(() => {
    // if (fullPeaks && fullPeaks.length > 0) return;
    loadAudioData(music, audioContext).then((buffer) => {
      const peaks = getPeaks(buffer);
      setAudioBuffer(buffer);
      dispatch(updateDuration(buffer.duration * 1000));
      if (fullPeaks && fullPeaks.length > 0) return;
      dispatch(updateFullpeaks(peaks));
    });
  }, [audioContext, fullPeaks, dispatch]);

  // 根據 zoomValue 重繪波形
  // useEffect(() => {
  //   if (fullPeaks && fullPeaks.length > 0) {
  //     const canvas = canvasRef.current;
  //     // const targetBarCount = 3000;
  //     // const displayPeaks = resamplePeaks(fullPeaks, targetBarCount);
  //     // drawWaveforms(canvas); // 然後傳入這個版本
  //   }
  // }, [fullPeaks, zoomValue, scrollPosition, currentTime]);

  // 根據當前播放時間更新波形進度
  useEffect(() => {
    if (currentTime && fullPeaks && fullPeaks.length > 0) {
      const canvas = canvasRef.current;
      // const targetBarCount = 3000;
      // const displayPeaks = resamplePeaks(fullPeaks, targetBarCount);
      drawWaveforms(canvas); // 然後傳入這個版本
    }
  }, [currentTime, fullPeaks, zoomValue, scrollPosition, viewportWidth]);

  // 使用 requestAnimationFrame 更新進度條

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateProgress);
    } else {
      cancelAnimationFrame(animationRef.current);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, startTime]);

  const updateProgress = () => {
    if (isPlaying && audioBuffer) {
      const elapsed = (audioContext.currentTime - startTime) * (playbackRate || 1) * 1000;
      dispatch(updateCurrentTime(elapsed));
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  };

  // 當播放狀態改變時，啟動或停止進度更新
  // useEffect(() => {
  //   if (isPlaying) {
  //     animationFrameRef.current = requestAnimationFrame(updateProgress);
  //   } else {
  //     cancelAnimationFrame(animationFrameRef.current);
  //   }

  //   return () => cancelAnimationFrame(animationFrameRef.current); // 清理動畫
  // }, [isPlaying, zoomValue]);

  // useEffect(() => {
  //   if (audioRef.current) {
  //     audioRef.current.playbackRate = playbackRate || 1;
  //   }
  // }, [playbackRate]);

  function drawWaveforms(canvas) {
    const context = canvas.getContext("2d");
    const height = canvas.height;
    const container = containerRef.current;
    context.clearRect(0, 0, scrollRef.current.clientWidth, height); // 清空畫布
    context.fillStyle = "#dbf0e4"; // 設置波形顏色
    const targetBarCount = 1000;
    const startIndex = Math.floor(
      (scrollRef.current?.scrollLeft / container.offsetWidth) * fullPeaks.length
    ); // 計算起始索引
    const endIndex = Math.floor(
      ((scrollRef.current?.scrollLeft + scrollRef.current.offsetWidth) /
        container.offsetWidth) *
        fullPeaks.length
    ); // 計算起始索引

    const result = [];

    const visiblePeaks = fullPeaks.slice(startIndex, endIndex);
    console.log(
      "startIndex",
      startIndex,
      "endIndex",
      endIndex,
      "length",
      endIndex - startIndex
    );
    const factor = (endIndex - startIndex) / targetBarCount; // 計算縮放因子

    for (let i = 0; i < targetBarCount; i++) {
      const start = Math.floor(i * factor); // 計算起始索引
      const end = Math.floor((i + 1) * factor);
      const chunk = visiblePeaks.slice(start, end > start ? end : start + 1);
      const avg = chunk.length
        ? chunk.reduce((sum, v) => sum + v, 0) / chunk.length
        : 0;

      // result.push(min);
      result.push(avg); // 使用平均值
    }
    // console.log("result", result);

    const maxPeak = Math.max(...result); // 找到峰值的最大值
    const barWidth = scrollRef.current.offsetWidth / targetBarCount; // 每個柱條的寬度

    for (let i = 0; i < result.length; i++) {
      const peak = result[i];
      const normalizedPeak = peak / maxPeak; // 正規化峰值
      const barHeight = (normalizedPeak * height) / 2; // 計算柱條高度

      // 繪製上半部分波形
      context.fillRect(
        i * barWidth,
        height / 2 - barHeight,
        barWidth,
        barHeight
      );

      // 繪製下半部分波形（鏡像）
      context.fillRect(i * barWidth, height / 2, barWidth, barHeight);
    }
  }

  // 處理波形點擊，更新播放時間
  // const handleWaveformClick = (event) => {
  //   const container = containerRef.current;
  //   const rect = container.getBoundingClientRect();
  //   const hoverX = event.clientX - rect.left;
  //   const progress = hoverX / container.offsetWidth;
  //   const newTime = Math.floor((progress * duration) / 50) * 50; // 根據進度計算新時間
  //   dispatch(updateCurrentTime(newTime)); // 更新 Redux
  //   audioRef.current.currentTime = newTime / 1000; // 更新 audio 元素的播放時間
  // };

  const handleWaveformClick = (e) => {
    if (!audioBuffer) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = x / rect.width;
    const seekMs = Math.floor((progress * duration) / 50) * 50;

    if (sourceNode) sourceNode.stop();
    dispatch(updateCurrentTime(seekMs));
  };

  // 處理滑鼠移動，顯示懸停時間
  const handleMouseMove = (event) => {
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const hoverX = event.clientX - rect.left;
    const progress = hoverX / container.offsetWidth;
    const hoverTimeInMs = progress * duration; // 懸停時間
    setHoverTime(hoverTimeInMs); // 設置懸停時間
    setHoverPosition(hoverX); // 設置懸停位置
  };

  // 處理滑鼠離開
  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoverPosition(null);
  };

  // 格式化時間
  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const milliseconds = Math.floor((timeInSeconds % 1) * 1000);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}:${
      milliseconds < 100 ? "0" : ""
    }${milliseconds < 10 ? "0" : ""}${milliseconds}`;
  };

  return (
    <div>
      {/* <audio
        ref={audioRef}
        src={url}
        onEnded={() => {
          setIsPlaying(false);
          dispatch(updateCurrentTime(0));
        }}
        controls
        style={{ display: "none" }}
      /> */}
      <canvas
        ref={canvasRef}
        width={scrollRef.current?.clientWidth}
        style={{
          position: "absolute", // 或 "absolute" / "sticky" 根據你的佈局
          left: scrollRef.current?.scrollLeft || 0,
        }}
        height={canvasHeight}
        onClick={handleWaveformClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <div
        style={{
          position: "absolute",
          left: `${(currentTime / duration) * canvasWidth}px`, // 動態計算紅線位置
          top: 0,
          height: `${scrollRef.current?.offsetHeight || 0}px`, // 匹配滾動區域高度
          width: "2px", // 紅線寬度
          backgroundColor: "red",
          pointerEvents: "none", // 避免阻擋滑鼠事件
          zIndex: 10, // 確保紅線在前
        }}
      ></div>
      {hoverPosition !== null && (
        <div
          className="hover-line"
          style={{
            position: "absolute",
            left: `${hoverPosition}px`,
            top: 0,
            height: `${scrollRef.current?.offsetHeight || 0}px`,
            width: "1px",
            backgroundColor: "red",
            pointerEvents: "none",
            zIndex: 20,
          }}
        ></div>
      )}
      {hoverTime !== null && (
        <div>
          <div
            style={{
              position: "absolute",
              left: `${hoverPosition}px`,
              bottom: "40px",
              background: "rgba(255, 255, 255, 0.7)",
              padding: "2px 5px",
              borderRadius: "3px",
              pointerEvents: "none", // 不干擾滑鼠事件
            }}
          >
            {formatTime(hoverTime / 1000)}
          </div>
        </div>
      )}
    </div>
  );
};

function Wave({
  isPlaying,
  setIsPlaying,
  // audioRef,
  zoomValue,
  scrollRef,
  currentTime,
  setCurrentTime,
  containerRef,
  sourceNode,
  setSourceNode,

  volume,
}) {
  // useEffect(() => {
  //   audioRef.current.volume = volume;
  // }, [volume, audioRef]);

  return (
    <div>
      <AudioWaveform
        url={music}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        // audioRef={audioRef}
        sourceNode={sourceNode}
        setSourceNode={setSourceNode}
        scrollRef={scrollRef}
        containerRef={containerRef}
        zoomValue={zoomValue}
        volume={volume}
        currentTime={currentTime}
        setCurrentTime={setCurrentTime}
      />
    </div>
  );
}

export default Wave;
