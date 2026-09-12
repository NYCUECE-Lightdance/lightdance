import React, { useRef, useState, useEffect, useMemo, forwardRef, memo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  updateIsColorChangeActive,
  updateMultiSelectedBlocks,
  updateMoveMode,
  updateCurrentTime,
} from "../../redux/actions";
import {
  useSegmentPartTimeline,
  useTableCommit,
} from "../../hooks/useSegmentActionTable.js";
import { buildTimelineBlocks } from "../../utils/segments/blocks.js";
import { TICK_MS } from "../../constants/time.js";
import {
  movableRangeAcross,
  moveAcross,
  resizeSegment,
  MIN_BLOCK_GAP_MS,
  MIN_SEGMENT_MS,
} from "../../utils/segments/gestures.js";
import {
  moveSegmentsToTracks,
  partsOfSelection,
  trackMoveRange,
  updateParts,
} from "../../utils/segments/table.js";
import {
  groupSelectionsByPart,
  makeSelection,
  selectedIdsOnPart,
} from "../../utils/selection.js";
import { sourceSelections } from "../../utils/segments/clipboard.js";

// cloneDeep 已移除：tempActionTable cascade 已合併，drag 復原時再加回
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";

const colorDistance = (color1, color2) => {
  return Math.sqrt(
    Math.pow((color1.R || 0) - (color2.R || 0), 2) +
    Math.pow((color1.G || 0) - (color2.G || 0), 2) +
    Math.pow((color1.B || 0) - (color2.B || 0), 2)
  );
};
// Timeline 組件
const Timeline = forwardRef(
  (
    { height, armorIndex, partIndex, isCopying, tracks, rowIndex },
    timelineRef,
  ) => {
    const dispatch = useDispatch();
    // 跨軌拖曳要動到別條軌，但 Timeline **不能訂閱整張表**（154 個實例會被
    // 每一次編輯喚醒）。只在 mousedown / commit 的當下現讀現寫。
    const { readTable, commitTable } = useTableCommit();

    // **狀態變數**

    // 方塊相關狀態
    // [Drag 已停用] 以下 state 供舊版 drag 功能使用，保留以備日後復原
    // const [hoveredBlock, setHoveredBlock] = useState({
    //   leftedge: false,  // 是否在左邊緣
    //   rightedge: false, // 是否在右邊緣
    //   leftindex: null,  // 左邊緣的方塊索引
    //   rightindex: null, // 右邊緣的方塊索引
    // });
    // const [dragging, setDragging] = useState(false);         // 是否正在拖動方塊
    // const [draggedBlockIndex, setDraggedBlockIndex] = useState(null); // 被拖動的方塊索引
    // const [dragStartpoint, setDragStartpoint] = useState(null);       // 拖動的起始點


    // 只訂閱**自己這一個部位**。訂閱整張表的話，任何地方的編輯都會換掉
    // reference，154 條 Timeline 全部重算 blocks 並各自 dispatch 一次——
    // 現在只有真的被改到的那條會動。
    const { segments, commitPart: commitSegments } = useSegmentPartTimeline(
      armorIndex,
      partIndex,
    );
    const duration = useSelector((state) => state.profiles.duration); // 總時長

    /*
     * 這個部位畫面上的色塊 —— **就地算，不繞 Redux**。
     *
     * 舊版是 `buildTimelineBlocks` 算完 dispatch 進 store，再 `useSelector`
     * 讀回來：寫的人和讀的人是同一個元件，中間沒有第三者。那趟往返的代價是
     * 每次編輯多一個 dispatch，而**一次 dispatch 會通知整個 store 的訂閱者**
     * ——154 條 Timeline 每條約六個 selector，等於每編輯一格就重跑約九百次
     * selector；載入一份光表更是連續 154 次。reducer 那邊還要逐次展開兩層物件。
     *
     * 排版規則（首尾相接、涵蓋 [0, duration)、空隙也是 block）都在
     * `buildTimelineBlocks` 裡，那是純函式所以測得到。
     */
    const timelineBlocks = useMemo(
      () => buildTimelineBlocks(segments, duration),
      [segments, duration],
    );
    const multiSelectedBlocks = useSelector((state) => state.profiles.multiSelectedBlocks); // 全局多選中方塊
    const clipboard = useSelector((state) => state.profiles.clipboard);
    // 兩個手勢常數的唯一定義在 utils/segments/gestures.js——那裡的純函式與
    // 這裡的像素預覽必須用同一組數字，否則拖到底的位置會跟放開後的位置對不上
    const STRETCH_MIN_MS = MIN_SEGMENT_MS;

    // Move Mode 相關 ref（零延遲拖曳，不觸發 React 重繪）
    const moveMode = useSelector((state) => state.profiles.moveMode);
    const moveDragStartRef = useRef(null);   // 拖曳起始 clientX
    const moveDraggedDomsRef = useRef([]); // 對應的 DOM，預覽時一起 transform
    const minDragPxRef = useRef(0);          // 最小可拖曳像素（向左）
    const maxDragPxRef = useRef(0);          // 最大可拖曳像素（向右）
    const moveDragPixelsRef = useRef(0);     // 目前拖曳偏移像素

    /*
     * 跨軌拖曳用的 ref。
     *
     * `moveGroupsRef` 是「按下去的那一刻，選取涵蓋哪幾條軌、各自有哪些段」，
     * 同時也是「現在有沒有在拖」的唯一答案（空陣列 = 沒有）。拖曳期間不重讀
     * ——中途重讀的話，預覽用的邊界會跟放開時的落點對不上。
     *
     * `moveRowShiftRef` 是垂直方向已經跨了幾列（在**可見軌道清單**上算）。
     * 0 代表還在原本那一列，走同軌的規則（撞到鄰居就停）；不是 0 就走換軌的
     * 規則（覆蓋落點）。
     */
    const moveGroupsRef = useRef([]);
    const moveRowShiftRef = useRef(0);
    const blockDomRefs = useRef({});         // index → DOM element
    // 用 ref 保持最新值供 useEffect 閉包使用
    const segmentsRef = useRef(segments);
    const durationRef = useRef(duration);
    useEffect(() => { segmentsRef.current = segments; }, [segments]);
    useEffect(() => { durationRef.current = duration; }, [duration]);

    // Resize 相關 ref（零延遲邊緣拖曳，不觸發 React 重繪）
    const [hoverEdge, setHoverEdge] = useState(null); // { index, edge: 'left'|'right' } | null
    const resizeEdgeRef = useRef(null);        // 'left' | 'right'（正在 resize 的邊）
    const resizeDragStartRef = useRef(null);   // 拖曳起始 clientX
    const resizedIdRef = useRef(null);         // 被 resize 的 segmentId
    const resizedDomRef = useRef(null);        // 被 resize 的 DOM 元素
    const resizeOrigPctRef = useRef(0);        // 原始寬度（% of timeline width）
    const resizeOrigLeftPctRef = useRef(0);    // 原始左緣（% of timeline width）
    const minResizePxRef = useRef(0);          // 拖曳最小值（px，負數為向左）
    const maxResizePxRef = useRef(0);          // 拖曳最大值（px，正數為向右）
    const resizeDragPixelsRef = useRef(0);     // 目前拖曳偏移量（px）
    const resizeRightBoundRef = useRef(0);     // 右邊界時間（ms）：下一個有色 block 起點
    const resizeLeftBoundRef = useRef(0);      // 左邊界時間（ms）：上一個有色 block 終點
    const resizeBlockStartRef = useRef(0);     // 被 resize block 的起始時間（ms）
    const resizeBlockEndRef = useRef(0);       // 被 resize block 的結束時間（ms）

    /**
     * 這一列的 DOM（拖曳時要量位置、也要找別列）。
     *
     * 每條軌的根節點都帶 `data-row-index`，所以「游標在第幾列」是**問畫面**
     * 而不是自己累加列高——逐軌高度可以各自調整，重算一遍等於把版面邏輯
     * 抄第二份。
     */
    const rowElementAt = (row) =>
      document.querySelector(`.timeline[data-row-index="${row}"]`);

    /**
     * 游標停在哪一列，換算成相對於拖曳起點的列數差。
     *
     * 夾住範圍：選取裡最上面那一條不能被推到第 0 列以上、最下面那一條不能
     * 掉出清單。整批共用同一個列數差，所以夾的是整批（和水平位移同一個原則
     * ——搬完之後樂句在幾條軌上仍然對得齊）。
     */
    const rowShiftAt = (clientX, clientY) => {
      if (!Array.isArray(tracks) || tracks.length === 0) return 0;

      const under = document.elementFromPoint(clientX, clientY);
      const row = under?.closest?.(".timeline[data-row-index]");
      if (!row) return moveRowShiftRef.current; // 拖到清單外面就維持上一個落點

      const target = Number(row.dataset.rowIndex);
      if (!Number.isInteger(target)) return 0;

      const rows = moveGroupsRef.current
        .map((group) =>
          tracks.findIndex(
            (track) =>
              track.armorIndex === group.armorIndex &&
              track.partIndex === group.partIndex,
          ),
        )
        .filter((index) => index >= 0);
      if (rows.length === 0) return 0;

      const wanted = target - rowIndex;
      const lowest = Math.min(...rows);
      const highest = Math.max(...rows);
      return Math.max(-lowest, Math.min(tracks.length - 1 - highest, wanted));
    };

    /** 預覽要往下移幾個像素：量目標那一列與這一列的實際落差 */
    const rowOffsetPx = (rowShift) => {
      if (rowShift === 0) return 0;
      const here = rowElementAt(rowIndex);
      const there = rowElementAt(rowIndex + rowShift);
      if (!here || !there) return 0;
      return there.getBoundingClientRect().top - here.getBoundingClientRect().top;
    };

    /**
     * 依「現在是不是換軌」重算水平的可拖曳像素範圍。
     *
     * 同一列：撞到鄰居就停（`movableRangeAcross`）。
     * 換軌：落點是覆蓋，唯一的限制是不要跑出表演的時間範圍（`trackMoveRange`）。
     */
    const applyDragBounds = () => {
      const rect = timelineRef?.current?.getBoundingClientRect();
      const groups = moveGroupsRef.current;
      if (!rect || !rect.width || groups.length === 0) return;

      const range =
        moveRowShiftRef.current === 0
          ? movableRangeAcross(groups, { duration: durationRef.current })
          : trackMoveRange(groups, { duration: durationRef.current });
      if (!range) return;

      const pixelsPerMs = rect.width / durationRef.current;
      minDragPxRef.current = range.min * pixelsPerMs;
      maxDragPxRef.current = range.max * pixelsPerMs;
    };

    /**
     * 把目前的拖曳距離換算成毫秒寫回，並清掉預覽用的 DOM 樣式。
     *
     * 兩個地方會結束一次拖曳——按 M 直接離開 move mode、或再點一下滑鼠提交——
     * 這段邏輯原本兩邊各寫一份，而且其中一份多了一個 `!== 0` 的守衛，
     * 於是兩條路徑的行為悄悄地不一樣。收成一份之後只有一種行為要維護。
     *
     * 只讀 ref，所以放進 ref 給 effect 用不會有 stale closure 的問題。
     */
    const commitMoveDrag = () => {
      const groups = moveGroupsRef.current;
      const dragPx = moveDragPixelsRef.current;
      const rowShift = moveRowShiftRef.current;

      if (groups.length > 0 && timelineRef?.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const pixelsPerMs = rect.width / durationRef.current;
        const deltaMs = dragPx / pixelsPerMs;

        if (rowShift !== 0) {
          commitTrackMove(groups, rowShift, deltaMs);
        } else if (dragPx !== 0) {
          /*
           * 同一列：邊界夾緊、網格對齊、與鄰居的最小間距全部在 moveAcross 裡，
           * 那是純函式所以測得到（gestures.test.js）。這裡只負責把像素換算成
           * 毫秒。整批共用同一個位移量，所以七位舞者的樂句搬完仍然對得齊。
           */
          const updates = moveAcross(groups, deltaMs, {
            duration: durationRef.current,
          });
          commitTable(updateParts(readTable(), updates));
        }
      }

      moveDraggedDomsRef.current.forEach((dom) => {
        if (!dom) return;
        dom.style.transform = "";
        dom.style.zIndex = "";
        dom.style.overflow = "";
        dom.style.pointerEvents = "";
      });

      moveDragStartRef.current = null;
      moveDraggedDomsRef.current = [];
      moveDragPixelsRef.current = 0;
      moveGroupsRef.current = [];
      moveRowShiftRef.current = 0;
    };

    /**
     * 換軌：把選取的段搬到往下（或往上）數 `rowShift` 列的那幾條軌。
     *
     * ⚠️ **平移量是在「可見軌道清單」上算的，不是 `(舞者, 部位)` 座標。**
     * 使用者是拖到眼睛看到的那一列上，而軌道清單是他自己排的——第 3 列的下面
     * 是第 4 列，不必然是同一位舞者的下一個部位。
     *
     * （複製貼上剛好相反，用的是 `(舞者, 部位)` 的二維平移：剪貼簿會跨越工作集
     * 的切換，而工作集隨時可以重排，用列號會貼到完全不同的部位。拖曳沒有這個
     * 問題——它從按下到放開都在同一個畫面上。）
     */
    const commitTrackMove = (groups, rowShift, deltaMs) => {
      if (!Array.isArray(tracks) || tracks.length === 0) return;

      const rowOf = (group) =>
        tracks.findIndex(
          (track) =>
            track.armorIndex === group.armorIndex &&
            track.partIndex === group.partIndex,
        );

      const moves = [];
      for (const group of groups) {
        const row = rowOf(group);
        const target = tracks[row + rowShift];
        // 目標列不存在（拖出清單外）就整批放棄，不要只搬一部分——
        // 搬一半會讓原本對齊的樂句散開，而使用者看不出是被夾住了
        if (row < 0 || !target) return;
        moves.push({ ...group, to: target });
      }

      const range = trackMoveRange(groups, { duration: durationRef.current });
      if (!range) return;
      const shifted = Math.max(
        range.min,
        Math.min(range.max, Math.round(deltaMs / TICK_MS) * TICK_MS),
      );

      const { table, selections } = moveSegmentsToTracks(readTable(), moves, {
        deltaMs: shifted,
      });

      commitTable(table);
      // 選取跟著搬過去的段走。id 沒變，只是換了軌
      if (selections.length > 0) dispatch(updateMultiSelectedBlocks(selections));
    };

    const commitMoveDragRef = useRef(commitMoveDrag);
    commitMoveDragRef.current = commitMoveDrag;

    // Move Mode：進入時掛載全域滑鼠事件，離開時清除
    // 操作邏輯：點 block → 開始跟蹤滑鼠移動（不需按住）→ 再點任意位置 → 提交並退出
    useEffect(() => {
      if (!moveMode) {
        // M 鍵直接退出 move mode 時，若有正在追蹤的 block，先提交位置
        commitMoveDragRef.current();
        return;
      }

      // 滑鼠移動時更新 block 的 DOM 位置（零延遲，不走 React）
      const handleGlobalMouseMove = (e) => {
        if (moveDragStartRef.current === null) return;

        /*
         * 垂直方向：游標現在停在哪一列？
         *
         * 用 `elementFromPoint` 問畫面而不是自己算列高——逐軌高度可以各自
         * 調整（`utils/tracks.js`），累加算一遍等於把版面邏輯抄第二份，
         * 而兩份遲早會不一致。被拖著的色塊在拖曳期間 `pointer-events: none`，
         * 所以問到的是底下那一列而不是它自己。
         */
        const rowShift = rowShiftAt(e.clientX, e.clientY);
        const changedRow = rowShift !== moveRowShiftRef.current;
        moveRowShiftRef.current = rowShift;

        // 換軌與不換軌的水平界線不一樣（換軌是覆蓋，只受表演長度限制），
        // 所以跨列的那一瞬間要重算一次
        if (changedRow) applyDragBounds();

        const rawDelta = e.clientX - moveDragStartRef.current;
        const clamped = Math.max(minDragPxRef.current, Math.min(maxDragPxRef.current, rawDelta));
        moveDragPixelsRef.current = clamped;

        const dy = rowOffsetPx(rowShift);
        // 整批一起位移，使用者看得到樂句是整段在動
        moveDraggedDomsRef.current.forEach((dom) => {
          if (dom) dom.style.transform = `translate(${clamped}px, ${dy}px)`;
        });
      };

      // 任意點擊（mousedown）→ 提交目前位置並退出 move mode
      // 注意：點 block 本身的 mousedown 若是「選取新 block」會 stopPropagation，
      //       所以此 handler 只有在「已有追蹤中的 block」或「點空白處」時才觸發提交。
      const handleGlobalMouseDown = () => {
        commitMoveDragRef.current();
        dispatch(updateMoveMode(false));
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mousedown', handleGlobalMouseDown);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mousedown', handleGlobalMouseDown);
      };
    }, [moveMode, armorIndex, partIndex, dispatch]);

    // 左、右箭頭的樣式
    const leftarrowStyle = {
      position: "absolute",
      top: "50%",
      left: "2px",
      transform: "translateY(-40%) scaleX(-1)",
      fontSize: "22px",
      color: "white",
      pointerEvents: "none", // 禁用滑鼠事件
    };

    const rightarrowStyle = {
      position: "absolute",
      top: "50%",
      right: "2px",
      transform: "translateY(-50%)",
      fontSize: "22px",
      color: "white",
      pointerEvents: "none", // 禁用滑鼠事件
    };

    /*
     * 「點到色塊以外就取消選取」原本掛在這裡。
     *
     * 那讓每一條軌都各掛一份**內容完全相同**的 document listener（工作集開滿
     * 是 154 份），每次點擊全部跑一遍、各自 dispatch 一次同樣的清空動作。
     * 而那個行為本來就不屬於某一條軌——清空的是全域選取。
     *
     * 現在由 `hooks/useDeselectOnOutsideClick.js` 在 audioplayer 掛一次。
     */

    /*
     * 這裡原本有兩個 effect 在維護 `canvasRef` / `canvasWidth` / `canvasHeight`，
     * 但**這個元件的 JSX 裡從來沒有 `<canvas>`** ——ref 永遠是 null，
     * `canvasHeight` 從頭到尾沒有人讀。時間軸的色塊是 `<div>` 畫的。
     *
     * 死掉還在花錢：那個 effect 掛在 `[timelineRef, zoomValue]` 上，所以
     * **每動一次縮放，154 條 Timeline 各多一次 setState 造成的重繪**。
     * 拖縮放滑桿會連續產生很多次縮放變更，每一次都白繪 154 個元件。
     *
     * ⚠️ effect 刪掉之後 `zoomValue` **這個 prop 還留著**，於是帳單沒有真的
     * 消失：這個元件是 `memo` 的，而 zoomValue 每動一格縮放就變一次，
     * 154 個實例照樣全部被喚醒——為了一個元件裡沒有任何地方讀取的值。
     * 現在連 prop 一起移除了。縮放是靠外層容器的 `width: 100 * zoomLevel %`
     * 做的，時間軸的色塊用百分比寬度，本來就不需要知道倍率。
     */


    /**
     * 由視覺 block 取得對應的 segment。空隙（`segmentId === null`）回傳 null。
     *
     * 舊版是拿 `block.startTime` 回頭去 keyframe 陣列 findIndex，還要排除
     * 同時間的黑點；那段反查在這個檔案裡有 5 份複本。block 現在自己帶著 id。
     */
    const segmentOfBlock = (block) =>
      block?.segmentId
        ? (segments.find((s) => s.id === block.segmentId) ?? null)
        : null;

    /** 把一個 block 包成選取項目（空隙回傳 null） */
    const selectionForBlock = (block) => {
      const segment = segmentOfBlock(block);
      if (!segment) return null;

      return makeSelection({ armorIndex, partIndex, segment });
    };

    /** 目前這條時間軸上被選中的 segmentId（渲染時逐 block 判斷用） */
    const selectedIds = selectedIdsOnPart(
      multiSelectedBlocks,
      armorIndex,
      partIndex,
    );

    /**
     * 這條時間軸上「當初被 Ctrl+C 複製走」的 segmentId。
     *
     * 剪貼簿是跨軌的（一次可以複製七位舞者的同一個樂句），所以來源標記也會
     * 同時出現在好幾條軌上——把它攤平成同一份選取格式再逐條過濾，
     * 和 `selectedIds` 走同一條路。
     */
    const copiedIds = selectedIdsOnPart(
      sourceSelections(clipboard),
      armorIndex,
      partIndex,
    );

    // 處理鼠標按下事件
    const handleMouseDown = (e, index) => {
      // ⚠️ stopPropagation 不可在此提前呼叫：
      // Move Mode 時必須根據情況決定是否攔截，讓全域 mousedown 能夠觸發提交/退出。

      const block = timelineBlocks[index];
      // 「這個 block 是不是空隙」以前是問「顏色是不是純黑」——但使用者本來
      // 就可以放一個很暗的色塊。現在直接看有沒有 segmentId。
      const isGapBlock = !block?.segmentId;

      // Move Mode 邏輯：
      // - 若已在追蹤中 或 點到空隙：不攔截 → 全域 mousedown 提交/退出
      // - 若尚未追蹤且點到色塊：stopPropagation 開始追蹤（本次點擊是「選取」，不是「提交」）
      if (moveMode) {
        if (moveGroupsRef.current.length > 0) return; // 已追蹤 → 讓全域 handler 提交
        if (isGapBlock) return;                          // 空隙 → 讓全域 handler 退出

        // 本次點擊是「選取 block 開始追蹤」，攔截讓全域 handler 無法立刻觸發提交
        e.stopPropagation();
        e.preventDefault();

        const selection = selectionForBlock(block);
        if (!selection?.segmentId) return;

        /*
         * 點到已經在選取裡的色塊 → 整批一起搬（Shift 選了一段樂句就是要整段移）。
         * 點到選取外的色塊 → 這一下算重新選取，只搬它自己。
         */
        const inSelection = selectedIds.has(selection.segmentId);

        /*
         * 點到已經在選取裡的色塊 → **整批**一起搬，包含別條軌上的那些
         * （框選一次選到七位舞者的同一個樂句，拖任何一塊就是整組在動）。
         * 點到選取外的色塊 → 這一下算重新選取，只搬它自己。
         */
        if (!inSelection) dispatch(updateMultiSelectedBlocks([selection]));

        const table = readTable();
        const groups = inSelection
          ? partsOfSelection(table, groupSelectionsByPart(multiSelectedBlocks))
          : [
              {
                armorIndex,
                partIndex,
                segmentIds: new Set([selection.segmentId]),
                segments,
              },
            ];
        // 只選了軌沒選色塊的那幾組拖不動，濾掉才不會讓 rowShift 被它們夾住
        moveGroupsRef.current = groups.filter(
          (group) => group.segmentIds.size > 0,
        );
        if (moveGroupsRef.current.length === 0) return;

        const rect = timelineRef.current?.getBoundingClientRect();
        if (!rect) return;

        moveDragStartRef.current = e.clientX;
        moveRowShiftRef.current = 0;
        moveDragPixelsRef.current = 0;
  
        /*
         * 拖曳範圍（像素）—— 只給拖曳過程的即時預覽用，放開時的最終位置會
         * 重算一次。**兩邊問的是同一個函式**，所以不會出現「拖到底了但放開後
         * 又跳一點」的錯位；先前這裡自己用像素重算一遍邊界，那正是那類錯位
         * 的來源。
         */
        applyDragBounds();

        /*
         * 要預覽的 DOM 可能在**別的 Timeline 元件**裡，那些節點不在這次事件上
         * 也不在自己的 blockDomRefs 裡。色塊都帶了 `data-segment-id`，
         * 所以直接跟畫面要——這比讓 154 個元件互相持有 ref 簡單得多。
         */
        const ids = moveGroupsRef.current.flatMap((group) => [
          ...group.segmentIds,
        ]);
        moveDraggedDomsRef.current = ids
          .map((id) =>
            document.querySelector(`.timeline-block[data-segment-id="${id}"]`),
          )
          .filter(Boolean);

        moveDraggedDomsRef.current.forEach((dom) => {
          // 拖曳時提高 z-index，確保移動中的 block 顯示在所有相鄰 block 上方
          dom.style.zIndex = "100";
          dom.style.overflow = "visible";
          // 讓 elementFromPoint 問得到底下那一列，而不是被拖著的色塊自己
          dom.style.pointerEvents = "none";
        });
        return;
      }

      // 非 Move Mode：維持原本行為，攔截事件
      e.stopPropagation();

      // 邊緣 resize 邏輯：已選中的色塊在邊緣按下時啟動 resize，不進入普通選取流程
      if (
        !isGapBlock &&
        selectedIds.has(block.segmentId) &&
        hoverEdge?.index === index
      ) {
        e.preventDefault();
        startBlockResize(e, index, hoverEdge.edge);
        return;
      }

      if (isCopying) {
        // 關鍵：在尋找貼上目標時，僅更新單選(綠框目標)
        const selection = selectionForBlock(block);
        if (selection) {
          dispatch(updateMultiSelectedBlocks([selection]));
        }
        return;
      }

      // 點到空隙 = 取消所有選取
      if (isGapBlock) {
        dispatch(updateMultiSelectedBlocks([]));
        return;
      }

      const selection = selectionForBlock(block);
      if (!selection) return;

      // 點擊區塊時同步更新 currentTime，確保後續操作（如 Cut）能正確定位
      // 使用區塊自身的 bounding rect 計算區塊內點擊位置對應的時間，
      // 避免依賴 timeline 容器寬度（flex 百分比寬度像素捨入會累積誤差）
      // const blockRect = e.currentTarget?.getBoundingClientRect();
      // if (blockRect && blockRect.width > 0) {
      //   const clickFraction = (e.clientX - blockRect.left) / blockRect.width;
      //   const rawTime = block.startTime + clickFraction * block.durationTime;
      //   const clickTime = Math.round(rawTime / 50) * 50;
      //   dispatch(updateCurrentTime(Math.max(0, Math.min(clickTime, duration))));
      // }

      // Shift-click 多選：選取錨點與這次點擊之間的所有色塊。
      //
      // 舊版是走 keyframe 索引區間、跳過黑點；現在直接走 segment 陣列，
      // 「中間有幾個色塊」就是幾個，不必再判斷誰是哨兵。
      const anchorBlock = multiSelectedBlocks[0];
      const anchorSegmentIndex =
        e.shiftKey && anchorBlock
          ? segments.findIndex((s) => s.id === anchorBlock.segmentId)
          : -1;

      if (anchorSegmentIndex !== -1) {
        const clickedIndex = segments.findIndex(
          (s) => s.id === block.segmentId,
        );
        const from = Math.min(anchorSegmentIndex, clickedIndex);
        const to = Math.max(anchorSegmentIndex, clickedIndex);

        dispatch(
          updateMultiSelectedBlocks(
            segments
              .slice(from, to + 1)
              .map((segment) => makeSelection({ armorIndex, partIndex, segment })),
          ),
        );
      } else {
        // Single-select logic
        // [Drag 已停用] 啟用 drag 時需恢復以下三行，並同步恢復 state 宣告、handleMouseMove、handleMouseUp
        // setDragging(true);
        // setDraggedBlockIndex(index);
        // setDragStartpoint(e.clientX);
        dispatch(updateMultiSelectedBlocks([selection]));
      }
    };


    // [Drag 已停用] handleMouseUp：drag 提交用，啟用 drag 時需一併恢復 onMouseUp={handleMouseUp} 在 timeline div
    // const handleMouseUp = () => {
    //   // Move Mode 的 commit 用 mousedown 完成，mouseup 不應干預（否則會覆蓋剛提交的位置）
    //   if (dragging && !moveMode) {
    //     setDragging(false);
    //     setDraggedBlockIndex(null);
    //     dispatch(updateActionTable(tempActionTable));
    //   }
    // };
    // stretch mode
    // 開始邊緣 resize：掛載全域 mousemove/mouseup，透過 DOM 直接更新寬度（零延遲）
    // edge: 'left' | 'right'，tlIdx: timelineBlocks index
    const startBlockResize = (e, tlIdx, edge) => {
      const block = timelineBlocks[tlIdx];
      if (!block?.segmentId) return;
      const index = segments.findIndex((s) => s.id === block.segmentId);
      if (index === -1) return;
      const target = segments[index];

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pixelsPerMs = rect.width / duration;

      const blockStartTime = target.start;
      const blockEndTime = target.end;

      const domEl = blockDomRefs.current[tlIdx];
      if (!domEl) return;

      /*
       * 舊版在這裡抓相鄰的空隙 DOM，拖曳時反向縮放它來維持 flex 總寬，
       * 否則後面每一塊都會跟著位移。色塊改成絕對定位之後，撐大這一塊不會
       * 動到任何其他塊，那組補償整個不需要了。
       */

      resizeEdgeRef.current      = edge;
      resizeDragStartRef.current = e.clientX;
      resizedIdRef.current       = block.segmentId;
      resizedDomRef.current      = domEl;
      resizeDragPixelsRef.current = 0;
      resizeOrigPctRef.current   = (block.durationTime / duration) * 100;
      resizeOrigLeftPctRef.current = (block.startTime / duration) * 100;
      domEl.style.zIndex = '100';

      resizeBlockStartRef.current = blockStartTime;
      resizeBlockEndRef.current   = blockEndTime;

      /*
       * 可拖曳範圍（像素）—— 只給拖曳過程的即時預覽用，放開時由 `resizeSegment`
       * 重算一次最終值。兩邊必須用同一組常數，否則拖到底之後放開會再跳一下。
       *
       * 鄰居直接看陣列的前後一格。舊版要往前往後跳過連續的黑色 entry：
       * 被刪掉的色塊會留下孤立黑點，只看相鄰一格會找到錯的邊界。
       */
      // 鄰居的實際邊界（不含間距）——放開後要用它算相鄰空隙的新寬度
      resizeRightBoundRef.current =
        index < segments.length - 1 ? segments[index + 1].start : duration;
      resizeLeftBoundRef.current = index > 0 ? segments[index - 1].end : 0;

      if (edge === 'right') {
        const maxEnd = Math.min(
          resizeRightBoundRef.current - MIN_BLOCK_GAP_MS,
          duration,
        );
        maxResizePxRef.current = Math.max(0, (maxEnd - blockEndTime) * pixelsPerMs);
        minResizePxRef.current = -(blockEndTime - blockStartTime - STRETCH_MIN_MS) * pixelsPerMs;
      } else {
        const minStart = Math.max(resizeLeftBoundRef.current + MIN_BLOCK_GAP_MS, 0);
        minResizePxRef.current = Math.min(0, (minStart - blockStartTime) * pixelsPerMs);
        maxResizePxRef.current = (blockEndTime - STRETCH_MIN_MS - blockStartTime) * pixelsPerMs;
      }

      const handleResizeMouseMove = (ev) => {
        const rawDelta = ev.clientX - resizeDragStartRef.current;
        const clamped  = Math.max(minResizePxRef.current, Math.min(maxResizePxRef.current, rawDelta));
        resizeDragPixelsRef.current = clamped;
        const origPct = resizeOrigPctRef.current;
        const origLeftPct = resizeOrigLeftPctRef.current;
        if (resizeEdgeRef.current === 'right') {
          // 右拖：右緣跟著游標，左緣不動 → 只改寬度
          resizedDomRef.current.style.width = `calc(${origPct}% + ${clamped}px)`;
        } else {
          // 左拖：左緣跟著游標，右緣不動 → left 與 width 反向等量變動
          resizedDomRef.current.style.left  = `calc(${origLeftPct}% + ${clamped}px)`;
          resizedDomRef.current.style.width = `calc(${origPct}% - ${clamped}px)`;
        }
      };

      const handleResizeMouseUp = () => {
        const dragPx    = resizeDragPixelsRef.current;
        const savedId = resizedIdRef.current;
        const savedEdge = resizeEdgeRef.current;

        // 將最終計算結果提升到 produce 外，供 DOM 直接更新使用
        let committedEnd   = null; // right edge 時設定
        let committedStart = null; // left  edge 時設定

        if (savedId !== null && timelineRef?.current) {
          const r = timelineRef.current.getBoundingClientRect();
          if (r.width > 0) {
            const pxPerMs = r.width / durationRef.current;
            const rawDeltaMs = dragPx / pxPerMs;
            const dur = durationRef.current;

            /*
             * 邊界夾緊與網格對齊都在 resizeSegment 裡（純函式，測得到）。
             * 舊版除了算這些，還要把「因為位移而順序錯亂的孤立黑色 entry」
             * 一個個夾回去——那些黑點是熄滅的表示法，segment 模型裡不存在。
             */
            const nextSegments = resizeSegment(
              segmentsRef.current,
              savedId,
              savedEdge,
              rawDeltaMs,
              { duration: dur },
            );
            commitSegments(nextSegments);

            // DOM 要用最終值把寬度寫死（理由見下方註解），所以把結果讀回來
            const committed = nextSegments.find((seg) => seg.id === savedId);
            if (committed) {
              if (savedEdge === 'right') committedEnd = committed.end;
              else committedStart = committed.start;
            }
          }
        }

        // DOM 直接設為最終正確寬度，而非清空為 ''。
        // 原因：dispatch 後 timelineBlocks 需經兩步 effect 鏈才更新（actionTable → tempActionTable → timelineBlocks）。
        // 若先清空，React reconciler 在 timelineBlocks 尚未更新時因 virtual DOM width 前後相同而不更新真實 DOM，
        // 導致 block 以 width:'' 顯示（寬度 0，視覺消失）直到 timelineBlocks 終於更新為止。
        const dur = durationRef.current;

        if (resizedDomRef.current) {
          if (committedEnd !== null) {
            // 右邊拉伸：左緣沒動，只有寬度變成 (newEnd - blockStart) / dur
            resizedDomRef.current.style.width = `${((committedEnd - resizeBlockStartRef.current) / dur) * 100}%`;
          } else if (committedStart !== null) {
            // 左邊拉伸：右緣沒動，left 與 width 都要寫成最終值
            resizedDomRef.current.style.left = `${(committedStart / dur) * 100}%`;
            resizedDomRef.current.style.width = `${((resizeBlockEndRef.current - committedStart) / dur) * 100}%`;
          } else {
            resizedDomRef.current.style.left = '';
            resizedDomRef.current.style.width = '';
          }
          resizedDomRef.current.style.zIndex = '';
        }

        // 相鄰的空隙不必再校正——絕對定位下它們的位置與這一塊無關

        resizeEdgeRef.current       = null;
        resizeDragStartRef.current  = null;
        resizedIdRef.current     = null;
        resizedDomRef.current       = null;
        resizeDragPixelsRef.current = 0;
        setHoverEdge(null);

        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup',   handleResizeMouseUp);
      };

      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup',   handleResizeMouseUp);
    };


    return (
      <div
        className="timeline"
        ref={timelineRef} // 設置 ref
        /*
         * 拖曳時要知道「游標停在哪一列」。用屬性讓 `elementFromPoint` 直接
         * 問到答案，比讓 154 個元件互相持有 ref、或自己累加逐軌高度都可靠
         * ——後者等於把版面邏輯抄第二份。
         */
        data-row-index={rowIndex}
        data-armor-index={armorIndex}
        data-part-index={partIndex}
        style={{
          // 高度改由使用者指定的像素決定（見 utils/tracks.js）——舊版是
          // `100 / 軌道數 %`，加一條軌道會讓其他每一條都變矮
          flex: `0 0 ${height}px`,
          width: "100%",
          /*
           * 色塊改成絕對定位，這一列是它們的定位基準。
           *
           * 舊版是 flex + 百分比寬度，色塊靠前後相接排出位置——所以「空隙也
           * 必須是一個 block」，否則後面的色塊會往前擠、和紅線對不上。代價是
           * **任何一塊的寬度變動都會推到其他每一塊**：resize 預覽為此要同步
           * 反向縮放相鄰的空隙來維持總寬，而想給極窄的色塊一個最小寬度更是
           * 做不到（總寬超過 100%，flex 會把所有色塊等比壓縮，整列跟播放頭
           * 錯位）。
           *
           * 絕對定位之後每一塊的 `left` 與 `width` 各自獨立：撐大某一塊不會
           * 移動任何其他塊，與紅線的對齊是逐塊保證的而不是靠總和剛好 100%。
           */
          position: "relative",
          overflow: moveMode ? "visible" : "hidden", // move mode 時允許 block 超出容器邊界顯示
          border: "1px solid rgb(63, 63, 63)",
          boxSizing: "border-box",
          padding: "0px",
        }}
        // [Drag 已停用] 啟用 drag 時需恢復以下兩行
        // onMouseMove={handleMouseMove}
        // onMouseUp={handleMouseUp}
      >
      {timelineBlocks.map((block, index) => {
        // --- 1. 定義狀態變數 ---
        // block 自己帶著 segmentId，不必再回頭去 keyframe 陣列反查索引
        const isCurrentlyInMultiSelect =
          !!block.segmentId && selectedIds.has(block.segmentId);

        // A. 判斷是否為「貼上目標」(綠色)：在複製模式下且被點擊選中
        const isPasteTarget = isCopying && isCurrentlyInMultiSelect;

        // B. 判斷是否為「複製來源」（白色虛線 ring）：從剪貼簿讀取當初 Ctrl+C 的位置。
        //    剪貼簿是跨軌的，但這裡只問「這一條上有哪些」，所以先收成 Set
        const isCopySource =
          isCopying && !!block.segmentId && copiedIds.has(block.segmentId);

        // C. 判斷是否為「普通選取」（白色實線 ring）：非複製模式下的正常選取
        const isNormalSelected = !isCopying && isCurrentlyInMultiSelect;

        // --- 2. 顏色與樣式邏輯 ---
        const color = block.color || { R: 0, G: 0, B: 0, A: 1 };
        const isFade = block.linear === 1;

        // 定義背景。漸變的終點色記在 segment 自己身上（`colorEnd`），
        // 舊版要去看後面一個、再後面一個關鍵格並判斷誰是黑哨兵才推得出來。
        let backgroundStyle;
        if (isFade) {
          const endColor = block.colorEnd || { R: 0, G: 0, B: 0, A: 1 };
          backgroundStyle = `linear-gradient(to right, rgba(${color.R},${color.G},${color.B},${color.A}), rgba(${endColor.R},${endColor.G},${endColor.B},${endColor.A}))`;
        } else {
          backgroundStyle = `rgba(${color.R}, ${color.G}, ${color.B}, ${color.A})`;
        }

          // 空隙不能被選取、拖曳、resize（以前是用「顏色是不是純黑」判斷）
          const isGapBlock = !block.segmentId;

          /*
           * 選取框：一律白色雙層 ring，靠**線型**而不是顏色區分三種狀態。
           *
           * 舊版是橘色，撞到橘色色塊時改判青色——只擋得住一種顏色，選一塊青色
           * 色塊時邊框直接消失。而且「複製來源」與「普通選取」長得一模一樣，
           * 使用者只能靠記得自己剛才按了什麼。
           *
           * 白色在飽和色上對比最高，外圈的深色則保證在白色/淺色色塊上也看得見
           * ——這樣任何底色都讀得出來，不需要任何依顏色分支的判斷。
           */
          /*
           * ring 必須畫在**框內**（`inset`）。
           *
           * `.timeline` 在非 move mode 時是 `overflow: hidden`，畫在框外的
           * box-shadow 會被裁掉——第一塊色塊的左側 ring 永遠不見，軌道多的
           * 時候（7 軌時每軌只有約 40px 高）連上下兩邊也一起被切。
           *
           * inset 同時保證 ring 不會改變色塊的佔位，跟舊版用 border 一樣。
           */
          const ring = (width, color) =>
            `inset 0 0 0 ${width}px ${color}, inset 0 0 0 ${width + 2}px var(--ring-outer)`;

          const boxShadow = isPasteTarget
            ? ring(3, "var(--ring-selected)") // 貼上目標：最粗
            : isCopySource || isNormalSelected
              ? ring(2, "var(--ring-selected)")
              : "none";

          // 設定 blockStyle
          const blockStyle = {
            background: backgroundStyle,
            // 位置與寬度各自獨立（見容器上的說明），不再靠前後相接排出來
            position: "absolute",
            left: `${(block.startTime / duration) * 100}%`,
            width: `${(block.durationTime / duration) * 100}%`,
            top: "5%",
            height: "90%",
            /*
             * ⚠️ 極窄的色塊要有一個最小可見寬度。
             *
             * 一個 50ms 的段在 282 秒的表演裡是 0.0177%，1 倍率下約 **0.25px**
             * ——畫得出來但看不見，也點不到。而它是真的資料：`movableRange`
             * 會把它當鄰居，於是使用者的拖曳被一個畫面上不存在的東西擋住。
             * 這種碎片是 `clearRange` 的 trim 產生的，一次普通的貼上就會留下。
             *
             * 空隙不給最小寬度：它本來就該是看不見的，撐大反而會蓋住旁邊真正
             * 的碎片。
             */
            ...(isGapBlock ? null : { minWidth: "2px" }),
            borderRadius: "var(--radius-sm)",
            // 空隙墊在最底層，否則同 z-index 時 DOM 順序在後的空隙會蓋掉
            // 前面那個被撐到 2px 的碎片
            zIndex: isPasteTarget
              ? 12
              : isCopySource || isNormalSelected
                ? 10
                : isGapBlock
                  ? 0
                  : 1,
            boxShadow,
            // 複製來源用虛線區分——它和普通選取都是「被選中」，差在接下來會發生什麼
            outline: isCopySource ? "2px dashed var(--ring-selected)" : "none",
            outlineOffset: "-1px",
            boxSizing: "border-box",
            cursor: "default",
          };

          // [Drag 已停用] 以下三個 handler 供舊版 drag 邊緣偵測使用，啟用 drag 時需一併恢復 hoveredBlock state
          // const handleMouseLeave2 = (edge) => {
          //   setHoveredBlock((prev) => {
          //     const updatedBlock = { ...prev, [edge]: false };
          //     if (edge === "leftedge") updatedBlock.leftindex = null;
          //     if (edge === "rightedge") updatedBlock.rightindex = null;
          //     return updatedBlock;
          //   });
          // };
          // const handleMouseMoveLeft = (index) => {
          //   setHoveredBlock((prev) => ({ ...prev, leftedge: true, leftindex: index }));
          // };
          // const handleMouseMoveRight = (index) => {
          //   setHoveredBlock((prev) => ({ ...prev, rightedge: true, rightindex: index }));
          // };
          // 邊緣偵測：僅對已選中的有色 block 偵測游標位置以顯示 ew-resize 游標
          // （isNormalSelected 已在上方宣告）
          const EDGE_THRESHOLD = 8; // px

          const handleBlockMouseMove = (ev) => {
            // resizeDragStartRef 不為 null 代表正在 resize，跳過 state 更新避免觸發 React 重繪覆蓋直接設定的 DOM style
            if (moveMode || isGapBlock || !isNormalSelected || resizeDragStartRef.current !== null) return;
            const r = ev.currentTarget.getBoundingClientRect();
            const offsetX = ev.clientX - r.left;
            if (offsetX <= EDGE_THRESHOLD) {
              setHoverEdge({ index, edge: 'left' });
            } else if (offsetX >= r.width - EDGE_THRESHOLD) {
              setHoverEdge({ index, edge: 'right' });
            } else if (hoverEdge?.index === index) {
              setHoverEdge(null);
            }
          };

          const handleBlockMouseLeave = () => {
            // move mode 或 resize 進行中，不觸發 state 更新（避免 React re-render 覆蓋直接設定的 DOM style）
            if (moveMode || resizeDragStartRef.current !== null) return;
            if (hoverEdge?.index === index) setHoverEdge(null);
          };

          // 游標優先序：resize 邊緣 > move mode > 預設
          const blockCursor = (!moveMode && hoverEdge?.index === index)
            ? 'ew-resize'
            : (moveMode && !isGapBlock ? 'grab' : 'default');

          return (
            <div
              key={index}
              ref={(el) => { blockDomRefs.current[index] = el; }}
              style={{
                ...blockStyle,
                cursor: blockCursor,
                // [Drag 已停用] hoveredBlock 懸停透明度，啟用 drag 時恢復：
                // ...(hoveredBlock?.index === index ? { opacity: 0.85 } : { opacity: 1 }),
              }}
              className={`timeline-block${isPasteTarget ? " is-paste-target" : ""}`}
              // 選取狀態目前只反映在 box-shadow 上，而顏色是使用者的資料，
              // 從樣式反推「這塊有沒有被選到」很脆弱。用一個屬性明講。
              data-selected={isNormalSelected || isCopySource ? "true" : undefined}
              // 空隙也是一個 block（排版上首尾相接涵蓋整條時間軸），框選要能認出
              // 「這裡按下去是空白處」。同樣不要從樣式反推——空隙的背景是純黑，
              // 而純黑也是合法的燈色。
              data-gap={isGapBlock ? "true" : undefined}
              // 跨軌拖曳時，別條軌上的色塊 DOM 不在事件上也不在自己的 ref 裡，
              // 只能跟畫面要。順帶讓 e2e 不必再靠「第 N 個 block」定位
              data-segment-id={block.segmentId || undefined}
              onMouseMove={moveMode ? undefined : handleBlockMouseMove}
              onMouseLeave={moveMode ? undefined : handleBlockMouseLeave}
              onMouseDown={(e) => handleMouseDown(e, index)}
            >
              {block.linear === 1 && (
                <FontAwesomeIcon
                  icon={faWandMagicSparkles}
                  size="xl"
                  style={{
                    position: "absolute",
                    top: "5px",
                    right: "5px",
                    color: "var(--ring-selected)",
                    zIndex: 2,
                  }}
                />
              )}
              {/*
                亮度未滿的記號。
                「100% 亮度的鮮紅、alpha 設 30%」與「30% 亮度的暗紅、alpha 設 100%」
                合成後**像素完全相同**——這是數學不是 bug，用眼睛永遠分不出來。
                所以在右上角補一個不佔色相的三角角標，只表達「這塊沒有全亮」。
                漸變段已經有魔杖圖示佔著右上角，就不再疊一個。
              */}
              {!isGapBlock && block.linear !== 1 && (block.color?.A ?? 1) < 1 && (
                <span
                  className="block-dim-mark"
                  title={`亮度 ${Math.round((block.color?.A ?? 1) * 100)}%`}
                />
              )}
              {/*
                頻閃的記號。
                頻閃現在是段上的 metadata，**色塊不會被切開**，所以畫面上完全
                看不出這一塊在閃——必須有一個記號，否則使用者只能靠播放才知道。
                用一排短豎線（明暗交替）而不是圖示：它直接畫出「亮、滅、亮、滅」
                這件事，而且不佔色相。
              */}
              {!isGapBlock && block.blinkPeriod && (
                <span
                  className="block-blink-mark"
                  title={`頻閃 ${block.blinkPeriod}ms`}
                />
              )}
              {" "}
              {/*
              {/* 如果不是黑色方块，渲染左右虛擬檢測塊
              {!(
                block.color.R === 0 &&
                block.color.G === 0 &&
                block.color.B === 0 &&
                block.color.A === 1
              ) && (
                <>
                  {/* 左側虛擬檢測方塊 
                  <div
                    style={{
                      position: "absolute",
                      left: "-5px",
                      width: "50px",
                      height: "80%",
                      backgroundColor: "transparent", // 透明
                      cursor: "pointer", // 改變鼠標樣式
                      zIndex: 5,
                    }}
                    onMouseMove={() => handleMouseMoveLeft(index)}
                    onMouseLeave={() => handleMouseLeave2("leftedge")}
                  />
                  {/* 右側虛擬檢測方塊  
                  <div
                    style={{
                      position: "absolute",
                      right: "-5px",
                      width: "50px",
                      height: "80%",
                      backgroundColor: "transparent", // 透明
                      cursor: "pointer", // 改變鼠標樣式
                      zIndex: 5,
                    }}
                    onMouseMove={() => handleMouseMoveRight(index)}
                    onMouseLeave={() => handleMouseLeave2("rightedge")}
                  />{" "}
                  {hoveredBlock?.leftindex === index &&
                    hoveredBlock.leftedge && (
                      <FontAwesomeIcon
                        style={leftarrowStyle}
                        icon={faRightToBracket}
                        size="lg"
                      />
                    )}
                  {hoveredBlock?.rightindex === index &&
                    hoveredBlock.rightedge && (
                      <FontAwesomeIcon
                        style={rightarrowStyle}
                        icon={faRightToBracket}
                        size="lg"
                      />
                    )}
                </>
              )}
              */}
            </div>
          );
        })}
      </div>
    );
  }
);

export default memo(Timeline);
