export const UPDATEUSER = "UPDATEUSER";
export const UPDATEFULLPEAKS = "UPDATEFULLPEAKS";
export const UPDATEDURATION = "UPDATEDURATION";
export const UPDATEACTIONTABLE = "UPDATEACTIONTABLE";
export const UPDATETIMELINEBLOCKS = "UPDATETIMELINEBLOCKS";
export const UPDATECHOSENCOLOR = "UPDATECHOSENCOLOR";
export const UPDATECURRENTTIME = "UPDATECURRENTTIME";
export const UPDATEACCESSTOKEN = "UPDATEACCESSTOKEN";
export const UPDATEUSERNAME = "UPDATEUSERNAME";
export const UPDATETIMELINEBLOCK = "UPDATETIMELINEBLOCK";
export const UPDATEAUTOREFRESH = "UPDATEAUTOREFRESH";
export const UPDATETEMPACTIONTABLE = "UPDATETEMPACTIONTABLE";
export const UPDATEPALETTECOLOR = "UPDATEPALETTECOLOR";
export const UPDATESELECTEDBLOCK = "UPDATESELECTEDBLOCK";
export const UPDATEHISTORY = "UPDATEHISTORY";
export const UPDATEISCOLORCHANGEACTIVE = "UPDATEISCOLORCHANGEACTIVE";
export const UPDATEPLAYBACKRATE = "UPDATEPLAYBACKRATE";
export const UPDATEMAGNETACTIVE = "UPDATEMAGNETACTIVE";
export const UPDATESHOWPART = "UPDATESHOWPART";
export const UPDATEFAVORITECOLOR = "UPDATEFAVORITECOLOR";

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

export const updateTimelineBlocks = ({ armorIndex, partIndex, value }) => ({
  type: UPDATETIMELINEBLOCKS,
  payload: { armorIndex, partIndex, value },
});
export const updateChosenColor = (value) => ({
  type: UPDATECHOSENCOLOR,
  payload: value,
});
export const updateSelectedBlock = (value) => ({
  type: UPDATESELECTEDBLOCK,
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

export const updateTimelineBlock = (value) => ({
  type: UPDATETIMELINEBLOCK,
  payload: value,
});

export const updateAutoRefresh = (value) => ({
  type: UPDATEAUTOREFRESH,
  payload: value,
});

export const updateTempActionTable = (value) => ({
  type: UPDATETEMPACTIONTABLE,
  payload: value,
});

export const updatePaletteColor = (value) => ({
  type: UPDATEPALETTECOLOR,
  payload: value,
});

export const updateHistory = (value) => ({
  type: UPDATEHISTORY,
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

export const updateMagnetActive = (value) => ({
  type: UPDATEMAGNETACTIVE,
  payload: value,
});
export const updateUndo = () => ({ type: "UPDATEUNDO" });
export const updateRedo = () => ({ type: "UPDATEREDO" });

export const updateShowPart = (value) => ({
  type: UPDATESHOWPART,
  payload: value,
});

export const updateFavoriteColor = (value) => ({
  type: UPDATEFAVORITECOLOR,
  payload: value,
});
