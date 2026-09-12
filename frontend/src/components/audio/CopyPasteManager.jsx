import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  updateClipboard,
  updateMultiSelectedBlocks,
} from "../../redux/actions.js";
import {
  groupSelectionsByPart,
  makeSelection,
  findSegmentById,
} from "../../utils/selection.js";
import {
  partsOfSelection,
  updateParts,
} from "../../utils/segments/table.js";
import {
  hasContent,
  packClipboard,
  planOverwrite,
  planPaste,
} from "../../utils/segments/clipboard.js";
import { useSegmentActionTable } from "../../hooks/useSegmentActionTable.js";
import { TICK_MS } from "../../constants/time.js";

/**
 * 複製貼上：兩種粒度、兩種貼上對齊方式，**全部跨軌**。
 *
 * | 操作 | 快捷鍵 | 行為 |
 * |---|---|---|
 * | 複製區間 | Ctrl+C | 把選取的色塊（可跨軌）存進剪貼簿，並進入「複製模式」 |
 * | 貼到選取處 | Ctrl+V | 以目標色塊的起點與部位為基準貼上 |
 * | 原時間貼上 | Ctrl+Shift+V | 保持原本的時間，只換軌道 |
 * | 複製整條 | Shift+C | 選到的每一條 timeline 整條存進剪貼簿 |
 * | 覆蓋整條 | Shift+V | 整條 timeline 覆蓋過去 |
 *
 * `isCopying`（複製模式）是純 UI 狀態——Timeline 靠它顯示來源標記、
 * 頂端顯示提示橫幅——所以留在元件裡用 hook 傳遞，不進 Redux。
 *
 * ## 為什麼會是跨軌的
 *
 * 框選一次就能選到七位舞者身上的同一個樂句，但舊的剪貼簿只認得一條時間軸：
 * `copyRange` 拿 `multiSelectedBlocks[0]` 的部位，其餘的**默默丟掉**。
 * 於是「把整組的副歌複製到後面」這件事只能一位舞者做一次、做七遍。
 *
 * 剪貼簿現在存的是一個矩形（區間 × 幾條軌），落點由
 * `utils/segments/clipboard.js` 算——那裡也是「軌道怎麼平移」的唯一定義處。
 *
 * ## Phase 5e：改成 segment 原生
 *
 * 舊版在壓平出來的 keyframe 陣列上操作，貼上一次要做四件跟黑點有關的事：
 * 平移時「有色點對齊網格、黑點保持原偏移」、清衝突時「衝突結束後緊跟的黑塊
 * 也要刪」、插入後「檢查起點前方需不需要補黑點」（`ensureBlackBefore`）、
 * 最後再跑一次 `removeDuplicateBlackBlocks` 收拾殘留。
 *
 * segment 模型裡這四件事全部消失：熄滅就是段與段之間的空隙，貼上就是
 * 「把要貼的區間清空，再把平移過的段放進去」。`clearRange` 連被切成兩半的
 * 情況都處理好了。
 */
export function useCopyPaste() {
  const dispatch = useDispatch();
  const { segmentTable, commit } = useSegmentActionTable();
  const clipboard = useSelector((state) => state.profiles.clipboard);
  const multiSelectedBlocks = useSelector(
    (state) => state.profiles.multiSelectedBlocks,
  );

  // 複製模式：Timeline 靠它顯示來源標記，純 UI 狀態不進 Redux
  const [isCopying, setIsCopying] = useState(false);

  /*
   * 相位偏移（跑馬燈）：每往下一條軌就再往後推這麼多毫秒。
   *
   * 它是**貼上的參數**而不是剪貼簿的內容，所以不進 clipboard——同一份剪貼簿
   * 可以先貼一次整齊的、再貼一次跑馬燈的。留在這裡是為了跨多次貼上還記得，
   * 但不必進 Redux（沒有別人要讀）。
   */
  const [phaseMs, setPhaseMs] = useState(0);

  /** 選取涵蓋的每一條時間軸，附上內容 */
  const groups = partsOfSelection(
    segmentTable,
    groupSelectionsByPart(multiSelectedBlocks),
  );

  /** 錨點：使用者最先點到的那一條。貼上的軌道平移量以它為基準 */
  const anchor = multiSelectedBlocks[0] ?? null;

  /**
   * 貼上的落點。`Ctrl+V` 要對齊「目標色塊的起點」，所以要先找到那一段；
   * 目標軌上還沒選到色塊時退化成保持原本的時間（只換軌道）。
   */
  const targetFor = (alignToSelection) => {
    if (!anchor) return null;

    const timeOffset = (() => {
      if (!alignToSelection) return 0;
      const segments = segmentTable?.[anchor.armorIndex]?.[anchor.partIndex];
      const target = findSegmentById(segments, anchor.segmentId);
      return target ? target.start - clipboard.startTime : 0;
    })();

    return {
      armorIndex: anchor.armorIndex,
      partIndex: anchor.partIndex,
      timeOffset,
      phaseMs,
    };
  };

  /**
   * 把落點寫回光表，並把選取移到貼進去的那些段。
   *
   * ⚠️ **少貼幾條要講出來。** 落點可能整條被丟掉（平移出光表範圍，或落在那位
   * 舞者沒有的部位上——見 `clipboard.js`），而剩下的照樣會貼進去。不講的話
   * 畫面上只是「怎麼少了幾條」，而使用者完全不知道該去哪裡找。
   */
  const applyPlans = (plans, expected = plans.length) => {
    if (plans.length === 0) {
      alert(
        "沒有東西被貼上：落點超出表演長度，或那幾位舞者沒有這些部位。",
      );
      return;
    }
    if (plans.length < expected) {
      alert(
        `有 ${expected - plans.length} 條沒有貼上：落點超出表演長度，` +
          `或那位舞者沒有這個部位（例如把道具的燈貼到沒帶道具的人身上）。`,
      );
    }

    commit(updateParts(segmentTable, plans));
    setIsCopying(false);

    // 貼完就選取貼進去的內容，接著可以直接繼續編輯（例如整組改色）
    dispatch(
      updateMultiSelectedBlocks(
        plans.flatMap(({ armorIndex, partIndex, pasted }) =>
          pasted.map((segment) =>
            makeSelection({ armorIndex, partIndex, segment }),
          ),
        ),
      ),
    );
  };

  /** Ctrl+C：複製選取的區間（可跨軌） */
  const copyRange = () => {
    const packed = anchor && packClipboard(groups, anchor);
    if (!packed) {
      console.warn("請先選取色塊再進行複製。");
      return;
    }

    dispatch(updateClipboard(packed));
    setIsCopying(true); // 進入模式，讓 Timeline 顯示來源標記
  };

  /**
   * 貼到指定的落點 —— **滑鼠預覽按下去時走這條**。
   *
   * 和 Ctrl+V 是同一個 `planPaste`，差別只在「目標從哪裡來」：鍵盤那條路
   * 是目前選取的色塊，滑鼠這條路是游標下面那一列與那個時間。兩條路各算一遍
   * 落點的話遲早會不一致，而不一致的症狀是「預覽畫在 A、貼下去在 B」。
   */
  const pasteAtTarget = (target) => {
    if (!hasContent(clipboard) || !target) return;
    applyPlans(
      planPaste(segmentTable, clipboard, { ...target, phaseMs }),
      clipboard.parts.length,
    );
  };

  /** Ctrl+V：以目標色塊的起點與部位為基準貼上 */
  const pasteAlignedToTarget = () => {
    if (!hasContent(clipboard)) return;
    const target = targetFor(true);
    if (!target) return;
    applyPlans(planPaste(segmentTable, clipboard, target), clipboard.parts.length);
  };

  /** Ctrl+Shift+V：保持原本的時間位置，只換軌道 */
  const pasteAtFixedTime = () => {
    if (!hasContent(clipboard)) return;
    const target = targetFor(false);
    if (!target) return;
    applyPlans(planPaste(segmentTable, clipboard, target), clipboard.parts.length);
  };

  /** Shift+C：把選到的每一條 timeline 整條複製 */
  const copyWholePart = () => {
    if (!anchor) {
      console.warn("請先選取色塊，才知道要複製哪個部位。");
      return;
    }

    // 整條複製：不看選了哪幾段，那一條上的全部都算
    const whole = groups.map(({ armorIndex, partIndex, segments }) => ({
      armorIndex,
      partIndex,
      segments,
      segmentIds: new Set(segments.map((segment) => segment.id)),
    }));

    const packed = packClipboard(whole, anchor);
    if (!packed) {
      console.warn("這個部位沒有任何色塊。");
      return;
    }

    dispatch(updateClipboard(packed));
  };

  /** Shift+V：整條 timeline 覆蓋到目標部位 */
  const pasteWholePart = () => {
    if (!hasContent(clipboard)) {
      console.warn("剪貼簿是空的。");
      return;
    }
    if (!anchor) {
      console.warn("請先選取色塊，才知道要貼到哪個部位。");
      return;
    }

    applyPlans(
      planOverwrite(segmentTable, clipboard, {
        armorIndex: anchor.armorIndex,
        partIndex: anchor.partIndex,
      }),
      clipboard.parts.length,
    );
  };

  /** Esc：離開複製模式 */
  const cancelCopying = () => {
    setIsCopying(false);
    dispatch(updateMultiSelectedBlocks([]));
  };

  return {
    isCopying,
    phaseMs,
    setPhaseMs,
    copyRange,
    pasteAtTarget,
    pasteAlignedToTarget,
    pasteAtFixedTime,
    copyWholePart,
    pasteWholePart,
    cancelCopying,
  };
}

/**
 * 複製模式的提示橫幅，順便放跑馬燈的間隔。
 *
 * ⚠️ 橫幅本身是 `pointer-events: none`（它蓋在畫面上，不該吃任何滑鼠事件），
 * 所以裡面的輸入欄要自己把事件收回來——和光衣卡片的隱藏鈕同一個坑。
 */
export function CopyModeBanner({ isCopying, phaseMs = 0, setPhaseMs }) {
  const clipboard = useSelector((state) => state.profiles.clipboard);

  if (!isCopying) return null;

  const trackCount = clipboard?.parts?.length ?? 0;

  return (
    <div className="copy-mode-banner">
      <span>
        📋 已複製 {clipboard?.startTime}ms ~ {clipboard?.endTime}ms
        {trackCount > 1 ? `（${trackCount} 條軌道）` : ""}
      </span>

      {/*
        跑馬燈：每往下一條軌再往後推這麼多毫秒。只有跨軌的剪貼簿才有意義
        ——一條軌沒有「下一條」，欄位擺著只會讓人以為它壞了。
      */}
      {trackCount > 1 && (
        <label className="copy-mode-banner__phase">
          <span>跑馬燈間隔</span>
          <input
            type="number"
            step={TICK_MS}
            value={phaseMs}
            data-testid="paste-phase"
            onChange={(e) => setPhaseMs?.(Number(e.target.value) || 0)}
          />
          <span>ms{phaseMs ? `（${phaseMs > 0 ? "順" : "逆"}向）` : ""}</span>
        </label>
      )}

      <span className="hint-text">
        移動滑鼠看落點，按左鍵貼上（或選好目標按 [Ctrl+V]），[Esc] 取消
      </span>
    </div>
  );
}
