// 二分搜尋 — 找到 arr 中第一個 time > target 的索引
//
// 來源：原 Armor.jsx 與 audioplayer.jsx 各有一份重複實作（行為相同）。
// 此檔為合一版本，搬移自 audioplayer.jsx L674 / Armor.jsx L195。
//
// ⚠️ 行為注意（保留原版怪癖以維持 byte-equal）：
//   - 若 arr 為 falsy → 回傳 undefined（不是 -1）
//   - 若沒找到（target 大於等於所有元素）→ 回傳 0（不是 arr.length）
//     原作者顯然把 0 當「沒找到」的哨兵值，呼叫端的 splice 邏輯依賴此行為

export function binarySearchFirstGreater(arr, target) {
  if (!arr) return;
  let left = 0;
  let right = arr.length - 1;
  let result = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid].time > target) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return result;
}
