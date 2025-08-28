import React from "react";
import { useRef, useMemo } from "react";
import { useWavesurfer } from "@wavesurfer/react";
import Timeline from "wavesurfer.js/dist/plugins/timeline.esm.js";
import music from "./musicsrc/lightdance V2.mp3";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function WaveSurferPlayer({}) {
  const containerRef = useRef(null);

  // 用 useMemo 記錄要啟用的 Wavesurfer 插件
  const plugins = useMemo(() => [Timeline.create()], []);

  // 建立 Wavesurfer + React 互動
  const { wavesurfer, isPlaying, currentTime } = useWavesurfer({
    container: containerRef,
    waveColor: "rgb(200, 0, 200)",
    progressColor: "rgb(100, 0, 100)",
    height: 400,
    width: 100000,
    url: music,
    plugins,
  });

  // 播放 / 暫停
  const handlePlayPause = () => {
    if (wavesurfer) wavesurfer.playPause();
  };

  return (
    <div>
      <div ref={containerRef} /* 波形放這裡 */ />
      <p>Current time: {formatTime(currentTime)}</p>
      <button onClick={handlePlayPause}>{isPlaying ? "Pause" : "Play"}</button>
    </div>
  );
}
