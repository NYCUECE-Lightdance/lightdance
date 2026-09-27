import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { useAudioClips } from "../../hooks/useAudioClips.js";
import { beatLines } from "../../utils/audio/tempo.js";
import "./BeatGrid.css";

/**
 * 節拍格線。
 *
 * 和 `TimeRuler` / `ClipMarkers` / `ShiftMarkers` 同一層、同一個座標系
 * （`time / duration × 100%`），所以縮放與橫向捲動自動同步，不必自己算捲動。
 *
 * ## 這是輔助線，不是網格
 *
 * 韌體吃的是 50ms 的格子，而 128 BPM 一拍 468.75ms 不是 50 的倍數——**格線畫的
 * 是音樂真正的位置，不四捨五入到 50ms**。使用者是照著線在對拍的，把線挪到最近
 * 的格子上等於讓畫面說謊（最多差 25ms）。色塊落在哪一格是拖曳與輸出那一端的事。
 *
 * ## 密度
 *
 * 由「相鄰兩條至少隔多少像素」推導（`pickLevel`），不是寫死「放大幾倍才畫幾分之
 * 一拍」——後者換一個視窗寬度就不成立。放到最大畫到四分之一拍，縮小逐層退回半拍、
 * 整拍、小節，連小節線都擠在一起時整片不畫（畫出來會是一塊實心）。
 */
function BeatGrid() {
  const { clips } = useAudioClips();
  const duration = useSelector((state) => state.profiles.duration);
  const hostRef = useRef(null);
  const [width, setWidth] = useState(0);

  // 寬度會因為縮放（`.main-controlPanel` 跟著 zoomLevel）與視窗大小改變，
  // ResizeObserver 兩者都涵蓋。做法與 TimeRuler 相同
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const lines = useMemo(() => {
    if (!(duration > 0) || !(width > 0)) return [];
    return beatLines(clips, { from: 0, to: duration, pxPerMs: width / duration });
  }, [clips, duration, width]);

  return (
    <div className="beat-grid" ref={hostRef} aria-hidden="true">
      {lines.map(({ time, level, clipId }) => (
        <span
          // 接縫重疊時兩首歌可能在同一毫秒各有一條線，所以 key 要帶上是誰畫的
          key={`${clipId}-${level}-${time}`}
          className={`beat-line is-${level}`}
          style={{ left: `${(time / duration) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default BeatGrid;
