import React, { useRef, useState, useEffect, createRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  updateMultiSelectedBlocks,
  toggleMoveMode,
  // updateMusicIndex,
} from "../../redux/actions.js";
import "./audioplayer.css";
import Waveform from "./waveform.jsx";
import Playlist, { ClipMarkers } from "./Playlist.jsx";
import BeatGrid from "./BeatGrid.jsx";
import PlayerControls from "./PlayerControls.jsx";
import { useTimeShift, ShiftToolButton, ShiftMarkers } from "./ShiftTool.jsx";
import EffectMenu, { useLightEffects } from "./EffectMenu.jsx";
import { useCopyPaste, CopyModeBanner } from "./CopyPasteManager.jsx";
import {
  useTrackActions,
  TrackNavigation,
  TrackEditButtons,
  UniformAlphaMenu,
} from "./TrackToolbar.jsx";
import Timeline from "./Timeline.jsx";
import TimeRuler from "./TimeRuler.jsx";
import { MarqueeBox, useMarqueeSelect } from "./MarqueeSelect.jsx";
import { PasteGhosts, usePastePreview } from "./PastePreview.jsx";
import { updateChosenColor, updateCurrentTime } from "../../redux/actions.js";
import { TICK_MS } from "../../constants/time.js";
import {
  insertColorSegment,
  cloneColor,
  sameColor,
} from "../../utils/segments/color.js";
import { mapSelectedParts, updateParts } from "../../utils/segments/table.js";
import { groupSelectionsByPart } from "../../utils/selection.js";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts.js";
import { useDeselectOnOutsideClick } from "../../hooks/useDeselectOnOutsideClick.js";
import { useAudioEngine } from "../../hooks/useAudioEngine.js";
import { useSegmentActionTable } from "../../hooks/useSegmentActionTable.js";
import { useActiveTracks } from "../../hooks/useWorksets.js";
import { FAVORITE_SLOTS, favoriteColorAt } from "../../utils/palette.js";
import { trackHeight } from "../../utils/tracks.js";

/**
 * 最愛色的快捷鍵：`1` ~ `FAVORITE_SLOTS`。
 *
 * 兩種寫法都要——沒按 Shift 時比對 `event.key`（就是數字），按著 Shift 時
 * 數字鍵的 `key` 會變成符號（Shift+1 → `!`），只有 `event.code` 還看得出來
 * 按的是哪個鍵。格數超過 9 的話這裡要改寫（單一字元的字元類別放不下）。
 */
const DIGIT_KEYS = Array.from({ length: FAVORITE_SLOTS }, (_, i) =>
  String(i + 1),
);
const DIGIT_CODES = new RegExp(`^Digit[1-${FAVORITE_SLOTS}]$`);

function AudioPlayer({ setButtonState, timelineRef }) {
  const dispatch = useDispatch();
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration); // 音樂總長度
  const { segmentTable, commit } = useSegmentActionTable();
  // 目前這一組工作集的軌道。切換工作集時整份換掉，Timeline 跟著重建
  const showPart = useActiveTracks();
  const rowHeight = useSelector((state) => state.profiles.rowHeight);
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const favoriteColor = useSelector((state) => state.profiles.favoriteColor);
  const isColorChangeActive = useSelector(
    (state) => state.profiles.isColorChangeActive,
  );
  const multiSelectedBlocks = useSelector(
    (state) => state.profiles.multiSelectedBlocks,
  );

  const scrollRef = useRef(null); // 滾動條的容器
  const containerRef = useRef(null); // 波形的容器
  const [volume, setVolume] = useState(0.5); // 音量
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // 放大級別
  const progressFlagRef = useRef(null); // P0: 進度條 DOM ref，60fps 直接操作
  const elRefs = useRef([]);
  const marqueeBoxRef = useRef(null); // 框選的矩形，手勢期間直接改它的 style
  const pasteGhostsRef = useRef([]);  // 貼上落點的預覽框，同樣直接改 style

  const playbackRate = useSelector((state) => state.profiles.playbackRate);

  /*
   * 播放引擎 —— 所有 Web Audio 的狀態都在裡面（見 utils/audio/engine.js）。
   *
   * 先前這些狀態切成三份：`sourceNode` 在這裡、`startTime` 在 waveform、
   * 真正的時鐘在 AudioContext。後果是暫停時有兩個 effect 都會寫 currentTime，
   * 而 seek 修正之所以有效靠的是它宣告在後面。
   */
  const audio = useAudioEngine({
    volume,
    rate: playbackRate,
    onEnded: () => setIsPlaying(false),
  });

  const effects = useLightEffects(); // 漸變/頻閃/亮度階梯：選單與快捷鍵共用
  const shift = useTimeShift(); // 區間平移：按鈕與時間軸標記共用同一份狀態
  const trackActions = useTrackActions(); // 剪下/刪除/導航/亮度/改色：工具列與快捷鍵共用
  const copyPaste = useCopyPaste(); // 複製貼上與複製模式

  useEffect(() => {
    setButtonState(isPlaying);
  }, [isPlaying, setButtonState]);

  useEffect(() => {
    console.log("multiSelectedBlocks for debugging:", multiSelectedBlocks);
  }, [multiSelectedBlocks]);

  useEffect(() => {
    elRefs.current = showPart.map((_, i) => elRefs.current[i] || createRef());
  }, [showPart]);

  /**
   * 把一個顏色套到所有選取的色塊上。
   *
   * 調色盤與最愛色（1~8）走的是同一件事，所以只留這一份。
   *
   * 兩個細節：
   *
   * 固定色的 `colorEnd` 要跟著改，否則之後切成漸變時會漸變到一個使用者從沒
   * 指定過的舊顏色；漸變段則只改起始色，維持「改的是這一段的顏色」的語意。
   *
   * 沒有任何一段真的變色時要回傳**原本那張表**。調色盤的 effect 會在
   * `segmentTable` 變動後再跑一次，每次都給新陣列的話會不斷推進 history，
   * 使用者按 Ctrl+Z 要按很多次才回得去。
   */
  const applyColorToSelection = (color) => {
    if (!color) return;

    const nextTable = mapSelectedParts(
      segmentTable,
      groupSelectionsByPart(multiSelectedBlocks),
      (segments, ids) => {
        let changed = false;

        const next = segments.map((segment) => {
          if (!ids.has(segment.id)) return segment;

          const value = cloneColor(color);
          const keepEnd = segment.linear === 1;
          // 已經是這個顏色就原樣回傳。少了這道判斷，下面的 effect 會在自己
          // 寫入之後再跑一次、再產生一份新陣列，然後無限迴圈。
          if (
            sameColor(segment.colorStart, value) &&
            (keepEnd || sameColor(segment.colorEnd, value))
          ) {
            return segment;
          }

          changed = true;
          return {
            ...segment,
            colorStart: value,
            colorEnd: keepEnd ? segment.colorEnd : value,
          };
        });

        return changed ? next : segments;
      },
    );

    commit(nextTable); // 相同 reference 時 commit 自己會短路
  };

  useEffect(() => {
    if (isColorChangeActive && multiSelectedBlocks.length > 0 && chosenColor) {
      applyColorToSelection(chosenColor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isColorChangeActive, chosenColor, multiSelectedBlocks, segmentTable]);

  // P0: 進度條改由 waveform.jsx 的 rAF 透過 onTimeUpdate callback 直接操作 DOM（60fps）
  // 移除了 setProgressWidth 的 useEffect，避免播放期間不必要的 re-render

  const handleFavoriteColorInsert = (colorIndex) => {
    const color = favoriteColorAt(favoriteColor, colorIndex);
    if (!color) return;
    insertFavoriteColorArray(color);
  };

  /**
   * 在播放位置放一個最愛色的色塊（放在目前選取所在的那條時間軸上）。
   *
   * 舊版走 `insertColorKeyframes`，要判斷前後鄰居是不是黑的來決定補幾個哨兵，
   * 還得守著「時間太靠近 0 就不插入」——因為哨兵在色塊前 10ms，會落到負時間。
   * segment 模型沒有哨兵也就沒有這個限制，時間 0 一樣放得下去。
   */
  const insertFavoriteColorArray = (color) => {
    const groups = groupSelectionsByPart(multiSelectedBlocks);
    if (groups.length === 0) {
      console.warn("No block selected.");
      return;
    }

    // 將時間 floor 到最近的一個 tick
    const nowTime = Math.floor(currentTime / TICK_MS) * TICK_MS;
    dispatch(updateCurrentTime(nowTime));

    /*
     * 選到幾條就放幾條。選取跨軌時「在播放頭上放一個色塊」的意思是
     * 那幾條各放一個——七位舞者同時亮起來正是這個功能存在的理由，
     * 一條一條放要按七次而且每次都得先點對軌道。
     */
    const updates = groups.map(({ armorIndex, partIndex }) => ({
      armorIndex,
      partIndex,
      segments: insertColorSegment(
        segmentTable?.[armorIndex]?.[partIndex] ?? [],
        { time: nowTime, color, duration },
      ),
    }));

    commit(updateParts(segmentTable, updates));
  };

  /** 播放 / 暫停。真正的動作由下面那個 effect 做（見它的說明） */
  const handlePlayPause = () => setIsPlaying((playing) => !playing);

  /*
   * `isPlaying` 一變就驅動引擎。
   *
   * ⚠️ **不要只在 `handlePlayPause` 裡叫引擎。** 設定 `isPlaying` 的地方不只
   * 一個：播放鍵自己 `setIsPlaying(p => !p)`、空白鍵走 handlePlayPause、
   * 整場播完由引擎回呼設 false。只掛在其中一條路徑上的話，按鈕會變成「畫面
   * 切成暫停圖示但音樂照播」——實測就是這樣（e2e 的倍速那一項位置完全不動）。
   *
   * 起點取 Redux 的 `currentTime` 而不是引擎自己記的位置：方向鍵、W/S/A/D、
   * 點色塊等等都會直接改 `currentTime` 卻不經過引擎。**「要從哪裡開始」的
   * 真相在 Redux，「正在播到哪」的真相在引擎**——這個分工是刻意的。
   */
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (isPlaying) audio.play(currentTimeRef.current);
    else audio.pause();
  }, [isPlaying, audio]);

  /** 1~6：把最愛色套到選取的色塊上（空的那格不做事） */
  const handleFavoriteColorChoose = (index) => {
    const newColor = favoriteColorAt(favoriteColor, index);
    if (!newColor) return; // 那一格還沒存過顏色
    applyColorToSelection(newColor);
  };

  /**
   * 跳到指定時間。
   *
   * 引擎負責「音樂跳到哪」，Redux 的 `currentTime` 負責「畫面顯示在哪」，
   * 兩邊都要更新。播放中 seek 會讓引擎整批重排（見 engine.js），暫停中則
   * 只是記住位置。
   *
   * 舊版這裡有一整段「停掉 sourceNode、清掉 onended、設成 null」的處理，
   * 加上一個 `pendingSeekRef` 旗標告訴 waveform「這次是 seek 不是暫停」——
   * 因為當時位置分散在三個地方，seek 必須手動去每個地方打斷連鎖。
   * 位置收進引擎之後那些全部不需要了。
   */
  const seekTo = (timeMs) => {
    const aligned = Math.round(timeMs / TICK_MS) * TICK_MS;
    audio.seek(aligned);
    dispatch(updateCurrentTime(aligned));
  };

  /**
   * 編輯器的鍵盤配置。
   *
   * ⚠️ **`Shift+←/→` 是刻意保留的重疊鍵位**：兩條綁定都會執行，先 ±50ms
   * 再跳到上/下個關鍵格（後者覆蓋前者）。沒有選取色塊時 `goToNextPoint`
   * 會直接 return，於是退化成 ±50ms —— 這個 fallback 蠻好用，所以留著。
   * `updateCurrentTime` 不進 undo history，不會有副作用。
   *
   * （`Ctrl+1~8` 原本也有同樣的重疊，但那組會產生兩筆 history、
   * 讓一次 Ctrl+Z 停在使用者沒看過的中間狀態，已加 `ctrl: false` 修掉。）
   */
  const shortcuts = [
    // 複製模式
    {
      key: "Escape",
      when: () => copyPaste.isCopying,
      stopPropagation: true,
      handler: copyPaste.cancelCopying,
    },
    { key: "c", ctrl: true, handler: copyPaste.copyRange },
    {
      key: "v",
      ctrl: true,
      shift: false,
      handler: copyPaste.pasteAlignedToTarget,
    },
    { key: "v", ctrl: true, shift: true, handler: copyPaste.pasteAtFixedTime },
    { key: "c", ctrl: false, shift: true, handler: copyPaste.copyWholePart },
    { key: "v", ctrl: false, shift: true, handler: copyPaste.pasteWholePart },

    // 播放位置
    {
      key: "ArrowRight",
      handler: () =>
        dispatch(
          updateCurrentTime(
            Math.min(
              currentTime + TICK_MS,
              Math.floor(duration / TICK_MS) * TICK_MS,
            ),
          ),
        ),
    },
    {
      key: "ArrowLeft",
      handler: () =>
        dispatch(updateCurrentTime(Math.max(currentTime - TICK_MS, 0))),
    },
    { key: "ArrowRight", shift: true, handler: trackActions.goToNextPoint },
    { key: "ArrowLeft", shift: true, handler: trackActions.goToPreviousPoint },

    // 編輯
    { key: "m", handler: () => dispatch(toggleMoveMode()) },
    { key: "p", handler: trackActions.openColorPicker },
    { key: "c", ctrl: false, shift: false, handler: trackActions.cutSelected },
    {
      key: ["Delete", "Backspace"],
      // 原本分成「多選 → handleMultiDelete」與「單選 → ClickedDelete」兩條，
      // 但 ClickedDelete 只是「有選取才呼叫 handleMultiDelete」，兩條同義
      handler: trackActions.deleteSelected,
    },
    { key: " ", handler: handlePlayPause },

    // 效果
    { key: "l", handler: effects.toggleLinear },
    { key: "b", handler: effects.promptBlink },

    // 最愛顏色與透明度
    {
      /*
       * 數字鍵對應調色盤上的六格。
       *
       * 由 FAVORITE_SLOTS 推導而不是寫死 1~8：色票從 4×2 收成一列六格之後，
       * 7 與 8 仍然綁著，而舊的二維換算會讓它們**繞回第 1、2 格**——按 7
       * 套到的是第 1 格的顏色，畫面上沒有任何東西顯示這件事。
       */
      key: DIGIT_KEYS,
      // ctrl: false 是必要的守衛：沒有它，Ctrl+1 會同時打中這條和下面的透明度，
      // 兩個 handler 從同一份 actionTable 快照各自 produce 再 dispatch，
      // 結果是套色被蓋掉、卻多留一筆 history（一次 Ctrl+Z 復原不完）。
      ctrl: false,
      handler: (event) => handleFavoriteColorChoose(parseInt(event.key) - 1),
    },
    {
      key: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      ctrl: true,
      handler: (event) =>
        trackActions.changeBrightness(parseInt(event.key) / 10),
    },
    // Ctrl+0 補完 Ctrl+1~9 的 10%~90%，所以是 100%（不是 0%）
    { key: "0", ctrl: true, handler: () => trackActions.changeBrightness(1) },
    {
      // 按住 Shift 時數字鍵的 event.key 會是符號（Shift+1 → "!"），只能用 code 比對
      code: DIGIT_CODES,
      shift: true,
      ctrl: false,
      handler: (event) =>
        handleFavoriteColorInsert(
          parseInt(event.code.slice("Digit".length), 10) - 1,
        ),
    },
  ];

  useKeyboardShortcuts(shortcuts);

  // 點到色塊以外就取消選取。掛在這裡而不是每條 Timeline 各掛一份——
  // 清空的是全域選取，跟 listener 掛在誰身上無關（先前是 154 份相同的副本）
  useDeselectOnOutsideClick();

  // 框選：從空隙（或按住 Alt 從任何地方）拉一個矩形，選取跨軌的多個色塊
  useMarqueeSelect({
    containerRef: timelineRef,
    boxRef: marqueeBoxRef,
    tracks: showPart,
  });

  /*
   * 複製模式的滑鼠預覽：游標指到哪就把落點畫在哪，按下去就貼。
   *
   * 舊流程是「先點一個目標色塊選起來，再按 Ctrl+V」——想貼到空白處沒有東西
   * 可以點，而且按下去之前完全看不到會貼到哪（剪貼簿跨軌之後更明顯）。
   */
  usePastePreview({
    containerRef: timelineRef,
    ghostsRef: pasteGhostsRef,
    tracks: showPart,
    isCopying: copyPaste.isCopying,
    phaseMs: copyPaste.phaseMs,
    onPasteAt: copyPaste.pasteAtTarget,
  });

  const listitem = showPart.map((setting, index) => (
    <Timeline
      key={setting.id}
      armorIndex={setting.armorIndex}
      partIndex={setting.partIndex}
      ref={elRefs.current[index]}
      height={trackHeight(setting, rowHeight)}
      isCopying={copyPaste.isCopying}
      // 換軌拖曳的落點是在**可見軌道清單**上算的（拖到眼睛看到的那一列），
      // 所以每條軌要知道自己是第幾列、清單長什麼樣
      tracks={showPart}
      rowIndex={index}
    />
  ));

  return (
    <div className="audio-player-container">
      <CopyModeBanner
        isCopying={copyPaste.isCopying}
        phaseMs={copyPaste.phaseMs}
        setPhaseMs={copyPaste.setPhaseMs}
      />
      {/*
        工具列分成五組，中間用分隔線隔開：音樂 / 導航 / 編輯 / 效果 / 播放。

        改之前是 14 顆圖示平鋪、沒有分組也沒有分隔線，剪刀、垃圾桶、調色盤、
        魔杖的視覺權重完全相同，只能一顆一顆 hover 過去猜。光是把間距拉開
        並補上分隔線，同一批按鈕就會變成五個讀得出來的區塊。

        順序照排燈的動作流程：先選歌 → 找到位置 → 編輯色塊 → 套效果 → 播來聽。
      */}
      <div className="controls">
        <div className="tool-group">
          <Playlist
            onListChange={() => {
              // 動歌單時停止播放：已排好的 clip 是用舊清單算的，繼續播會聽到
              // 剛刪掉的那一首（排程一次排完整場，見 utils/audio/engine.js）
              if (isPlaying) setIsPlaying(false);
            }}
          />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <TrackNavigation actions={trackActions} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <TrackEditButtons actions={trackActions} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <EffectMenu effects={effects} />
          <ShiftToolButton shift={shift} />
          <UniformAlphaMenu actions={trackActions} />
        </div>
        {/*
          播放控制不掛分隔線：它靠 `margin-left: auto` 被推到最右邊，那段自動
          留白本身就是分隔。窄視窗下它會換到第二行，這時分隔線會變成第一行
          末端一條懸空的短線（實測 1280 下就是這樣）——留白換行之後仍然成立，
          線不會。
        */}
        <div className="tool-group tool-group--transport">
          <PlayerControls
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
            volume={volume}
            setVolume={setVolume}
          />
        </div>
      </div>
      <div className="scroll-container" ref={scrollRef}>
        <div
          className="main-controlPanel"
          style={{
            width: `${100 * zoomLevel}%`, // 根据 zoomValue 动态调整容器宽度
          }}
        >
          {/* 節拍格線墊在最底下：它是參考線，不能蓋住色塊也不能吃滑鼠事件 */}
          <BeatGrid />
          <TimeRuler onSeek={seekTo} />
          {/* 每首歌從哪裡開始。只有兩首以上才畫得出東西 */}
          <ClipMarkers />
          <ShiftMarkers shift={shift} />
          {/* 快捷鍵統一由 useKeyboardShortcuts 掛在 document 上，
              這裡不再重複註冊 onKeyDown（原本同一個 handler 綁了兩次） */}
          <div className="timeline-container" ref={timelineRef}>
            {listitem}
            {/* 框選的矩形。常駐但預設隱藏，手勢期間只改它的 style —— 這個容器是
                154 條 Timeline 的祖先，每格像素都 setState 會讓它們全部重算 */}
            <MarqueeBox boxRef={marqueeBoxRef} />
            {/* 貼上的落點預覽。只有複製模式才 render——常駐的話 154 條
                Timeline 上面會多蓋一層什麼都不做的節點 */}
            <PasteGhosts
              ghostsRef={pasteGhostsRef}
              isCopying={copyPaste.isCopying}
            />
          </div>
          <div className="waveform-container" ref={containerRef}>
            {/* 波形顯示區域 */}
            <Waveform
              engine={audio}
              isPlaying={isPlaying}
              scrollRef={scrollRef}
              onSeek={seekTo}
              zoomValue={zoomLevel}
              containerRef={containerRef}
              onTimeUpdate={(elapsed) => {
                if (progressFlagRef.current && duration > 0) {
                  progressFlagRef.current.style.left = `${(elapsed / duration) * 100}%`;
                }
              }}
            />
          </div>
        </div>
      </div>
      <div
        ref={progressFlagRef}
        className="progress-flag"
        style={{
          left: "0%", // 初始位置，播放時由 rAF callback 直接操作 DOM（60fps）
        }}
      ></div>

      {/* 放大/縮小滑桿 */}
    </div>
  );
}

export default AudioPlayer;
