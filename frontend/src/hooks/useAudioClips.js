import { useMemo } from "react";
import { useSelector } from "react-redux";

import { migrateClips } from "../utils/audio/clips.js";
import { totalDuration } from "../utils/audio/schedule.js";

/**
 * 音訊時間軸的**唯一讀取入口**。
 *
 * 和工作集（`useWorksets`）同一套理由：「目前有哪幾首歌、每一首從第幾毫秒開始」
 * 必須只有一個答案。播放引擎、波形、播放清單面板、接縫標記四個地方都要問這件事，
 * 各自去讀 `state.profiles.data.audioClips` 的話，只要有一個忘了跑遷移，
 * 畫面上就會出現「波形畫了三首但只播得出第一首」這種各自看起來都正常的狀況。
 *
 * 遷移在這裡順手做掉（`migrateClips` 靠形狀辨認）：舊的 persist 資料只有一個
 * `music_filename`，沒有 clip 清單。轉出來的長度是暫定值，等波形載入完解碼出
 * 真正的長度會 dispatch 回 store（見 `waveform.jsx` 的載入 effect），
 * 之後這裡讀到的就是 store 裡的那一份。
 */
export function useAudioClips() {
  const stored = useSelector((state) => state.profiles.data?.audioClips);
  const musicFilename = useSelector(
    (state) => state.profiles.data?.music_filename,
  );
  const overlapMs = useSelector(
    (state) => state.profiles.data?.audioOverlapMs ?? 0,
  );

  const clips = useMemo(
    () => migrateClips(stored, musicFilename),
    [stored, musicFilename],
  );

  return { clips, overlapMs, durationMs: totalDuration(clips) };
}

export default useAudioClips;
