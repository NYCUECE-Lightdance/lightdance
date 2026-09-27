import { PLAYER_COUNT } from "../../constants/parts.js";
import {
  DEFAULT_OVERLAP_MS,
  MAX_OVERLAP_MS,
  createClip,
  resequence,
} from "../../utils/audio/clips.js";
import { pushRecentColor } from "../../utils/palette.js";
import { DEFAULT_ROW_H, clampRowHeight } from "../../utils/tracks.js";
import {
  addSet,
  createDefaultWorksets,
  removeSet,
  renameSet,
  switchSet,
  withTracks,
  activeSet,
} from "../../utils/worksets.js";

const initialState = {
  user: null,
  fullPeaks: [],
  duration: 0,
  data: {
    // 相容欄位：永遠等於 audioClips 的第一首。後端的 raw_data 與舊備份都認得它
    music_filename: "2026_show.mp3",
    actionTable: [],
    // 整場表演的音訊時間軸（見 utils/audio/clips.js）
    audioClips: [],
    // 接縫重疊多久。0 = 硬切
    audioOverlapMs: DEFAULT_OVERLAP_MS,
  },
  multiSelectedBlocks: [],
  chosenColor: { R: 5, G: 5, B: 5, A: 1 },
  currentTime: 0,
  accessToken: "",
  userName: "",
  autoRefresh: 0,
  paletteColor: "#000000",
  history: [], // 用于存储历史记录
  redoStack: [], // 用于存储 redo 快照
  isColorChangeActive: false,
  playbackRate: 1,
  moveMode: false,
  // 具名的軌道組合。舊版是一個沒有名字的 showPart 陣列，見 utils/worksets.js
  worksets: createDefaultWorksets(),
  // 軌道行高（像素）。逐軌覆寫存在 track.height，見 utils/tracks.js
  rowHeight: DEFAULT_ROW_H,
  // 使用者明確存起來的六格，快捷鍵 1~6 對應（空格是 null，見 utils/palette.js）
  favoriteColor: [],
  // 最近選過的顏色，由 UPDATECHOSENCOLOR 自動維護，使用者不需要先想到要存
  recentColors: [],
  // 由 PLAYER_COUNT 推導：改人數時不會忘了這裡
  dancerVisibility: Array(PLAYER_COUNT).fill(true),
  clipboard: {
    type: null,              // 增加 type 區分複製類型
    data: null,
    sourceArmorIndex: null,
    sourcePartIndex: null,
    timestamp: null,
    sourceBlocks: [],        // ✅ 增加這個欄位，用來儲存來源 block 的位置
    startTime: 0,
    endTime: 0
  },
  selectedDancerId: null,
};

export const profiles = (state = initialState, action) => {
  // console.log("Reducer initialized with state:", state); // 输出初始状态
  switch (action.type) {
    case "UPDATEUSER":
      return { ...state, user: action.payload };
    case "UPDATEFULLPEAKS":
      return { ...state, fullPeaks: action.payload };
    case "UPDATEDURATION":
      return { ...state, duration: action.payload };
    case "UPDATEACTIONTABLE": {
      const newActionTable =
        action.payload && action.payload.actionTable
          ? action.payload.actionTable
          : action.payload;
      const newMusicFilename =
        action.payload && action.payload.music_filename !== undefined
          ? action.payload.music_filename
          : state.data.music_filename;

      // O(1) reference check：Immer produce 在無變更時回傳相同 reference，
      // 避免把相同 state 重複 push 到 history（會讓 undo 需要多按一次）
      if (newActionTable === state.data.actionTable &&
          newMusicFilename === state.data.music_filename) {
        return state;
      }

      // 跳过初始化操作的历史记录更新
      if (action.meta && action.meta.skipHistory) {
        return {
          ...state,
          data: {
            ...state.data,
            actionTable: newActionTable,
            music_filename: newMusicFilename,
          },
        };
      }

      // 【Phase 4 移除】這裡原本有一條「第一個部位只有 1 個關鍵格就跳過 history」
      // 的判斷，用來偵測「還在初始化」。keyframe 世界裡「只有一個 time 0 的黑點」
      // 確實等於空白，但 segment 世界裡「只有 1 個 segment」是完全正常的編輯狀態
      // （放了一個色塊），沿用會讓那次編輯無法 undo。
      //
      // 初始化本來就有明確的表達方式：呼叫端傳 meta.skipHistory（見上方分支）。
      // 用形狀猜測意圖是這個 bug 的來源，直接刪掉。

      const newHistory = Array.isArray(state.history)
        ? [...state.history, state.data.actionTable]
        : [state.data.actionTable];

      if (newHistory.length > 50) newHistory.shift();

      return {
        ...state,
        data: {
          ...state.data,
          actionTable: newActionTable,
          music_filename: newMusicFilename,
        },
        history: newHistory,
        redoStack: state.history.length > 1 ? [] : state.redoStack,
      };
    }
    /*
     * 音訊時間軸。`music_filename` 一併同步成第一首——後端的 raw_data、舊的
     * 本地備份、Dashboard 的清單都認得那個欄位，讓它變成「clip 清單的投影」
     * 比逐個呼叫端各自維護兩份可靠。
     */
    case "UPDATEAUDIOCLIPS": {
      const audioClips = Array.isArray(action.payload) ? action.payload : [];
      if (audioClips === state.data.audioClips) return state;

      return {
        ...state,
        data: {
          ...state.data,
          audioClips,
          /*
           * ⚠️ 空清單要把 `music_filename` 一起清掉，**不能保留舊的檔名**。
           *
           * 投影必須是全域的：讀取端 `migrateClips` 看到「沒有 clip 但有
           * music_filename」時，會把那個檔名當成還沒遷移的舊單曲專案，
           * 於是幫你生一個 clip 出來——結果是**移除最後一首之後它自己長回來**。
           * 留著舊檔名等於同時宣稱「沒有歌」和「有一首歌」。
           */
          music_filename: audioClips[0]?.sourceFile ?? "",
        },
      };
    }

    case "UPDATEAUDIOOVERLAP": {
      const audioOverlapMs = Math.max(
        0,
        Math.min(MAX_OVERLAP_MS, Number(action.payload) || 0),
      );
      if (audioOverlapMs === state.data.audioOverlapMs) return state;

      return {
        ...state,
        data: {
          ...state.data,
          audioOverlapMs,
          // 重疊改了位置就得跟著改，兩者不能各存各的
          audioClips: resequence(state.data.audioClips, {
            overlapMs: audioOverlapMs,
          }),
        },
      };
    }

    /*
     * 舊的單曲入口（載入專案時會用到）。
     *
     * 換歌 = 換掉整張清單，因為那是「這場表演的音樂是這個檔案」的意思。
     * 但**第一首已經是它時什麼都不做**：多曲專案載入時 envelope 的
     * `music_filename` 就是第一首，不擋的話會把後面幾首整個丟掉。
     */
    case "UPDATEMUSICFILENAME": {
      const filename = action.payload;
      if (state.data.audioClips?.[0]?.sourceFile === filename) {
        return { ...state, data: { ...state.data, music_filename: filename } };
      }

      return {
        ...state,
        data: {
          ...state.data,
          music_filename: filename,
          audioClips: filename
            ? resequence([createClip({ sourceFile: filename })], {
                overlapMs: state.data.audioOverlapMs,
              })
            : [],
        },
      };
    }
    /*
     * 選色的同時記進「最近使用」。
     *
     * 記在這裡而不是在調色盤元件裡，是因為選色的入口不只一個：調色器、HEX
     * 欄位、最愛色、時間軸上的取色（TrackToolbar 的 handleColorPick）、
     * 亮度滑桿。要每個入口各記一次的話，遲早會有人新增第六個入口而忘記。
     *
     * `pushRecentColor` 在內容沒變時回傳原陣列，所以拉亮度滑桿（每格一次
     * dispatch）不會每次都換掉 state 的 reference。
     */
    case "UPDATECHOSENCOLOR": {
      const recentColors = pushRecentColor(state.recentColors, action.payload);
      return { ...state, chosenColor: action.payload, recentColors };
    }
    case "UPDATECURRENTTIME":
      return { ...state, currentTime: action.payload };
    case "UPDATEACCESSTOKEN":
      return { ...state, accessToken: action.payload };
    case "UPDATEUSERNAME":
      return { ...state, userName: action.payload };
    case "UPDATEAUTOREFRESH":
      return { ...state, autoRefresh: action.payload };
    case "UPDATEPALETTECOLOR":
      return { ...state, paletteColor: action.payload };

    case "UPDATEPLAYBACKRATE":
      return { ...state, playbackRate: action.payload };

    case "UPDATEMOVEMODE":
      return { ...state, moveMode: action.payload };
    case "TOGGLEMOVEMODE":
      return { ...state, moveMode: !state.moveMode };

    case "UPDATEUNDO": {
      // console.log(state.history);

      if (state.history.length === 0) return state; // 无历史记录，无法 undo
      const previousState = state.history[state.history.length - 1];

      // O(1) reference 比較。原本這裡是 `JSON.stringify(a) === JSON.stringify(b)`——
      // 每按一次 Ctrl+Z 就把整張光表序列化兩次，密集光表實測 53ms，等於掉 3 個 frame。
      //
      // 而且深度比較是多餘的：寫入路徑（UPDATEACTIONTABLE）已經用同樣的 reference
      // 檢查擋掉「內容沒變」的 dispatch，history 裡不會出現與當前相同的快照。
      if (previousState === state.data.actionTable) {
        return state; // 與上一個狀態相同，跳過
      }
      return {
        ...state,
        data: { ...state.data, actionTable: previousState }, // 恢复到上一个状态
        history: state.history.slice(0, -1), // 移除最后一个历史记录
        redoStack: [state.data.actionTable, ...state.redoStack], // 将当前状态存入 redoStack
      };
    }

    case "UPDATEREDO": {
      if (state.redoStack.length === 0) return state; // 无 redo 记录，无法 redo

      const latestRedo = state.redoStack[0]; // 获取 redoStack 的第一个状态
      return {
        ...state,
        data: { ...state.data, actionTable: latestRedo }, // 恢复到 redo 状态
        history: [...state.history, state.data.actionTable], // 将当前状态存入历史记录
        redoStack: state.redoStack.slice(1), // 移除第一个 redo 记录
      };
    }
    case "UPDATEISCOLORCHANGEACTIVE":
      return { ...state, isColorChangeActive: action.payload };
    /*
     * 沿用舊的 action 名稱與 payload 形狀（一個軌道陣列），只是寫入的目標
     * 從 `showPart` 換成「目前這一組工作集的 tracks」。加軌、移除、上下移、
     * 套用選取這四個呼叫端因此一行都不用改。
     */
    case "UPDATESHOWPART": {
      const current = activeSet(state.worksets);
      if (!current) return state;
      return {
        ...state,
        worksets: withTracks(state.worksets, current.id, action.payload),
      };
    }
    case "WORKSET_SWITCH":
      return { ...state, worksets: switchSet(state.worksets, action.payload) };
    case "WORKSET_ADD":
      return { ...state, worksets: addSet(state.worksets, action.payload) };
    case "WORKSET_RENAME":
      return {
        ...state,
        worksets: renameSet(
          state.worksets,
          action.payload.id,
          action.payload.name,
        ),
      };
    case "UPDATEROWHEIGHT":
      return { ...state, rowHeight: clampRowHeight(action.payload) };
    case "WORKSET_REMOVE":
      return { ...state, worksets: removeSet(state.worksets, action.payload) };
    case "UPDATEFAVORITECOLOR":
      return { ...state, favoriteColor: action.payload };
    case "UPDATEDANCERVISIBILITY":
      return { ...state, dancerVisibility: action.payload };
    case "UPDATECLIPBOARD":
      return { ...state, clipboard: action.payload };
    case "UPDATE_MULTI_SELECTED_BLOCKS":
      return { ...state, multiSelectedBlocks: action.payload };
    case "UPDATE_SELECTED_DANCER":
      return { ...state, selectedDancerId: action.payload };
    case "REFRESH":
      return initialState;
    default:
      return state;
  }
};

export default profiles;
