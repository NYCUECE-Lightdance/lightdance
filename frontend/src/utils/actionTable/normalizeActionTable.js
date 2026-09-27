import { PART_COUNT, PLAYER_COUNT } from "../../constants/parts.js";

/**
 * 把 actionTable 正規化成標準形狀：7×22 巢狀 array，每個部位的時間軸都
 * 「以 time 0 的黑點開頭、以 maxDuration 的黑點結尾、依時間排序、超出長度的點丟棄」。
 *
 * 這個函式原本內嵌在 Home.jsx（只在 duration 變動時跑），2026-08-08 抽出成共用 util，
 * 讓測試能用**與 app 完全相同的**正規化邏輯，而不是各自複製一份。
 *
 * 為什麼結尾一定要有 maxDuration 的黑點：舊的 keyframe 模型沒有「表演長度」這個
 * 一級概念，只能靠每個部位尾端那個黑關鍵格來表達時間軸有多長。segment 模型把長度
 * 收斂到 duration 單一來源，所以壓平回 keyframe 時也要把這個尾端黑點還原
 * （見 utils/segments/convert.js 的 segmentsToKeyframes）。
 */

export const createBlackPoint = (time = 0) => ({
  time,
  color: { R: 0, G: 0, B: 0, A: 1 },
  linear: 0,
});

export function normalizeActionTable(currentTable, maxDuration) {
  const normalizedTable = Array.from({ length: PLAYER_COUNT }, () =>
    Array.from({ length: PART_COUNT }, () => [createBlackPoint(0)]),
  );

  for (let armorIdx = 0; armorIdx < PLAYER_COUNT; armorIdx++) {
    const parts = currentTable?.[armorIdx];

    for (let partIdx = 0; partIdx < PART_COUNT; partIdx++) {
      const timeline = parts?.[partIdx];

      // 缺少的部位一律補成「從頭黑到尾」。原本這裡只放 time 0 的黑點就 continue，
      // 與下方「有內容的部位一定補 maxDuration 黑點」不一致——同樣是「全程熄滅」，
      // 卻因為來源有沒有這個 key 而產生不同長度的時間軸。統一之後，
      // 「每個部位的時間軸都涵蓋 [0, duration]」才是真正成立的不變式，
      // segment 模型的壓平也才有一致的對象。
      if (!Array.isArray(timeline) || timeline.length === 0) {
        normalizedTable[armorIdx][partIdx] =
          maxDuration > 0
            ? [createBlackPoint(0), createBlackPoint(maxDuration)]
            : [createBlackPoint(0)];
        continue;
      }

      let newTimeline = timeline
        .filter((point) => point && typeof point.time === "number")
        .map((point) => ({
          time: point.time,
          color: {
            R: point.color?.R ?? 0,
            G: point.color?.G ?? 0,
            B: point.color?.B ?? 0,
            A: point.color?.A ?? 1,
          },
          linear: point.linear ?? 0,
        }))
        .sort((a, b) => a.time - b.time);

      if (maxDuration > 0) {
        newTimeline = newTimeline.filter((point) => point.time < maxDuration);
      }

      if (newTimeline.length === 0 || newTimeline[0].time !== 0) {
        newTimeline.unshift(createBlackPoint(0));
      }

      if (maxDuration > 0) {
        const lastPoint = newTimeline[newTimeline.length - 1];
        const isLastBlackEnd =
          lastPoint &&
          lastPoint.time === maxDuration &&
          lastPoint.color.R === 0 &&
          lastPoint.color.G === 0 &&
          lastPoint.color.B === 0;

        if (!isLastBlackEnd) {
          newTimeline.push(createBlackPoint(maxDuration));
        }
      }

      normalizedTable[armorIdx][partIdx] = newTimeline;
    }
  }

  return normalizedTable;
}

export default normalizeActionTable;
