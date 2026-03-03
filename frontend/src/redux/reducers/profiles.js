const initialState = {
  user: null,
  fullPeaks: [],
  duration: 0,
  data: {
    music_filename: "2026_show.mp3",
    actionTable: [],
  },
  timelineBlocks: {},
  selectedBlock: {},
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
  magnetActive: false,
  showPart: [
    { id: 1, armorIndex: 0, partIndex: 0, hidden: false },
    { id: 2, armorIndex: 1, partIndex: 0, hidden: false },
    { id: 3, armorIndex: 2, partIndex: 0, hidden: false },
  ],
  favoriteColor: [],
  dancerVisibility: [false, false, false, false, false, false, false], // 初始全部隱藏
  clipboard: {
    data: null,              // 複製的 timeline 資料
    sourceArmorIndex: null,  // 來源舞者索引
    sourcePartIndex: null,   // 來源部位索引
    timestamp: null,         // 複製時間戳
  },
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

      if (
        JSON.stringify(state.data.actionTable) === JSON.stringify(newActionTable)
      ) {
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

      if (state.history.length > 0) {
        // 这里的逻辑似乎是检查某种特定的 actionTable 格式，保留它
        if (
          Array.isArray(newActionTable) &&
          newActionTable[0] &&
          newActionTable[0][0] &&
          newActionTable[0][0].length === 1
        ) {
          console.log("state.data: ", {
            ...state.data,
            actionTable: newActionTable,
            music_filename: newMusicFilename,
          });
          return {
            ...state,
            data: {
              ...state.data,
              actionTable: newActionTable,
              music_filename: newMusicFilename,
            },
          };
        }
      }

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
    case "UPDATEMUSICFILENAME":
      return {
        ...state,
        data: { ...state.data, music_filename: action.payload },
      };
    case "UPDATETEMPACTIONTABLE":
      return { ...state, tempActionTable: action.payload };
    case "UPDATETIMELINEBLOCKS":
      return {
        ...state,
        timelineBlocks: {
          ...state.timelineBlocks,
          [action.payload.armorIndex]: {
            ...(state.timelineBlocks[action.payload.armorIndex] || {}), // 确保嵌套对象存在
            [action.payload.partIndex]: action.payload.value,
          },
        },
      };
    case "UPDATESELECTEDBLOCK":
      return { ...state, selectedBlock: action.payload };
    case "UPDATECHOSENCOLOR":
      return { ...state, chosenColor: action.payload };
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

    case "UPDATEMAGNETACTIVE":
      return { ...state, magnetActive: action.payload };

    case "UPDATEHISTORY": {
      // 防止重复记录
      if (
        state.history.length > 0 &&
        JSON.stringify(state.history[state.history.length - 1]) ===
          JSON.stringify(state.data.actionTable)
      ) {
        return state; // 如果当前状态与上一个状态相同，跳过更新
      }

      return {
        ...state,
        history: [...state.history, state.data.actionTable], // 推入新的历史记录
        redoStack: [], // 清空 redo 堆栈
      };
    }
    case "UPDATEUNDO": {
      // console.log(state.history);

      if (state.history.length === 0) return state; // 无历史记录，无法 undo
      const previousState = state.history[state.history.length - 1]; // 获取最后一个历史状态
      // console.log("Previous state:", previousState); // 输出调试信息
      // console.log("Current state:", state.data.actionTable); // 输出调试信息
      if (JSON.stringify(previousState) === JSON.stringify(state.data.actionTable)) {
        // console.log("Same as previous state, skipping..."); // 输出调试信息
        return state; // 如果当前状态与上一个状态相同，跳过更新
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
    case "UPDATESHOWPART":
      return { ...state, showPart: action.payload };
    case "UPDATEFAVORITECOLOR":
      return { ...state, favoriteColor: action.payload };
    case "UPDATEDANCERVISIBILITY":
      return { ...state, dancerVisibility: action.payload };
    case "UPDATECLIPBOARD":
      return { ...state, clipboard: action.payload };
    case "UPDATE_MULTI_SELECTED_BLOCKS":
      return { ...state, multiSelectedBlocks: action.payload };
    case "REFRESH":
      return initialState;
    default:
      return state;
  }
};

export default profiles;
