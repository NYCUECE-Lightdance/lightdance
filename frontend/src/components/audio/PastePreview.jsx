import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import "./PastePreview.css";
import { TICK_MS } from "../../constants/time.js";
import {
  clipboardSpanMs,
  hasContent,
  landingSpans,
  segmentCount,
} from "../../utils/segments/clipboard.js";

/**
 * 貼上的滑鼠預覽 —— 複製模式下，游標指到哪就把落點畫在哪，點下去就貼。
 *
 * ## 為什麼需要
 *
 * 舊的貼上流程是「先點一個目標色塊選起來，再按 Ctrl+V」。兩個問題：
 *
 * - **目標必須是既有的色塊。** 想貼到一段空白的地方就沒有東西可以點，只能先
 *   隨便放一個色塊、貼完再刪掉
 * - **貼之前看不到會貼到哪。** 跨軌之後更明顯：剪貼簿可能有七條軌的內容，
 *   而落點是由錨點的座標差推出來的——按下去之前完全沒有畫面可以確認
 *
 * 現在游標移到哪，那幾個框就跟到哪，按下去就貼在框的位置。Ctrl+V 那條路
 * 原樣保留（鍵盤流程不必改），兩者走的是**同一個 `planPaste`**。
 *
 * ## 全程直接寫 DOM
 *
 * 和框選同一個理由（見 `MarqueeSelect.jsx`）：這個容器是 154 條 Timeline 的
 * 祖先，滑鼠每動一格就 setState 會讓它們全部重算。所以框的**數量**由剪貼簿
 * 決定（只有 Ctrl+C 時才變），移動時只改 `style`。
 */

/** 落點在容器內容座標系裡的上下緣（含捲動位移，捲到哪都成立） */
const rowBounds = (element, container) => {
  const rect = element.getBoundingClientRect();
  const base = container.getBoundingClientRect();
  return {
    top: rect.top - base.top + container.scrollTop,
    height: rect.height,
  };
};

/** 游標下方那一列的 DOM（`data-row-index` 是 Timeline 自己掛的） */
const rowUnder = (clientX, clientY) =>
  document.elementFromPoint(clientX, clientY)?.closest?.(
    ".timeline[data-row-index]",
  ) ?? null;

/**
 * 複製模式的滑鼠預覽與貼上。
 *
 * @param containerRef `.timeline-container`
 * @param ghostsRef 預覽框的 DOM 陣列（由 `PasteGhosts` 填）
 * @param tracks 目前可見的軌道清單
 * @param isCopying 是不是在複製模式
 * @param onPasteAt `({armorIndex, partIndex, timeOffset}) => void`
 */
export function usePastePreview({
  containerRef,
  ghostsRef,
  tracks,
  isCopying,
  phaseMs = 0,
  onPasteAt,
}) {
  const clipboard = useSelector((state) => state.profiles.clipboard);
  const duration = useSelector((state) => state.profiles.duration);

  // 最後一次算出來的落點。點下去時用它，不要在 click 時重算——
  // mousedown 與 mousemove 的座標可能差一兩個像素，畫面上框在 A 卻貼到 B
  const targetRef = useRef(null);

  const stateRef = useRef({});
  stateRef.current = { clipboard, duration, tracks, phaseMs, onPasteAt };

  // 最後一次的游標位置。改跑馬燈間隔時要在**原地**重畫成階梯狀，
  // 而那時沒有 mousemove 事件可以用
  const lastPointRef = useRef(null);
  const redrawRef = useRef(() => {});

  useEffect(() => {
    const container = containerRef?.current;
    if (!isCopying || !container) return;

    const hideAll = () => {
      for (const ghost of ghostsRef.current) {
        if (ghost) ghost.style.display = "none";
      }
      targetRef.current = null;
    };

    /** 游標位置 → 落點（哪一條軌、時間平移多少）。收的是點不是事件 */
    const targetAt = (point) => {
      const {
        clipboard: clip,
        duration: total,
        tracks: rows,
        phaseMs: phase,
      } = stateRef.current;
      if (!hasContent(clip) || !Array.isArray(rows) || !(total > 0)) return null;

      const row = rowUnder(point.clientX, point.clientY);
      const rowIndex = Number(row?.dataset.rowIndex);
      const track = Number.isInteger(rowIndex) ? rows[rowIndex] : null;
      if (!track) return null;

      const rect = container.getBoundingClientRect();
      if (!rect.width) return null;

      /*
       * 游標的時間就是**剪貼簿內容的起點**落在哪。
       *
       * 再夾一次尾端：整份內容要塞得進表演長度裡，否則超出去的那幾段會被
       * `planPaste` 丟掉，而畫面上只看得到「怎麼少貼了幾塊」。
       */
      const cursorMs = ((point.clientX - rect.left) / rect.width) * total;
      // 相位會把最後一條往後推，整份內容因此變長——夾緊要算進去
      const span = clipboardSpanMs(clip, phase);
      const startMs = Math.max(0, Math.min(total - span, cursorMs));

      return {
        armorIndex: track.armorIndex,
        partIndex: track.partIndex,
        timeOffset:
          Math.round((startMs - clip.startTime) / TICK_MS) * TICK_MS,
        phaseMs: phase,
      };
    };

    const redraw = (point) => {
      if (!point) return;
      const { clipboard: clip, duration: total, tracks: rows } = stateRef.current;
      const target = targetAt(point);
      targetRef.current = target;

      if (!target) return hideAll();

      const rect = container.getBoundingClientRect();
      const spans = landingSpans(clip, target);
      const ghosts = ghostsRef.current;

      spans.forEach((span, i) => {
        const ghost = ghosts[i];
        if (!ghost) return;

        // 落在光表範圍外的那幾條不畫——它們也不會被貼上（見 clipboard.js）
        const rowIndex = rows.findIndex(
          (track) =>
            track.armorIndex === span.armorIndex &&
            track.partIndex === span.partIndex,
        );
        const element =
          rowIndex >= 0
            ? container.querySelector(`.timeline[data-row-index="${rowIndex}"]`)
            : null;
        if (!element) {
          ghost.style.display = "none";
          return;
        }

        const { top, height } = rowBounds(element, container);
        ghost.style.display = "block";
        ghost.style.left = `${(span.start / total) * rect.width}px`;
        ghost.style.width = `${((span.end - span.start) / total) * rect.width}px`;
        ghost.style.top = `${top}px`;
        ghost.style.height = `${height}px`;
      });

      // 剪貼簿有幾段就有幾個框，這一輪沒用到的收起來
      for (let i = spans.length; i < ghosts.length; i++) {
        if (ghosts[i]) ghosts[i].style.display = "none";
      }
    };

    redrawRef.current = redraw;

    const handleMove = (event) => {
      lastPointRef.current = { clientX: event.clientX, clientY: event.clientY };
      redraw(lastPointRef.current);
    };

    /*
     * 用 capture 階段：Timeline 的 block mousedown 會 `stopPropagation`
     * （它要決定是不是進入選取／拖曳），冒泡階段收不到落在色塊上的那些點擊
     * ——而色塊正好是最常見的貼上目標。
     */
    const handleDown = (event) => {
      if (event.button !== 0) return;
      const target = targetRef.current;
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      stateRef.current.onPasteAt?.(target);
    };

    container.addEventListener("mousemove", handleMove);
    container.addEventListener("mousedown", handleDown, true);
    return () => {
      container.removeEventListener("mousemove", handleMove);
      container.removeEventListener("mousedown", handleDown, true);
      lastPointRef.current = null;
      hideAll();
    };
  }, [containerRef, ghostsRef, isCopying]);

  /*
   * 改跑馬燈間隔時在**原地**重畫。
   *
   * ⚠️ 不要把 `phaseMs` 放進上面那個 effect 的 deps：那會讓 listener 重掛，
   * 而 cleanup 的 `hideAll()` 會把框全部收起來——改完間隔之後畫面上什麼都沒有，
   * 要再動一次滑鼠才回來，看起來像壞掉。
   */
  useEffect(() => {
    if (isCopying) redrawRef.current(lastPointRef.current);
  }, [isCopying, phaseMs]);
}

/**
 * 預覽框本身。數量由剪貼簿決定，位置由 `usePastePreview` 直接寫 style。
 *
 * 不在複製模式時整個不 render——常駐的話 154 條 Timeline 上面會多蓋一層
 * 什麼都不做的節點。
 */
export function PasteGhosts({ ghostsRef, isCopying }) {
  const clipboard = useSelector((state) => state.profiles.clipboard);
  const count = isCopying ? segmentCount(clipboard) : 0;

  ghostsRef.current.length = count;

  if (count === 0) return null;

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="paste-ghost"
          data-testid="paste-ghost"
          ref={(el) => {
            ghostsRef.current[i] = el;
          }}
        />
      ))}
    </>
  );
}
