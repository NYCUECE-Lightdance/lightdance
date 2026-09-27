import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsLeftRight,
  faCheck,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { updateCurrentTime } from "../../redux/actions.js";
import { useSegmentActionTable } from "../../hooks/useSegmentActionTable.js";
import { TICK_MS } from "../../constants/time.js";
import { clearRange } from "../../utils/segments/core.js";

/**
 * 區間平移工具：把一段時間內所有舞者、所有部位的光點整批搬到別的時間。
 *
 * 操作是三步驟的（用播放位置當游標）：
 *   1. 設定起始點 → 2. 設定結束點 → 3. 設定目標位置，然後執行
 *
 * 狀態放在 `useTimeShift()`，因為按鈕在工具列、起訖標記在時間軸上，
 * 兩處要看同一份 step/times；外殼呼叫一次 hook，再把回傳值分別餵給
 * `<ShiftToolButton>` 和 `<ShiftMarkers>`。
 *
 * ## Phase 5e：改成 segment 原生
 *
 * 舊版在壓平的 keyframe 上搬「點」，所以會把一個色塊拆開——只搬到起始點而
 * 留下結束用的黑點是可能的。搬完還要 `ensureBlackBefore` 補黑點、
 * 再跑 `removeDuplicateBlackBlocks` 收拾殘留。
 *
 * segment 模型搬的是**整個色塊**，不會拆開；落點區間的清理交給 `clearRange`
 * （被切一半的情況它也處理好了），黑點的兩道手續一起消失。
 */

const alignToTick = (ms) => Math.floor(ms / TICK_MS) * TICK_MS;

export function useTimeShift() {
  const dispatch = useDispatch();
  const { segmentTable, commit } = useSegmentActionTable();
  const currentTime = useSelector((state) => state.profiles.currentTime);

  // 0: 關閉, 1: 選起始, 2: 選結束, 3: 選目標
  const [step, setStep] = useState(0);
  const [times, setTimes] = useState({ start: 0, end: 0, target: 0 });

  const reset = () => {
    setStep(0);
    setTimes({ start: 0, end: 0, target: 0 });
  };

  /**
   * 核心資料搬移邏輯：把 `[start, end]` 內的色塊整批搬到 `target`。
   *
   * 「在區間內」的判準是**色塊的起點落在區間裡**——這是舊版「關鍵格的時間
   * 落在區間裡」最直接的對應（一個色塊的起始關鍵格就在 `segment.start`）。
   * 差別是現在整段一起搬，不會出現「搬走開頭、留下結尾」的破碎狀態。
   */
  const executeTimeShift = (start, end, target) => {
    const safeStart = alignToTick(start);
    const safeEnd = alignToTick(end);
    const safeTarget = alignToTick(target);

    if (safeEnd <= safeStart) {
      alert("結束時間必須大於起始時間！");
      return;
    }

    const inRange = (segment) =>
      segment.start >= safeStart && segment.start <= safeEnd;

    // 先看整張表裡有沒有東西可搬，並找出最早的起點
    let globalFirstStart = Infinity;
    for (const armor of segmentTable ?? []) {
      for (const segments of armor ?? []) {
        for (const segment of segments ?? []) {
          if (inRange(segment)) {
            globalFirstStart = Math.min(globalFirstStart, segment.start);
          }
        }
      }
    }

    if (globalFirstStart === Infinity) {
      alert("選取區間內沒有任何色塊可以平移！");
      return;
    }

    // 以整批色塊的最早起點對齊到目標位置
    const offset = safeTarget - globalFirstStart;

    const nextTable = (segmentTable ?? []).map((armor) =>
      (armor ?? []).map((segments) => {
        if (!Array.isArray(segments)) return segments;

        const moving = segments.filter(inRange);
        if (moving.length === 0) return segments; // reference 不變，這個部位不重繪

        const moved = moving.map((segment) => ({
          ...segment,
          start: segment.start + offset,
          end: segment.end + offset,
        }));

        const newStart = Math.min(...moved.map((s) => s.start));
        const newEnd = Math.max(...moved.map((s) => s.end));

        // 留下來的段裡，落點區間內的部分要讓位（clearRange 會裁切或切成兩半）
        const staying = segments.filter((segment) => !inRange(segment));
        return [...clearRange(staying, newStart, newEnd), ...moved].sort(
          (a, b) => a.start - b.start,
        );
      }),
    );

    commit(nextTable);
    dispatch(updateCurrentTime(safeTarget));
  };

  /** 按下「確定」：依目前步驟記下播放位置，或在最後一步執行平移 */
  const advance = () => {
    const currentT = alignToTick(currentTime);

    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      setTimes((prev) => ({ ...prev, start: currentT }));
      setStep(2);
    } else if (step === 2) {
      if (currentT <= times.start) {
        alert("結束時間必須大於起始時間！");
        return;
      }
      setTimes((prev) => ({ ...prev, end: currentT }));
      setStep(3);
    } else if (step === 3) {
      executeTimeShift(times.start, times.end, currentT);
      reset();
    }
  };

  return { step, times, setStep, advance, reset };
}

/** 工具列上的按鈕與三步驟導引面板 */
export function ShiftToolButton({ shift }) {
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const { step, times, setStep, advance, reset } = shift;

  return (
    <div className="shift-tool-wrapper">
      {step === 0 ? (
        <button className="shift-main-button" onClick={() => setStep(1)}>
          <FontAwesomeIcon icon={faArrowsLeftRight} size="lg" />
          <span className="tooltip">
            Shift all light dance data within the interval
          </span>
        </button>
      ) : (
        <div className="shift-guide-panel">
          <span className="shift-message">
            {step === 1 &&
              `[1/3] 設定「起始點」: ${alignToTick(currentTime)}ms`}
            {step === 2 && `[2/3] 起始: ${times.start}ms -> 設定「結束點」`}
            {step === 3 &&
              `[3/3] 區塊: ${times.start}~${times.end}ms -> 設定「目標位置」`}
          </span>
          <button className="shift-confirm-btn" onClick={advance}>
            <FontAwesomeIcon icon={faCheck} /> 確定
          </button>
          <button className="shift-cancel-btn" onClick={reset}>
            <FontAwesomeIcon icon={faTimes} /> 取消
          </button>
        </div>
      )}
    </div>
  );
}

/** 時間軸上的起訖標記 */
export function ShiftMarkers({ shift }) {
  const duration = useSelector((state) => state.profiles.duration);
  const { step, times } = shift;

  return (
    <>
      {step >= 2 && (
        <div
          className="shift-marker start-marker"
          style={{ left: `${(times.start / duration) * 100}%` }}
        >
          <span className="marker-label">Start</span>
        </div>
      )}
      {step >= 3 && (
        <div
          className="shift-marker end-marker"
          style={{ left: `${(times.end / duration) * 100}%` }}
        >
          <span className="marker-label">End</span>
        </div>
      )}
    </>
  );
}
