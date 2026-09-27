import { useEffect, useRef } from "react";

import { createAudioEngine } from "../utils/audio/engine.js";

/**
 * 把播放引擎接進 React —— **薄薄一層**，只做三件事：
 * 建立一個引擎、把 volume/rate 同步進去、卸載時清掉。
 *
 * 播放的邏輯全部在 `utils/audio/engine.js`，那裡沒有 React 也因此測得到。
 * 這裡刻意不放任何判斷，否則會變成「有些行為在引擎裡、有些在 hook 裡」，
 * 又回到當初 sourceNode / startTime / AudioContext 各住一處的狀態。
 *
 * ## 為什麼引擎不進 state
 *
 * 它是一個可變的物件，不是要拿來渲染的資料。放進 `useState` 會讓每次
 * 「播放位置變了」都變成一次 re-render，而這個元件底下掛著 154 條時間軸——
 * 那正是 `docs/frontend-rendering-optimization.md` 花了很大力氣避免的事。
 * 位置由 rAF 每幀主動去問（`positionMs()`），不由 React 推。
 */
export function useAudioEngine({ volume = 1, rate = 1, onEnded } = {}) {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = createAudioEngine();
  const engine = engineRef.current;

  // 「整場播完了」的通知每次 render 都可能換一個新的 callback，
  // 用 ref 存起來，引擎那邊只需要註冊一次
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  useEffect(() => {
    engine.onEnded(() => endedRef.current?.());
  }, [engine]);

  useEffect(() => {
    engine.setVolume(volume);
  }, [engine, volume]);

  useEffect(() => {
    // 播放中變速會整批重排（見 engine.js），所以這是個 async 動作
    engine.setRate(rate);
  }, [engine, rate]);

  useEffect(() => () => engine.dispose(), [engine]);

  return engine;
}

export default useAudioEngine;
