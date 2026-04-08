// TrackToolbar — 時間軸工具列：左右跳格、剪刀、刪除、亮度、調色板、播放速度。
// 全部 props-driven，內部不持有 state，也不直接 dispatch。
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faScissors,
  faTrash,
  faCircleHalfStroke,
  faPalette,
} from "@fortawesome/free-solid-svg-icons";

export default function TrackToolbar({
  onGoLeft,
  onGoRight,
  onCut,
  onDelete,
  brightness,
  onBrightnessChange,
  onColorChange,
  playbackRate,
  onSpeedChange,
}) {
  return (
    <>
      <div className="timeline-controls">
        <button className="timeline-left" onClick={onGoLeft}>
          <FontAwesomeIcon icon={faArrowLeft} size="lg" />
          <span className="tooltip">Previous Time Point (Shift + ←)</span>
        </button>
        <button className="timeline-right" onClick={onGoRight}>
          <FontAwesomeIcon icon={faArrowRight} size="lg" />
          <span className="tooltip">Next Time Point (Shift + →)</span>
        </button>
      </div>
      <button className="cut-button" onClick={onCut}>
        <FontAwesomeIcon icon={faScissors} size="lg" />
        <span className="tooltip">Cut Selected Block ( C )</span>
      </button>
      <button className="delete-button" onClick={onDelete}>
        <FontAwesomeIcon icon={faTrash} size="lg" />
        <span className="tooltip">Delete Selected Block ( Del )</span>
      </button>
      <div className="brightness-control">
        <FontAwesomeIcon icon={faCircleHalfStroke} />
        <select
          id="brightness-select"
          className="dropdown-select"
          value={brightness}
          onChange={(e) => onBrightnessChange(e.target.value)}
          style={{ marginLeft: "10px" }}
        >
          {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((v) => (
            <option key={v} value={v}>
              {Math.round(v * 100)}%
            </option>
          ))}
        </select>
        <span className="tooltip">Brightness</span>
      </div>
      <button className="color-button" onClick={onColorChange}>
        <FontAwesomeIcon icon={faPalette} size="lg" />
        <span className="tooltip">Color( M )</span>
      </button>
      <div className="dropdown">
        <select
          id="speed-select"
          className="dropdown-select"
          value={playbackRate || 1}
          onChange={(e) => onSpeedChange(e.target.value)}
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
    </>
  );
}
