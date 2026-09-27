import { useEffect, useRef } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import "./MarqueeSelect.css";
import { updateMultiSelectedBlocks } from "../../redux/actions.js";
import { makeSelection } from "../../utils/selection.js";
import { isMarquee, segmentsInMarquee } from "../../utils/segments/marquee.js";

/**
 * 框選 —— 拉一個矩形選取跨軌的多個色塊。
 *
 * 幾何判斷在 `utils/segments/marquee.js`（純函式，邊界條件在那裡窮舉過），
 * 這裡只負責事件、像素換算與直接寫 DOM。
 *
 * ## 從哪裡開始拉
 *
 * 時間軸上**沒有真正的空白**：`buildTimelineBlocks` 讓色塊首尾相接涵蓋整條
 * `[0, duration)`，空隙也是一個 block（只是不帶 `segmentId`）。所以「在空白處
 * 按下去」實際上是按在一個空隙 block 上。
 *
 * 兩個起點：
 *
 * - **從空隙拉** —— 主要路徑。單純點一下空隙仍然是「取消選取」（沒超過
 *   `MARQUEE_MIN_PX` 就不算框選），所以兩種操作不衝突。
 * - **按住 Alt 從任何地方拉** —— 逃生口。整條軌都被色塊蓋滿時沒有空隙可按。
 *   Alt 是唯一沒被用掉的修飾鍵（Shift 是加選、Ctrl 是亮度與各種快捷鍵）。
 *
 * ## 為什麼全程直接寫 DOM
 *
 * 這個容器是 154 條 Timeline 的祖先，只要它 re-render 一次，底下全部跟著重算。
 * 拖曳中每一格像素都 setState 的話會直接毀掉零 re-render 的手勢路徑
 * （見 `docs/frontend-rendering-optimization.md`）。所以矩形是一個常駐的
 * `<div>`，手勢期間只改它的 `style`，**放開才 dispatch 一次**。
 */

/** 這一軌在容器內容座標系裡的上下緣（含捲動位移，所以捲到哪都成立） */
const rowBounds = (element, container) => {
  const rect = element.getBoundingClientRect();
  const base = container.getBoundingClientRect();
  return {
    top: rect.top - base.top + container.scrollTop,
    bottom: rect.bottom - base.top + container.scrollTop,
  };
};

/**
 * 框選完之後那一下 `click` 要吃掉，不然選取會立刻被清空。
 *
 * 每個 Timeline 都在 document 上掛了一個「點到 `.timeline-block` 以外的地方
 * 就取消選取」的 handler。而拖曳結束時瀏覽器會補一個 `click`，它的 target 是
 * mousedown 與 mouseup **共同的祖先**——框選跨軌時那就是 `.timeline-container`，
 * 不是 block，於是剛框好的選取在同一個 tick 被清掉（實測就是這樣：選取進去了，
 * 下一行 log 就變回空陣列）。
 *
 * 用時間戳而不是「掛一個一次性 listener」：mouseup 落在視窗外時根本不會有
 * `click`，一次性 listener 會留在那裡，把使用者**下一次**真正的點擊吃掉。
 */
const CLICK_SUPPRESS_MS = 400;

export function useMarqueeSelect({ containerRef, boxRef, tracks }) {
  const dispatch = useDispatch();
  // 從 Provider 拿 store：手勢開始時要現讀一次光表，不要用 render 時捕捉到的版本
  const store = useStore();
  const moveMode = useSelector((state) => state.profiles.moveMode);

  // tracks 會隨工作集切換整份換掉，用 ref 讓 listener 永遠讀得到最新的一份
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const suppressClickUntilRef = useRef(0);
  useEffect(() => {
    const swallow = (event) => {
      if (performance.now() > suppressClickUntilRef.current) return;
      suppressClickUntilRef.current = 0;
      event.stopPropagation();
    };
    // window 的 capture 階段是整條路徑的最前面，這樣 document 上那些
    // bubble 階段的 handler 一個都收不到
    window.addEventListener("click", swallow, true);
    return () => window.removeEventListener("click", swallow, true);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const box = boxRef.current;
    if (!container || !box) return;

    // Move Mode 有自己的「點一下開始追蹤、再點一下放下」流程，不要跟它搶事件
    if (moveMode) return;

    const handleMouseDown = (event) => {
      if (event.button !== 0) return;

      const block = event.target.closest?.(".timeline-block");
      const fromGap = block?.dataset?.gap === "true";
      if (!fromGap && !event.altKey) return;

      const base = container.getBoundingClientRect();
      const toContent = (clientX, clientY) => ({
        x: clientX - base.left + container.scrollLeft,
        y: clientY - base.top + container.scrollTop,
      });

      const origin = toContent(event.clientX, event.clientY);
      let current = origin;

      /*
       * 量測與加選的基準都在**按下的那一刻**取好。
       *
       * 選取尤其重要：Timeline 自己的 handler 會在同一次 mousedown 把選取清空
       * （點空隙 = 取消選取），等到 mouseup 再去讀就只剩空的了，Shift 加選會
       * 變成「每次都從頭選」。
       */
      const state = store.getState().profiles;
      const table = state.data?.actionTable ?? [];
      const duration = state.duration;
      const additive = event.shiftKey;
      const baseSelection = additive ? state.multiSelectedBlocks ?? [] : [];

      const rows = [...container.querySelectorAll(".timeline")]
        .map((element, index) => {
          const track = tracksRef.current?.[index];
          if (!track) return null;
          const { armorIndex, partIndex } = track;
          return {
            armorIndex,
            partIndex,
            segments: table?.[armorIndex]?.[partIndex] ?? [],
            ...rowBounds(element, container),
          };
        })
        .filter(Boolean);

      // 時間換算用第一軌的寬度：所有軌同寬，而容器的寬度含捲軸與內距
      const trackWidth =
        container.querySelector(".timeline")?.getBoundingClientRect().width ??
        base.width;
      const timeAt = (x) =>
        trackWidth > 0 && duration > 0 ? (x / trackWidth) * duration : 0;

      const draw = () => {
        const left = Math.min(origin.x, current.x);
        const top = Math.min(origin.y, current.y);
        box.style.display = "block";
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${Math.abs(current.x - origin.x)}px`;
        box.style.height = `${Math.abs(current.y - origin.y)}px`;
      };

      const rectOf = () => ({
        x1: origin.x,
        y1: origin.y,
        x2: current.x,
        y2: current.y,
      });

      const handleMouseMove = (moveEvent) => {
        current = toContent(moveEvent.clientX, moveEvent.clientY);
        if (isMarquee(rectOf())) draw();
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        box.style.display = "none";

        const rect = rectOf();
        if (!isMarquee(rect)) return; // 只是點了一下，交給 Timeline 原本的行為

        // 拖曳結束後瀏覽器補的那一下 click 會被判成「點在 block 外面」= 取消選取
        suppressClickUntilRef.current = performance.now() + CLICK_SUPPRESS_MS;

        const hits = segmentsInMarquee(rows, rect, timeAt).map(
          ({ armorIndex, partIndex, segment }) =>
            makeSelection({ armorIndex, partIndex, segment }),
        );

        /*
         * 加選時去掉重複：框到已經選中的色塊不該讓它出現兩次——
         * 選取清單有多個相同項目時，刪除與貼上會對同一個色塊做兩次。
         */
        const seen = new Set(
          baseSelection.map((s) => `${s.armorIndex}:${s.partIndex}:${s.segmentId}`),
        );
        const merged = [...baseSelection];
        for (const hit of hits) {
          const key = `${hit.armorIndex}:${hit.partIndex}:${hit.segmentId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(hit);
        }

        dispatch(updateMultiSelectedBlocks(merged));
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };

    // capture 階段：Timeline 的 block handler 會 stopPropagation，冒泡到不了這裡。
    // 不攔截事件本身——單純點一下空隙仍然要走 Timeline 原本的「取消選取」。
    container.addEventListener("mousedown", handleMouseDown, true);
    return () =>
      container.removeEventListener("mousedown", handleMouseDown, true);
  }, [containerRef, boxRef, dispatch, store, moveMode]);
}

/** 框選的矩形。常駐但預設隱藏——手勢期間只改它的 style，不進 React state */
export function MarqueeBox({ boxRef }) {
  return <div className="marquee-box" ref={boxRef} aria-hidden="true" />;
}

export default MarqueeBox;
