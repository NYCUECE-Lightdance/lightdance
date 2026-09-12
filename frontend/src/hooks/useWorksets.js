import { useMemo } from "react";
import { useSelector } from "react-redux";

import { activeSet, activeTracks } from "../utils/worksets.js";

/**
 * 工作集的讀取入口 —— **「目前顯示哪幾軌」的單一答案**。
 *
 * 舊版每個元件各自 `useSelector((s) => s.profiles.showPart)`，那時候只有一份
 * 清單所以還行；現在有多組，「目前是哪一組」必須只有一個地方決定，否則
 * ControlPanel 的軌名列與 audioplayer 的 Timeline 有機會顯示不同組的軌道
 * ——而且畫面上看起來都很正常，只是點某一軌會編到別條。
 *
 * 寫入仍然走既有的 `updateShowPart(tracks)`，reducer 會寫進目前這一組。
 */

/** 穩定的空陣列，避免每次回傳新的 `[]` 造成無謂重繪 */
const EMPTY = Object.freeze([]);

/** 目前這一組的軌道清單 */
export function useActiveTracks() {
  const worksets = useSelector((state) => state.profiles.worksets);
  return useMemo(() => activeTracks(worksets) || EMPTY, [worksets]);
}

/** 工作集列要用的完整資訊：全部組別、目前這一組、目前的軌道 */
export function useWorksets() {
  const worksets = useSelector((state) => state.profiles.worksets);

  return useMemo(
    () => ({
      sets: worksets?.sets ?? EMPTY,
      current: activeSet(worksets),
      tracks: activeTracks(worksets),
    }),
    [worksets],
  );
}

export default useWorksets;
