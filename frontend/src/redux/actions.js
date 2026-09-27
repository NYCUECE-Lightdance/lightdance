export const UPDATEUSER = "UPDATEUSER";
export const UPDATEFULLPEAKS = "UPDATEFULLPEAKS";
export const UPDATEDURATION = "UPDATEDURATION";
export const UPDATEACTIONTABLE = "UPDATEACTIONTABLE";
export const UPDATEMUSICFILENAME = "UPDATEMUSICFILENAME";
export const UPDATECHOSENCOLOR = "UPDATECHOSENCOLOR";
export const UPDATECURRENTTIME = "UPDATECURRENTTIME";
export const UPDATEACCESSTOKEN = "UPDATEACCESSTOKEN";
export const UPDATEUSERNAME = "UPDATEUSERNAME";
export const UPDATEAUTOREFRESH = "UPDATEAUTOREFRESH";
export const UPDATEPALETTECOLOR = "UPDATEPALETTECOLOR";
export const UPDATEISCOLORCHANGEACTIVE = "UPDATEISCOLORCHANGEACTIVE";
export const UPDATEPLAYBACKRATE = "UPDATEPLAYBACKRATE";
export const UPDATESHOWPART = "UPDATESHOWPART";
export const UPDATEFAVORITECOLOR = "UPDATEFAVORITECOLOR";
export const UPDATEDANCERVISIBILITY = "UPDATEDANCERVISIBILITY";
export const UPDATECLIPBOARD = "UPDATECLIPBOARD";

export const updateUser = (value) => ({ type: UPDATEUSER, payload: value });
export const updateFullpeaks = (value) => ({
  type: UPDATEFULLPEAKS,
  payload: value,
});
export const updateDuration = (value) => ({
  type: UPDATEDURATION,
  payload: value,
});

export const updateActionTable = (payload, meta = {}) => ({
  type: "UPDATEACTIONTABLE",
  payload,
  meta,
});

export const updateMusicFilename = (value) => ({
  type: UPDATEMUSICFILENAME,
  payload: value,
});

/**
 * 整條音訊時間軸（一場表演接續播放的那幾首歌）。
 *
 * 形狀與不變式在 `utils/audio/clips.js`，讀取一律走 `hooks/useAudioClips.js`。
 */
export const updateAudioClips = (clips) => ({
  type: "UPDATEAUDIOCLIPS",
  payload: clips,
});

/** 接縫重疊多久（ms）。改這個會把整張清單重排一次 */
export const updateAudioOverlap = (overlapMs) => ({
  type: "UPDATEAUDIOOVERLAP",
  payload: overlapMs,
});

export const updateChosenColor = (value) => ({
  type: UPDATECHOSENCOLOR,
  payload: value,
});

export const updateCurrentTime = (value) => ({
  type: UPDATECURRENTTIME,
  payload: value,
});

export const updateAccessToken = (value) => ({
  type: UPDATEACCESSTOKEN,
  payload: value,
});

export const updateUserName = (value) => ({
  type: UPDATEUSERNAME,
  payload: value,
});

export const updateAutoRefresh = (value) => ({
  type: UPDATEAUTOREFRESH,
  payload: value,
});

export const updatePaletteColor = (value) => ({
  type: UPDATEPALETTECOLOR,
  payload: value,
});

export const updateIsColorChangeActive = (value) => ({
  type: UPDATEISCOLORCHANGEACTIVE,
  payload: value,
});

export const updatePlaybackRate = (value) => ({
  type: UPDATEPLAYBACKRATE,
  payload: value,
});

export const updateUndo = () => ({ type: "UPDATEUNDO" });
export const updateRedo = () => ({ type: "UPDATEREDO" });

/** 改寫**目前這一組工作集**的軌道清單（payload 形狀與舊的 showPart 相同） */
export const updateShowPart = (value) => ({
  type: UPDATESHOWPART,
  payload: value,
});

/* ── 工作集 ────────────────────────────────────────────
   軌道組合的命名、切換與增刪。實作與不變式見 utils/worksets.js。 */
export const switchWorkset = (id) => ({ type: "WORKSET_SWITCH", payload: id });
export const addWorkset = (name) => ({ type: "WORKSET_ADD", payload: name });
export const renameWorkset = (id, name) => ({
  type: "WORKSET_RENAME",
  payload: { id, name },
});
export const removeWorkset = (id) => ({ type: "WORKSET_REMOVE", payload: id });

/** 全域軌道行高（像素）。逐軌覆寫請用 updateShowPart 帶 track.height */
export const updateRowHeight = (height) => ({
  type: "UPDATEROWHEIGHT",
  payload: height,
});

export const updateFavoriteColor = (value) => ({
  type: UPDATEFAVORITECOLOR,
  payload: value,
});

export const updateDancerVisibility = (value) => ({
  type: UPDATEDANCERVISIBILITY,
  payload: value,
});

export const updateClipboard = (value) => ({
  type: UPDATECLIPBOARD,
  payload: value,
});

export const UPDATE_MULTI_SELECTED_BLOCKS = "UPDATE_MULTI_SELECTED_BLOCKS";

export const updateMultiSelectedBlocks = (blocks) => ({
  type: UPDATE_MULTI_SELECTED_BLOCKS,
  payload: blocks,
});

export const toggleMoveMode = () => ({ type: "TOGGLEMOVEMODE" });
export const updateMoveMode = (value) => ({ type: "UPDATEMOVEMODE", payload: value });

export const UPDATE_SELECTED_DANCER = "UPDATE_SELECTED_DANCER";
export const updateSelectedDancer = (value) => ({
  type: UPDATE_SELECTED_DANCER,
  payload: value,
});
