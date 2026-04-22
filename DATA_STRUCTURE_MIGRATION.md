# 數據結構遷移計劃

## 目標
從 `time` 單一時間點改為 `startTime + endTime` 雙時間點結構

## 舊結構 vs 新結構

### 舊結構
```javascript
{
  time: 100,        // 色塊開始時間
  color: {...},
  linear: 0
}
// 寬度計算: nextBlock.time - currentBlock.time
```

### 新結構
```javascript
{
  startTime: 100,   // 色塊開始時間
  endTime: 200,     // 色塊結束時間
  color: {...},
  linear: 0
}
// 寬度計算: endTime - startTime
```

## 影響範圍

### 1. Item.jsx
- `insertArray()` - 插入新色塊時需要設定 endTime

### 2. Armor.jsx
- `insertArray()` - 插入新色塊時需要設定 endTime
- `binarySearchFirstGreater()` - 改為搜尋 startTime
- `getColorForPart()` - 使用 startTime 進行二分搜尋

### 3. Timeline.jsx
- `useEffect()` (line 140-178) - 生成 timelineBlocks 時使用 startTime/endTime
- `handleMouseMove()` - 拖動時更新 startTime 和 endTime
- `handleResizeMouseDown()` - 調整寬度時修改 endTime

### 4. audioplayer.jsx
- `ClickedDelete()` - 刪除時不影響其他色塊
- `handleCut()` - 切割時分成兩個獨立的時間段
- `handleGoLeft()` / `handleGoRight()` - 使用 startTime 導航
- `handleCopy()` / `handlePaste()` - 複製貼上時處理 startTime/endTime

### 5. LoadData.jsx
- `reverseConversion()` - 從後端數據轉換時計算 endTime

## 遷移步驟

### Phase 1: 修改數據寫入邏輯
1. ✅ Item.jsx - insertArray()
2. ✅ Armor.jsx - insertArray()

### Phase 2: 修改數據讀取邏輯
3. ✅ Armor.jsx - binarySearch 和 getColorForPart()
4. ✅ Timeline.jsx - useEffect 生成 timelineBlocks

### Phase 3: 修改操作邏輯
5. ✅ Timeline.jsx - 拖動和調整寬度
6. ✅ audioplayer.jsx - 所有操作函數

### Phase 4: 修改數據加載
7. ✅ LoadData.jsx - reverseConversion()

### Phase 5: 測試
8. ✅ 測試所有功能是否正常

## 注意事項
- 向後相容: 舊數據需要自動轉換
- 保持 50ms 對齊
- 確保 startTime < endTime
- 刪除色塊時不影響其他色塊
