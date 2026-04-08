// PlayerControls — 播放/暫停按鈕、時間顯示、縮放、音量。
// state（isPlaying / zoomLevel / volume）由 parent 持有，因為 Waveform 也吃同一份。
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faPause, faVolumeHigh } from "@fortawesome/free-solid-svg-icons";

const formatTime = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}:${
    milliseconds < 100 ? "0" : ""
  }${milliseconds < 10 ? "0" : ""}${milliseconds}`;
};

export default function PlayerControls({
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  zoomLevel,
  maxZoom,
  onZoomChange,
  onZoomMinus,
  onZoomPlus,
  volume,
  onVolumeChange,
}) {
  return (
    <>
      <div className="play-control">
        <button className="play-button" onClick={onPlayPause}>
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
      </div>
      <div className="zoom-controls">
        <button onClick={onZoomMinus} disabled={zoomLevel < 1}>
          -
        </button>
        <input
          type="range"
          min="1"
          max={maxZoom}
          step="0.01"
          value={zoomLevel}
          onChange={onZoomChange}
          className="zoom-slider"
        />
        <button onClick={onZoomPlus} disabled={zoomLevel > maxZoom}>
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
          onChange={onVolumeChange}
          style={{ width: "100px" }}
        />
      </div>
    </>
  );
}
