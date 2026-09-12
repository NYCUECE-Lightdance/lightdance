import { useDispatch, useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faPause,
  faVolumeHigh,
} from "@fortawesome/free-solid-svg-icons";

import { updatePlaybackRate } from "../../redux/actions.js";
import {
  MAX_ZOOM,
  formatZoom,
  sliderToZoom,
  zoomIn,
  zoomOut,
  zoomToSlider,
} from "../../utils/zoom.js";

// 縮放的形狀與換算全部在 utils/zoom.js。這裡只接事件
export { MAX_ZOOM };

const formatTime = (timeInMilliseconds) => {
  const minutes = Math.floor(timeInMilliseconds / 60000);
  const seconds = Math.floor((timeInMilliseconds % 60000) / 1000);
  const milliseconds = Math.floor(timeInMilliseconds % 1000);

  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}:${
    milliseconds < 100 ? "0" : ""
  }${milliseconds < 10 ? "0" : ""}${milliseconds}`;
};

/**
 * 播放控制列：速度、播放/暫停、時間顯示、縮放、音量。
 *
 * 播放速度自己走 Redux；`isPlaying` / `zoomLevel` / `volume` 是外殼持有的狀態
 * （waveform 與 scroll-container 也要用），所以做成受控元件由外層傳入。
 */
function PlayerControls({
  isPlaying,
  setIsPlaying,
  zoomLevel,
  setZoomLevel,
  volume,
  setVolume,
}) {
  const dispatch = useDispatch();
  const playbackRate = useSelector((state) => state.profiles.playbackRate);
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration);

  const handleSpeedChange = (speed) => {
    dispatch(updatePlaybackRate(parseFloat(speed)));
  };

  /*
   * 滑桿走的是**位置**（0..1）而不是倍率，位置與 log(倍率) 成正比。
   *
   * 舊版是線性的 1..100 再加一個 `Math.floor`：一個像素約等於一倍，而低倍率
   * 那一端只走得到 1、2、3——「1 倍變 2 倍」是整整放大一倍，拖曳時停不到
   * 想要的地方。換算在 `utils/zoom.js`。
   */
  const handleZoom = (event) => {
    setZoomLevel(sliderToZoom(Number(event.target.value)));
  };

  const handleMinusZoom = () => setZoomLevel(zoomOut);
  const handlePlusZoom = () => setZoomLevel(zoomIn);

  const handleVolumeChange = (event) => {
    // 調音量會重建 audio graph，所以先停止播放
    if (isPlaying) setIsPlaying(false);
    setVolume(event.target.value);
  };

  return (
    <>
      {/* 播放速度 */}
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
        <span className="tooltip">播放速度</span>
      </div>

      <div className="play-control">
        <button
          className="play-button"
          onClick={() => setIsPlaying((playing) => !playing)}
        >
          {isPlaying ? (
            <>
              <FontAwesomeIcon icon={faPause} size="lg" />
              <span className="tooltip">暫停<kbd>Space</kbd></span>
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faPlay} size="lg" />
              <span className="tooltip">播放<kbd>Space</kbd></span>
            </>
          )}
        </button>
        <span className="current-time-box">{formatTime(currentTime)}</span>
        <span className="time-separator">/</span>
        <span className="duration-box">{formatTime(duration)}</span>
      </div>

      <div className="zoom-controls">
        {/*
          讀數放在這一組的**最前面**。放在 `+` 後面的話它會緊貼著音量圖示，
          讀起來像是音量的數值——兩組之間只隔一個 gap，而組內也是一個 gap。
        */}
        <span className="zoom-value">{formatZoom(zoomLevel)}</span>
        <button
          onClick={handleMinusZoom}
          disabled={zoomLevel <= 1}
          title="縮小時間軸"
        >
          -
        </button>
        <input
          type="range"
          // 0..1 是**滑桿的位置**，不是倍率。位置與 log(倍率) 成正比，
          // 所以拖曳時「每移動一段距離就放大同樣的比例」在整個範圍都成立
          min="0"
          max="1"
          step="0.001"
          value={zoomToSlider(zoomLevel)}
          onChange={handleZoom}
          className="zoom-slider"
          aria-label="時間軸縮放"
        />
        <button
          onClick={handlePlusZoom}
          disabled={zoomLevel >= MAX_ZOOM}
          title="放大時間軸"
        >
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
    </>
  );
}

export default PlayerControls;
