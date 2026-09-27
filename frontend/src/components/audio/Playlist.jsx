import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMusic } from "@fortawesome/free-solid-svg-icons";

import { API_ENDPOINTS } from "../../config/api.js";
import { useAudioClips } from "../../hooks/useAudioClips.js";
import {
  updateAudioClips,
  updateAudioOverlap,
} from "../../redux/actions.js";
import {
  MAX_OVERLAP_MS,
  addClip,
  createClip,
  moveClip,
  removeClip,
  renameClip,
  setClipTempo,
} from "../../utils/audio/clips.js";
import { MAX_BPM, MIN_BPM } from "../../utils/audio/tempo.js";
import { TICK_MS } from "../../constants/time.js";
import "./Playlist.css";

/**
 * 播放清單：一場表演接續播放的那幾首歌。
 *
 * ## 為什麼是可收合的
 *
 * 一場表演有五、六首歌，但**排燈的時候幾乎不會動到歌單**——它是開場設定好、
 * 之後整晚都不碰的東西。工具列上那一排是每分鐘都在按的按鈕，把六列歌單常駐在
 * 那裡等於用最貴的版面放最少用的功能。所以收起來只佔一顆按鈕，展開才是完整清單。
 *
 * 收起的狀態仍然帶著資訊：按鈕上是第一首的名字加總首數，看一眼就知道現在是哪
 * 一場的歌單、有沒有少放一首。
 *
 * ## 順序，不是時間點
 *
 * 使用者排的是「第幾首」，起訖時間由 `utils/audio/clips.js` 的 `resequence`
 * 推導。所以這裡沒有任何一個地方讓使用者輸入時間——把第三首換掉時，後面每一首
 * 的位置自己跟著移。
 */

/** 毫秒 → `m:ss` */
const formatLength = (ms) => {
  const total = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * 清單的所有寫入動作。
 *
 * 每一個都是「拿目前的清單算出新的清單，再 dispatch 一次」——順序與位置的規則
 * 全部在 `clips.js` 那一份，這裡只負責接上 redux。
 */
export function usePlaylist() {
  const dispatch = useDispatch();
  const { clips, overlapMs, durationMs } = useAudioClips();

  const options = { overlapMs };

  const commit = (next) => {
    if (next === clips) return; // 沒動就不要推一次新的 reference
    dispatch(updateAudioClips(next));
  };

  return {
    clips,
    overlapMs,
    durationMs,
    add: (sourceFile) =>
      commit(addClip(clips, createClip({ sourceFile }), options)),
    remove: (id) => commit(removeClip(clips, id, options)),
    move: (id, delta) => commit(moveClip(clips, id, delta, options)),
    rename: (id, name) => commit(renameClip(clips, id, name)),
    setTempo: (id, patch) => commit(setClipTempo(clips, id, patch)),
    setOverlap: (ms) => dispatch(updateAudioOverlap(ms)),
  };
}

/**
 * 接縫滑桿：拖的時候只更新自己，停下來才寫進 store。
 *
 * ⚠️ **每一格像素都 dispatch 是不行的。** 改接縫會讓整張清單重排，而重排之後
 * 波形要重新拼一次——`stitchPeaks` 要跑 20 萬個桶乘上歌數。滑桿的 `onChange`
 * 在拖曳中每秒會觸發幾十次，等於每秒做幾十次那個運算，手感會整個卡住。
 *
 * 和逐軌行高把手是同一個做法（拖曳中只改自己、放開才 dispatch），只是這裡用
 * 「停止變動 `COMMIT_DELAY_MS`」判斷放開——range input 沒有可靠的「拖曳結束」
 * 事件（鍵盤操作、程式設值都不會有 pointerup）。
 */
const COMMIT_DELAY_MS = 200;

function useSeamSlider(overlapMs, commit) {
  const [draft, setDraft] = useState(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => {
      commitRef.current(draft);
      setDraft(null);
    }, COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return {
    // 拖曳中顯示自己的值，放手之後回頭跟著 store
    value: draft ?? overlapMs,
    preview: setDraft,
  };
}

/** 後端上這個使用者有哪些音檔可以選 */
function useMusicLibrary() {
  const userName = useSelector((state) => state.profiles.user);
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (!userName) return;
    let cancelled = false;

    fetch(`${API_ENDPOINTS.BASE}/get_music_list/${userName}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data?.music_list) setFiles(data.music_list);
      })
      .catch((error) => console.error("抓取音樂清單失敗:", error));

    return () => {
      cancelled = true;
    };
  }, [userName]);

  return files;
}

/**
 * 點面板外面就收起來。
 *
 * 展開的面板是 320×200，正下方就是時間刻度尺與前兩條軌道——忘記它開著的話，
 * 那幾條軌會變成「看得到但點不到」。工具列上其他的選單都小得多（效果選單只有
 * 110px），所以那些沒有這個問題，這裡有。
 *
 * ⚠️ 監聽的是 `mousedown` 而不是 `click`。`click` 的 target 是 mousedown 與
 * mouseup 的**共同祖先**，在面板裡按下、拖到面板外放開（拖接縫滑桿就會這樣）
 * 會算成「點在外面」，面板在拖曳結束的瞬間自己收起來。
 *
 * ⚠️ 而且要掛在 **capture 階段**。`Timeline` 與 `MarqueeSelect` 的 mousedown
 * 都會 `stopPropagation()`，冒泡到不了 document——而時間軸正好就是面板蓋住的
 * 那塊區域，掛在冒泡階段的話「點面板外面」在最需要它的地方剛好沒作用。
 * （e2e 實測就是這樣紅的。）
 */
function useCloseOnOutsideClick(ref, open, close) {
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event) => {
      if (!ref.current?.contains(event.target)) close();
    };

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [ref, open, close]);
}

/**
 * 一首歌的節拍設定。
 *
 * 速度掛在歌上（使用者拍板：同一個音檔不變速），所以它屬於這一列而不是另外
 * 開一條速度軌。`beatAnchor` 存的是「這首歌開始之後第幾毫秒」，用播放頭來指定
 * ——把紅線移到第一個重拍上再按一下，比要求使用者填一個毫秒數容易得多。
 */
function TempoRow({ clip, onChange }) {
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const withinClip = currentTime >= clip.start && currentTime <= clip.end;

  return (
    <div className="playlist-tempo">
      <label>
        BPM
        <input
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          value={clip.bpm}
          onChange={(e) => onChange({ bpm: e.target.value })}
        />
      </label>
      <label>
        每小節
        <input
          type="number"
          min={1}
          max={32}
          value={clip.beatsPerBar}
          onChange={(e) => onChange({ beatsPerBar: e.target.value })}
        />
      </label>
      <button
        className="ld-btn ld-btn--ghost"
        disabled={!withinClip}
        onClick={() => onChange({ beatAnchor: currentTime - clip.start })}
        title={
          withinClip
            ? "把播放頭現在的位置當成第一拍"
            : "播放頭不在這首歌的範圍內"
        }
      >
        以播放頭為第一拍
      </button>
    </div>
  );
}

function Playlist({ onListChange }) {
  const playlist = usePlaylist();
  const library = useMusicLibrary();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("");
  const wrapperRef = useRef(null);

  useCloseOnOutsideClick(
    wrapperRef,
    open,
    useCallback(() => setOpen(false), []),
  );

  const { clips } = playlist;
  const selectable = picked || library[0] || "";

  /*
   * 動到歌單就停止播放。已經排好的 clip 是用舊的清單算出來的（見 engine.js
   * 的排程），繼續播會聽到剛刪掉的那一首。
   */
  const change = (fn) => {
    onListChange?.();
    fn();
  };

  const seam = useSeamSlider(playlist.overlapMs, (ms) =>
    change(() => playlist.setOverlap(ms)),
  );

  const handleRename = (clip) => {
    const name = window.prompt("這一首叫什麼名字？", clip.name);
    if (name !== null) playlist.rename(clip.id, name);
  };

  return (
    <div className="playlist-wrapper" ref={wrapperRef}>
      <button
        className="playlist-button"
        onClick={() => setOpen((visible) => !visible)}
        data-testid="playlist-toggle"
      >
        <FontAwesomeIcon icon={faMusic} />
        <span className="playlist-summary">
          {clips.length === 0 ? "未選音樂" : clips[0].name}
          {clips.length > 1 && (
            <span className="playlist-count">+{clips.length - 1}</span>
          )}
        </span>
        <span className="tooltip">播放清單（{clips.length} 首）</span>
      </button>

      {open && (
        <div className="playlist-panel" data-testid="playlist-panel">
          <div className="playlist-head">
            <span className="playlist-title">
              播放清單 · {formatLength(playlist.durationMs)}
            </span>
          </div>

          <ol className="playlist-items">
            {clips.map((clip, index) => (
              <li key={clip.id} className="playlist-item" data-clip-id={clip.id}>
                <span className="playlist-index">{index + 1}</span>
                <button
                  className="playlist-name"
                  onClick={() => handleRename(clip)}
                  title={clip.sourceFile}
                >
                  {clip.name}
                </button>
                <span className="playlist-length">
                  {formatLength(clip.lengthMs)}
                </span>
                <span className="playlist-order">
                  <button
                    className="ld-btn ld-btn--ghost"
                    disabled={index === 0}
                    onClick={() => change(() => playlist.move(clip.id, -1))}
                    aria-label="往前移"
                  >
                    ▲
                  </button>
                  <button
                    className="ld-btn ld-btn--ghost"
                    disabled={index === clips.length - 1}
                    onClick={() => change(() => playlist.move(clip.id, 1))}
                    aria-label="往後移"
                  >
                    ▼
                  </button>
                </span>
                <button
                  className="ld-btn ld-btn--danger"
                  onClick={() => change(() => playlist.remove(clip.id))}
                  aria-label="移除"
                >
                  ✕
                </button>
                {/* 節拍設定不影響播放，所以不走 change()（不必停止播放） */}
                <TempoRow
                  clip={clip}
                  onChange={(patch) => playlist.setTempo(clip.id, patch)}
                />
              </li>
            ))}
            {clips.length === 0 && (
              <li className="playlist-empty">還沒有音樂，從下面加一首</li>
            )}
          </ol>

          <div className="playlist-add">
            <select
              className="dropdown-select"
              value={selectable}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="選擇要加入的音樂"
            >
              {library.length === 0 && <option value="">（沒有可用的音檔）</option>}
              {library.map((filename) => (
                <option key={filename} value={filename}>
                  {filename}
                </option>
              ))}
            </select>
            <button
              className="ld-btn ld-btn--secondary"
              disabled={!selectable}
              onClick={() => change(() => playlist.add(selectable))}
            >
              加入
            </button>
          </div>

          {/*
            接縫：相鄰兩首重疊多久。0 就是硬切。
            重疊時前一首淡出、後一首淡入，兩段疊起來是交叉淡入淡出。
          */}
          <div className="playlist-seam">
            <label htmlFor="playlist-overlap">接縫重疊</label>
            <input
              id="playlist-overlap"
              type="range"
              min={0}
              max={MAX_OVERLAP_MS}
              step={TICK_MS}
              value={seam.value}
              onChange={(e) => seam.preview(Number(e.target.value))}
            />
            <span className="playlist-seam-value">
              {(seam.value / 1000).toFixed(2)}s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 接縫標記：時間軸上每一首歌從哪裡開始。
 *
 * 和 `TimeRuler` / `ShiftMarkers` 同一個座標系（`time / duration × 100%`），
 * 所以縮放與橫向捲動自動同步。
 *
 * 第一首的標記在 0，會和刻度尺的 `0:00` 疊在一起，所以只從第二首開始畫——
 * 需要看見的本來就是**接縫**，不是開頭。
 */
export function ClipMarkers() {
  const { clips } = useAudioClips();
  const duration = useSelector((state) => state.profiles.duration);

  if (!(duration > 0) || clips.length < 2) return null;

  return (
    <div className="clip-markers">
      {clips.slice(1).map((clip) => (
        <div
          key={clip.id}
          className="clip-marker"
          style={{ left: `${(clip.start / duration) * 100}%` }}
          data-clip-id={clip.id}
        >
          <span className="clip-marker-label">{clip.name}</span>
        </div>
      ))}
    </div>
  );
}

export default Playlist;
