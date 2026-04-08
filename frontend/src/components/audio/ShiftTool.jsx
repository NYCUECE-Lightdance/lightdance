// ShiftTool — 三步驟時間平移工具的 UI（按鈕 + 引導面板）。
// 狀態（shiftStep / shiftTimes）由 parent 持有，因為波形 overlay 上的
// start/end marker 也要讀同一份狀態。
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsLeftRight, faCheck, faTimes } from "@fortawesome/free-solid-svg-icons";

export default function ShiftTool({
  shiftStep,
  shiftTimes,
  currentTime,
  onStart,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="shift-tool-wrapper">
      {shiftStep === 0 ? (
        <button className="shift-main-button" onClick={onStart}>
          <FontAwesomeIcon icon={faArrowsLeftRight} size="lg" />
          <span className="tooltip">Shift all light dance data within the interval</span>
        </button>
      ) : (
        <div className="shift-guide-panel">
          <span className="shift-message">
            {shiftStep === 1 && `[1/3] 設定「起始點」: ${Math.floor(currentTime / 50) * 50}ms`}
            {shiftStep === 2 && `[2/3] 起始: ${shiftTimes.start}ms -> 設定「結束點」`}
            {shiftStep === 3 &&
              `[3/3] 區塊: ${shiftTimes.start}~${shiftTimes.end}ms -> 設定「目標位置」`}
          </span>
          <button className="shift-confirm-btn" onClick={onConfirm}>
            <FontAwesomeIcon icon={faCheck} /> 確定
          </button>
          <button className="shift-cancel-btn" onClick={onCancel}>
            <FontAwesomeIcon icon={faTimes} /> 取消
          </button>
        </div>
      )}
    </div>
  );
}
