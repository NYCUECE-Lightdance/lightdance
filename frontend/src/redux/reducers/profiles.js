const initialState = {
  user: null,
  fullPeaks: [],
  duration: 0,
  actionTable: [],
  timelineBlocks: {},
  selectedBlock: {},
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
    case "UPDATEACTIONTABLE":
      if (
        JSON.stringify(state.actionTable) === JSON.stringify(action.payload)
      ) {
        return state; // 如果數據相同，直接返回舊狀態
      }

      // 跳过初始化操作的历史记录更新
      if (action.meta && action.meta.skipHistory) {
        return {
          ...state,
          actionTable: action.payload,
        };
      }

      if (state.history.length > 0) {
        if (action.payload[0][0].length === 1) {
          console.log("state.actionTable: ", action.payload);
          // console.log("yes");
          return {
            ...state,
            actionTable: action.payload,
          };
        }
      }

      const newHistory = Array.isArray(state.history)
        ? [...state.history, state.actionTable]
        : [state.actionTable]; // 如果 history 不是数组，则初始化为新数组

      if (newHistory.length > 50) newHistory.shift(); // 限制历史记录长度为 50
      if (state.history.length > 1) {
        return {
          ...state,
          actionTable: action.payload,
          history: newHistory,
          redoStack: [], // 每次更新清空 redoStack
        };
      } else {
        return {
          ...state,
          actionTable: action.payload,
          history: newHistory,
        };
      }
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
          JSON.stringify(state.actionTable)
      ) {
        return state; // 如果当前状态与上一个状态相同，跳过更新
      }

      return {
        ...state,
        history: [...state.history, state.actionTable], // 推入新的历史记录
        redoStack: [], // 清空 redo 堆栈
      };
    }
    case "UPDATEUNDO": {
      // console.log(state.history);

      if (state.history.length === 0) return state; // 无历史记录，无法 undo
      const previousState = state.history[state.history.length - 1]; // 获取最后一个历史状态
      // console.log("Previous state:", previousState); // 输出调试信息
      // console.log("Current state:", state.actionTable); // 输出调试信息
      if (JSON.stringify(previousState) === JSON.stringify(state.actionTable)) {
        // console.log("Same as previous state, skipping..."); // 输出调试信息
        return state; // 如果当前状态与上一个状态相同，跳过更新
      }
      return {
        ...state,
        actionTable: previousState, // 恢复到上一个状态
        history: state.history.slice(0, -1), // 移除最后一个历史记录
        redoStack: [state.actionTable, ...state.redoStack], // 将当前状态存入 redoStack
      };
    }

    case "UPDATEREDO": {
      if (state.redoStack.length === 0) return state; // 无 redo 记录，无法 redo

      const latestRedo = state.redoStack[0]; // 获取 redoStack 的第一个状态
      return {
        ...state,
        actionTable: latestRedo, // 恢复到 redo 状态
        history: [...state.history, state.actionTable], // 将当前状态存入历史记录
        redoStack: state.redoStack.slice(1), // 移除第一个 redo 记录
      };
    }
    case "UPDATEISCOLORCHANGEACTIVE":
      return { ...state, isColorChangeActive: action.payload };
    case "UPDATESHOWPART":
      return { ...state, showPart: action.payload };
    case "UPDATEFAVORITECOLOR":
      return { ...state, favoriteColor: action.payload };
    case "REFRESH":
      return initialState;
    default:
      return state;
  }
};

export default profiles;
