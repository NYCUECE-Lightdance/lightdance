import { useState } from "react";
import { useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";

import { useSegmentActionTable } from "../../hooks/useSegmentActionTable.js";
import { TICK_MS } from "../../constants/time.js";
import {
  resolveSelections,
  groupSelectionsByPart,
} from "../../utils/selection.js";
import {
  mapSelectedParts,
  partsOfSelection,
  updateParts,
} from "../../utils/segments/table.js";
import {
  alignStarts,
  distributeEvenly,
  earliestStart,
  matchLengths,
} from "../../utils/segments/arrange.js";
import { cloneColor, BLACK } from "../../utils/segments/color.js";
import {
  MIN_BLINK_PERIOD_MS,
  blinkPeriodOf,
  makeBlink,
  withoutEffect,
} from "../../utils/segments/effects.js";

/**
 * 效果選單：三種套用在選取色塊上的效果。
 *
 * | 效果 | 作用 |
 * |---|---|
 * | 漸變 (L) | 切換色塊的 `linear`，讓它在段內從 colorStart 漸變到 colorEnd |
 * | 頻閃 (B) | 在色塊上記一個閃爍週期（metadata，不切色塊） |
 * | 亮度階梯 | 從選取的色塊往後，把連續色塊的透明度做成階梯 |
 *
 * 邏輯放在 `useLightEffects()`，因為 L / B 也有鍵盤快捷鍵——外殼呼叫一次 hook，
 * 鍵盤與選單共用同一組函式。
 *
 * ## Phase 5d：改成 segment 原生
 *
 * 這三個效果原本都透過遷移期的 keyframe 轉接橋，在壓平出來的關鍵格陣列上
 * 用陣列索引操作。三個都因此帶著黑色哨兵的假設：
 *
 * - 頻閃每個週期都要自己補一個「結束前 10ms 的純黑關鍵格」
 * - 亮度階梯原本寫死 `index + step * 2`（假設每個色塊後面都跟著一個
 *   黑哨兵），色塊緊鄰時會跳過一整塊
 * - 漸變只能切旗標，「漸變到什麼顏色」得靠往後找下一個非黑關鍵格
 *
 * segment 模型裡這些都消失了：熄滅就是段與段之間的空隙，「下一個色塊」就是
 * 陣列的下一格，漸變的終點色記在段自己的 `colorEnd` 上。
 */

export function useLightEffects() {
  const { segmentTable, commit, commitPart } = useSegmentActionTable();
  const multiSelectedBlocks = useSelector(
    (state) => state.profiles.multiSelectedBlocks,
  );

  /**
   * 選取涵蓋的每一條時間軸。漸變與頻閃都是**逐段**的效果，所以選到幾條就
   * 套幾條——先前它們只看 `multiSelectedBlocks[0]` 所在的那一條，框選了
   * 七位舞者之後按 L 只有第一位會變，而且沒有任何提示。
   */
  const groups = groupSelectionsByPart(multiSelectedBlocks);

  /** 錨點那一條：亮度階梯要「從這一段往後數」，只有單選時才成立 */
  const activePart = multiSelectedBlocks[0] ?? null;

  const activeSegments = activePart
    ? (segmentTable?.[activePart.armorIndex]?.[activePart.partIndex] ?? [])
    : [];

  /** 錨點那一條上被選中的 segment（濾掉已經不存在的，例如剛被 undo 掉） */
  const selected = resolveSelections(multiSelectedBlocks, activeSegments);

  /** 寫回錨點那一條（只有亮度階梯用得到） */
  const commitActive = (nextSegments) =>
    commitPart(activePart.armorIndex, activePart.partIndex, nextSegments);

  /**
   * 漸變：切換選取色塊的 `linear`。
   *
   * 開啟漸變時要決定「漸變到什麼顏色」。舊模型只有一個旗標，實際的終點色是
   * 渲染時往後找下一個非黑關鍵格推出來的；segment 模型把它記在段自己身上，
   * 所以這裡要明確算出來：
   *
   * - 後面緊接著另一個色塊 → 漸變到它的起始色（接得上，視覺與舊版一致）
   * - 後面是空隙或已經是最後一段 → 漸變到黑（fade out）
   *
   * 關掉漸變則把 `colorEnd` 收回成 `colorStart`，變回單純的固定色。
   */
  const toggleLinear = () => {
    if (groups.length === 0) return;

    /*
     * 「漸變到什麼顏色」是**逐條各自算的**：同一個樂句在七位舞者身上，
     * 後面接的下一段顏色可能各不相同。所以這段邏輯留在 fn 裡跑七次，
     * 而不是拿第一條算出來的終點色套到所有人身上。
     */
    const nextTable = mapSelectedParts(segmentTable, groups, (segments, ids) => {
      let changed = false;

      const next = segments.map((segment, index) => {
        if (!ids.has(segment.id)) return segment;
        changed = true;

        const turningOn = segment.linear !== 1;
        if (!turningOn) {
          return {
            ...segment,
            linear: 0,
            colorEnd: cloneColor(segment.colorStart),
          };
        }

        const following = segments[index + 1];
        // 只有「首尾相接」才算接得上；中間有空隙的話中途本來就會熄滅
        const touching = following && following.start === segment.end;
        return {
          ...segment,
          linear: 1,
          colorEnd: cloneColor(touching ? following.colorStart : BLACK),
        };
      });

      return changed ? next : segments;
    });

    commit(nextTable);
  };

  /**
   * 頻閃：在選取的色塊上記一個 `effect: {type:'blink', period}`。
   *
   * **不切色塊。** 舊版是破壞性的——套下去之後那個色塊就被換成 N 個小色塊，
   * 於是想整段挪半拍要把 N 個全部選起來（而且它們之間有空隙，連選會斷）、
   * 想把間隔從 250 改成 200 只能刪掉重放、想改顏色要逐塊改。
   * 現在畫面上還是一個可拖曳、可 resize、可改色的色塊，展開只發生在壓平輸出
   * 與播放預覽（見 `utils/segments/effects.js`）。
   *
   * `period` 傳 0 就是取消頻閃。
   */
  const applyBlink = (periodInput) => {
    if (groups.length === 0) {
      alert("請先選取色塊，再套用頻閃。");
      return;
    }

    // 0 = 取消。放在解析之前，因為 0 過不了 makeBlink 的最小週期檢查
    const wantsClear = parseInt(periodInput, 10) === 0;
    const effect = wantsClear ? null : makeBlink(periodInput);

    if (!wantsClear && !effect) {
      alert(
        `頻閃間隔必須是 ${TICK_MS} 的倍數，且至少 ${MIN_BLINK_PERIOD_MS}ms` +
          `（一個週期要有亮的一段和滅的一格）。輸入 0 可以取消頻閃。`,
      );
      return;
    }

    /*
     * 可以一次套到多個色塊——metadata 不像切色塊那樣依賴「選取的是哪一個」，
     * 所以框選一整段之後可以整批套。裝不下一個完整週期的色塊會被跳過而不是
     * 讓整個操作失敗，否則框選裡混到一個短色塊就什麼都做不了。
     */
    let changed = 0;
    let skipped = 0;

    const nextTable = mapSelectedParts(segmentTable, groups, (segments, ids) => {
      let partChanged = false;

      const next = segments.map((segment) => {
        if (!ids.has(segment.id)) return segment;

        if (wantsClear) {
          if (!segment.effect) return segment;
          changed++;
          partChanged = true;
          return withoutEffect(segment);
        }

        if (segment.end - segment.start < effect.period) {
          skipped++;
          return segment;
        }
        if (blinkPeriodOf(segment) === effect.period) return segment;

        changed++;
        partChanged = true;
        return { ...segment, effect };
      });

      return partChanged ? next : segments;
    });

    if (!changed) {
      alert(
        skipped
          ? "選取的色塊比一個頻閃週期還短，請選長一點的色塊或縮小間隔。"
          : "沒有東西需要變更。",
      );
      return;
    }
    commit(nextTable);
  };

  /**
   * 亮度階梯：從選取的色塊開始往後，把連續色塊的透明度依 start → end 逐階套用。
   *
   * @returns {boolean} 是否真的套用了（沒有恰好選一個色塊時回傳 false，讓面板留著）
   */
  const applyBrightnessLadder = (startPercent, stepPercent, endPercent) => {
    // 刻意維持「恰好一個」：階梯是「從這一段開始往後逐段遞增」，
    // 起點必須是唯一的，否則「往後」從哪裡算起沒有定義
    if (selected.length !== 1 || multiSelectedBlocks.length !== 1) {
      // 原本只 console.warn，使用者按下 Apply 會完全沒有反應——改成看得見的提示
      alert("請先選取「一個」色塊，再套用亮度階梯。");
      return false;
    }
    if (stepPercent <= 0) {
      alert("每階的變化量必須大於 0。");
      return false;
    }

    const startIndex = activeSegments.indexOf(selected[0].segment);
    const ascending = endPercent > startPercent;
    let current = startPercent;

    const next = activeSegments.map((segment, index) => {
      if (index < startIndex) return segment;
      const withinRange = ascending
        ? current <= endPercent
        : current >= endPercent;
      if (!withinRange) return segment;

      const alpha = current / 100;
      current += ascending ? stepPercent : -stepPercent;
      return {
        ...segment,
        colorStart: { ...segment.colorStart, A: alpha },
        colorEnd: { ...segment.colorEnd, A: alpha },
      };
    });

    commitActive(next);
    return true;
  };

  /**
   * 頻閃的輸入框 —— **B 鍵與效果選單共用這一份**。
   *
   * 先前兩邊各寫一份，於是「選幾個色塊才能套」「提示文字寫什麼」在兩條路徑上
   * 悄悄地不一樣（鍵盤那份還卡著舊的「只能選一個」限制）。放進 hook 裡就只有
   * 一種行為要維護——這是這個專案處理「按鈕與快捷鍵做同一件事」的既定做法。
   *
   * 預設值填**目前選取色塊的週期**（沒有頻閃時填 100）。頻閃現在是可以改的
   * metadata，所以「調整間隔」是常見動作——把現值放進輸入框，使用者才知道
   * 自己現在是多少，而不是每次都從 100 重猜。
   */
  const promptBlink = () => {
    if (selected.length === 0) {
      alert("請先選取色塊，再套用頻閃。");
      return;
    }
    const current = blinkPeriodOf(selected[0].segment);
    const userInput = window.prompt(
      `請輸入頻閃間隔 (ms)，必須為 ${TICK_MS} 的倍數。輸入 0 取消頻閃：`,
      String(current ?? 100),
    );
    if (userInput !== null) applyBlink(userInput);
  };

  /**
   * 對齊與分佈 —— 幾何運算在 `utils/segments/arrange.js`，這裡只負責
   * 「基準值從哪來」與「哪幾條沒做要講出來」。
   *
   * 基準一律取**選取範圍裡最早的那一段**：對齊到最早的起點、長度取它的長度。
   * 用「第一筆選取」當基準的話，同一批選取會因為使用者從哪個角落開始框而得到
   * 不同結果——而畫面上看不出基準換了。
   */
  const arrangeSelection = (kind) => {
    // `groups` 是上面就算好的那一份，不要再分一次組
    const withSegments = partsOfSelection(segmentTable, groups).filter(
      (group) => group.segmentIds.size > 0,
    );
    if (withSegments.length === 0) {
      alert("請先選取色塊。");
      return;
    }

    const result = (() => {
      if (kind === "align") {
        const time = earliestStart(withSegments);
        return time === null ? null : alignStarts(withSegments, time);
      }
      if (kind === "length") {
        // 最早那一段的長度當基準（和對齊用同一個「最早」，一致好解釋）
        const earliest = withSegments
          .flatMap(({ segments, segmentIds }) =>
            segments.filter((segment) => segmentIds.has(segment.id)),
          )
          .sort((a, b) => a.start - b.start)[0];
        return earliest
          ? matchLengths(withSegments, earliest.end - earliest.start)
          : null;
      }
      return distributeEvenly(withSegments);
    })();

    if (!result) return;

    commit(updateParts(segmentTable, result.updates));

    /*
     * 沒做到的那幾條要講出來。靜靜跳過的話使用者只會看到「怎麼有幾條沒對齊」，
     * 而原因（同一條軌上選了兩段、或分佈時不足三段）從畫面上看不出來。
     */
    if (result.skipped.length > 0) {
      const why =
        kind === "distribute"
          ? "那幾條軌上選到的色塊少於三個，沒有中間可以攤"
          : "那幾條軌上有兩個以上的選取會疊在一起";
      alert(`有 ${result.skipped.length} 條軌沒有處理：${why}。`);
    }
  };

  return {
    toggleLinear,
    applyBlink,
    applyBrightnessLadder,
    promptBlink,
    arrangeSelection,
  };
}

/** 百分比選項：10%、20%、…、100% */
const PERCENT_OPTIONS = [...Array(10)].map((_, i) => (i + 1) * 10);

function EffectMenu({ effects }) {
  const { toggleLinear, applyBrightnessLadder, promptBlink, arrangeSelection } =
    effects;

  const [menuVisible, setMenuVisible] = useState(false);
  const [ladderVisible, setLadderVisible] = useState(false);

  // 亮度階梯的設定：從 startPercent 每次加減 stepPercent 直到 endPercent
  const [startPercent, setStartPercent] = useState(10);
  const [stepPercent, setStepPercent] = useState(10);
  const [endPercent, setEndPercent] = useState(100);

  const closeAll = () => {
    setMenuVisible(false);
    setLadderVisible(false);
  };

  const toggleMenu = () => {
    setMenuVisible((visible) => !visible);
    // 收起選單時一併隱藏設定面板
    if (menuVisible) setLadderVisible(false);
  };

  const openBlinkPrompt = () => {
    promptBlink();
    setMenuVisible(false);
  };

  return (
    <div className="effect-wrapper">
      <button className="effect-button" onClick={toggleMenu}>
        <FontAwesomeIcon icon={faWandMagicSparkles} size="lg" />
        <span className="tooltip">特效</span>
      </button>

      {/* 一級選單 */}
      {menuVisible && (
        <div className="effect-menu">
          <div
            className="effect-menu-item"
            onClick={() => {
              toggleLinear();
              setMenuVisible(false);
            }}
          >
            漸變 (L)
          </div>

          <div className="effect-menu-item" onClick={openBlinkPrompt}>
            頻閃 (B)
          </div>

          {/* 亮度階梯：從選取的色塊往後，把連續色塊的透明度做成階梯 */}
          <div
            className="effect-menu-item"
            onClick={() => setLadderVisible(true)}
          >
            亮度階梯
          </div>

          {/*
            排列：純幾何的整理，用拖曳做得到但做不準——拖曳吃 50ms 網格，
            肉眼對齊七條軌的起點要一條一條放大再微調。
          */}
          <div className="effect-menu-sep" />

          <div
            className="effect-menu-item"
            data-testid="arrange-align"
            onClick={() => {
              arrangeSelection("align");
              setMenuVisible(false);
            }}
          >
            起點對齊
          </div>

          <div
            className="effect-menu-item"
            data-testid="arrange-length"
            onClick={() => {
              arrangeSelection("length");
              setMenuVisible(false);
            }}
          >
            長度統一
          </div>

          <div
            className="effect-menu-item"
            data-testid="arrange-distribute"
            onClick={() => {
              arrangeSelection("distribute");
              setMenuVisible(false);
            }}
          >
            平均分佈
          </div>
        </div>
      )}

      {/* 二級設定 panel */}
      {ladderVisible && (
        <div className="gradient-settings-popup">
          <label>起始亮度：</label>
          <PercentSelect value={startPercent} onChange={setStartPercent} />

          {/* 每一階的亮度增量 */}
          <label>間隔：</label>
          <select
            className="dropdown-select"
            value={stepPercent}
            onChange={(e) => setStepPercent(Number(e.target.value))}
          >
            {[10, 20].map((v) => (
              <option key={v} value={v}>
                {v} %
              </option>
            ))}
          </select>

          <label>結束亮度：</label>
          <PercentSelect value={endPercent} onChange={setEndPercent} />

          <div className="gradient-settings-actions">
            <button
              onClick={() => {
                // 沒有恰好選一個色塊：留著面板讓使用者去選
                if (
                  !applyBrightnessLadder(startPercent, stepPercent, endPercent)
                )
                  return;
                closeAll();
              }}
            >
              Apply
            </button>
            <button onClick={closeAll}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PercentSelect({ value, onChange }) {
  return (
    <select
      className="dropdown-select"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {PERCENT_OPTIONS.map((v) => (
        <option key={v} value={v}>
          {v}%
        </option>
      ))}
    </select>
  );
}

export default EffectMenu;
