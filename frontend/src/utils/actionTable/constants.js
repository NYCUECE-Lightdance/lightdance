// actionTable utils 共用常數
//
// ⚠️ 這些常數在 Phase 4 segment 重構後預期會被移除：
//   - BLACK_THRESHOLD：「色塊邊界塞 10ms 黑點」是 keyframe 模型的 workaround，
//     segment 模型用顯式 start/end 後不再需要
//   - TICK_MS 仍會保留（硬體 50ms 取樣對齊）

export const TICK_MS = 50;
export const BLACK_THRESHOLD = 10;

export const BLACK = { R: 0, G: 0, B: 0, A: 1 };

export const isBlack = (color) =>
  !color || (color.R === 0 && color.G === 0 && color.B === 0);

export const makeBlackEntry = (time) => ({
  time,
  color: { ...BLACK },
  linear: 0,
});
