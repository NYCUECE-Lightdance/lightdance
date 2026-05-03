# LightDance 前端渲染邏輯與效能優化

從 React 元件樹、Redux 狀態流、播放渲染管線到效能優化決策的完整說明。
適合需要修改前端程式碼或排查效能問題的開發者。

---

## 1. 元件樹與渲染架構

```
App (React Router + PersistGate + Redux Provider)
 └── Home (pages/Home.jsx)  ← 核心編輯器頁面
      ├── Palette            ← 調色盤（顏色選擇、最愛顏色）
      ├── People             ← 人物渲染容器
      │    ├── Armor ×7      ← 每位舞者的 SVG 燈光模型（最多 7 位）
      │    └── AccessoryPanel ← 配件 LED 控制面板
      ├── DancerToggle       ← 舞者顯示/隱藏切換
      ├── ControlPanel       ← 播放控制、Timeline 管理、undo/redo
      │    └── AudioPlayer   ← 音訊播放核心
      │         ├── Timeline ×N  ← 每個部位的時間軸區塊編輯器
      │         └── Waveform     ← 波形顯示 + 紅線 + 播放進度
      ├── LoadData           ← 載入/儲存下拉選單
      └── ShortcutModal      ← 鍵盤快速鍵說明
```

**關鍵渲染特徵**：
- Armor.svg 渲染 7 位舞者 × 22 個身體部位 = 154 個 SVG 元素的即時顏色
- 播放期間需要以 ≥20fps 更新所有部位的燈光顏色（依據 actionTable 中的線性插值）

---

## 2. Redux State 結構（渲染相關欄位）

```
state.profiles
  ├── data.actionTable      // 核心資料：7 舞者 × 22 部位 × N 個 time point
  │                         //   每個 time point: { time, color: {R,G,B,A}, linear }
  ├── data.music_filename   // 當前音樂檔名
  ├── currentTime           // 播放進度（ms），播放期間高頻更新
  ├── duration              // 音訊總長（ms）
  ├── fullPeaks             // 波形峰值資料（~200K samples，Float32Array）
  ├── timelineBlocks        // 衍生資料：從 actionTable 計算的時間軸顯示區塊
  ├── chosenColor           // 當前選取的顏色
  ├── history[]             // undo 歷史（最多 50 份完整 actionTable 快照）
  ├── redoStack[]           // redo 堆疊
  ├── showPart[]            // Timeline 面板顯示設定
  ├── multiSelectedBlocks[] // 多選區塊
  ├── playbackRate          // 播放速度倍率
  └── ...                   // 其他 UI 狀態
```

---

## 3. 播放渲染管線（三層分離架構）

這是 2026-05 效能優化的核心改動。原始設計中，`requestAnimationFrame` 每幀（60fps）直接 dispatch `currentTime` 到 Redux，
導致 6 個訂閱元件全部 re-render。優化後改為三層分離：

```
rAF 60fps 迴圈（waveform.jsx 的 updateProgress）
  │
  ├── [第 1 層] 紅線 DOM 直接更新（60fps）
  │      redLineRef.current.style.left = ...px
  │      完全不經過 React reconciliation
  │
  ├── [第 2 層] 進度條 DOM 直接更新（60fps）
  │      onTimeUpdate(elapsed) callback → AudioPlayer
  │      progressFlagRef.current.style.left = ...%
  │      完全不經過 React reconciliation
  │
  └── [第 3 層] Redux dispatch（每 40ms = 25fps）
         dispatch(updateCurrentTime(elapsed))
         → 觸發 Armor/AccessoryPanel 顏色更新
         → 滿足 ≥20fps 的燈光顏色更新需求
```

**設計原則**：
- 純視覺、無狀態依賴的更新（紅線移動、進度條）→ 直接 DOM 操作，不經 React
- 需要驅動元件 re-render 的更新（燈光顏色）→ Redux + React.memo 精準更新
- 節流間隔選 40ms（25fps）而非 50ms：資料以 50ms 對齊但顏色插值是連續的，25fps 確保插值過渡流暢

### 暫停狀態的紅線同步

暫停時沒有 rAF 迴圈，紅線位置透過獨立的 `useEffect` 從 Redux `currentTime` 同步：

```javascript
// waveform.jsx — 暫停/seek 時同步紅線
useEffect(() => {
  if (!isPlaying && redLineRef.current && duration > 0 && canvasWidth > 0) {
    redLineRef.current.style.left = `${(currentTime / duration) * canvasWidth}px`;
  }
}, [currentTime, isPlaying, duration, canvasWidth]);
```

### 視窗拉伸時的 canvasWidth 同步

`canvasWidth` 用於計算紅線像素位置。為確保 rAF 閉包在視窗拉伸後使用最新值：
- Resize 事件監聽器中一併更新 `canvasWidth` state
- rAF 迴圈中使用 `canvasWidthRef.current`（ref）而非閉包捕獲的 `canvasWidth` state

---

## 4. 著色操作渲染流程

使用者點擊身體部位（Armor.jsx 的 `insertArray`）時的完整渲染管線：

```
1. 使用者點擊部位
     │
2. insertArray(part) 執行
     │  dispatch(updateCurrentTime(nowTime))
     │  建構新的 actionTable（Object.entries + map + Object.fromEntries）
     │  dispatch(updateActionTable(updatedActionTable))
     │
3. Redux reducer 處理
     │  UPDATEACTIONTABLE：更新 actionTable + push history + 清空 redoStack
     │
4. Timeline.jsx useEffect 觸發
     │  直接從 actionTable 計算 timelineBlocks（不再經過 tempActionTable 中轉）
     │  dispatch(updateTimelineBlocks(...))
     │
5. React 18 自動批次處理 → 一次 render
     │  Armor.jsx：useMemo 重新計算 22 部位顏色（僅當 time/actionTable/myId 變化時）
     │  Timeline.jsx：React.memo 阻止 props 未變的 Timeline 實例 re-render
     │  AccessoryPanel.jsx：React.memo + useMemo
     │  ControlPanel.jsx：React.memo
```

**2026-05 優化的關鍵決策**：
- 移除了原本的 `tempActionTable` 中轉（cloneDeep → dispatch → useEffect），
  timelineBlocks 直接從 actionTable 計算，減少 1 次 Redux dispatch
- Redux reducer 中移除了 `JSON.stringify(actionTable)` 深度比對，
  改用 React.memo 來防止不必要的 re-render

---

## 5. Redux Store 效能配置

### Middleware 配置

```javascript
// store.js
middleware: (getDefaultMiddleware) =>
  getDefaultMiddleware({
    immutableCheck: false,     // 大型 actionTable 的遞迴檢查極度耗時
    serializableCheck: false,  // 同上：每次 dispatch 遍歷數萬節點
  }),
```

**關閉原因**：`serializableCheck` middleware 在每次 dispatch 時遞迴遍歷整個 state 樹，
檢查是否包含不可序列化的值。actionTable（7×22×N 時間點）有數萬個節點，每次 dispatch 都遍歷一遍。
這兩個 middleware 只在開發模式執行，生產建置會自動移除，關閉不影響正式環境。

### redux-persist 配置

```javascript
// store.js
const persistConfig = {
  key: "root",
  storage: debouncedStorage,   // 限制寫入頻率（最多每 2 秒一次）
  whitelist: ["profiles"],
  transforms: [
    StripEphemeralTransform,   // 剝離 history/redoStack 等大型暫態欄位
    PeaksTransform,            // fullPeaks → Float32Array 二進制儲存
  ],
};
```

**StripEphemeralTransform** 在儲存前移除以下欄位（不寫入 IndexedDB）：
- `history`（最多 50 份完整 actionTable 快照，undo 用）— 頁面刷新後從 initialState 重建
- `redoStack` — 同上
- `timelineBlocks` — 衍生資料，rehydrate 後由 Timeline useEffect 重新計算
- `multiSelectedBlocks`、`clipboard`、`currentTime` 等暫態 UI 狀態

在 rehydrate 時（outbound 方向），補回這些欄位的預設值以確保元件不會讀到 `undefined`。

**debouncedStorage**：包裝 `localforage.setItem`，限制 IndexedDB 寫入最每 2 秒一次。
連續 dispatch（如點擊著色觸發 2-3 次 dispatch）只會觸發最後一次的寫入。
`beforeunload` 事件確保關閉頁面前 flush 最後的變更。

---

## 6. React 效能優化策略

| 元件 | 優化方式 | 效果 |
|------|----------|------|
| `Armor.jsx` | `useMemo` 包裹 22 部位顏色計算 + `React.memo` | 顏色僅在 time/actionTable/myId 變化時重算 |
| `Timeline.jsx` | `React.memo`（包裹 forwardRef） | props 未變時跳過 re-render |
| `AccessoryPanel.jsx` | `React.memo` | 父元件 re-render 時不連帶更新 |
| `ControlPanel.jsx` | `React.memo` | 同上 |
| `Wave` (waveform.jsx) | `React.memo` | 同上 |
| `AudioPlayer.jsx` | 鍵盤監聽器 `useRef` 穩定化 | 不再因 currentTime 變化反覆 addEventListener |

### 鍵盤監聽器穩定化

原始寫法中，鍵盤監聽器的 `useEffect` 依賴 `[currentTime, multiSelectedBlocks]`，
播放期間 `currentTime` 每幀變化，導致每秒 60 次 `addEventListener` / `removeEventListener`。

修復後使用 ref 模式：`handleKeyDownRef` 持有最新的 handler 函數，`useEffect` 只在掛載時綁定一次：

```javascript
const handleKeyDownRef = useRef(handleKeyDown);
useEffect(() => { handleKeyDownRef.current = handleKeyDown; });

useEffect(() => {
  const stableHandler = (e) => handleKeyDownRef.current(e);
  document.addEventListener("keydown", stableHandler);
  return () => document.removeEventListener("keydown", stableHandler);
}, []); // 只掛載一次
```

---

## 7. 效能陷阱與注意事項

開發者在修改程式碼時應注意以下事項：

1. **不要在 rAF 迴圈中 dispatch 到 Redux**：播放期間的 `currentTime` 更新應透過 rAF 直接操作 DOM（紅線、進度條），僅以較低頻率（≤25fps）dispatch 到 Redux 驅動顏色更新。

2. **不要在 Redux reducer 中使用 `JSON.stringify` 做深度比對**：對大型巢狀結構這極度耗時。改用 React.memo + useSelector 的 shallow comparison 來防止不必要的 re-render。

3. **大型暫態資料不應被 redux-persist 持久化**：`history`（undo 快照）這類資料應透過 `createTransform` 在 persist 前剝離，頁面刷新後從 initialState 重建。

4. **開發輔助 middleware 對大型 state 的開銷**：`serializableCheck` 和 `immutableCheck` 在 state 很大時會顯著影響效能。若 state 結構單純（純 object/array/number），可安心關閉。

5. **useSelector 應盡可能細粒度**：避免在單一 `useSelector` 中訂閱大量不相關的欄位，否則任何一個欄位變化都會觸發整個元件 re-render。

6. **inline callback 會破壞 React.memo**：傳給 memo 子元件的 callback prop 應使用 `useCallback` 包裹，否則每次 render 都是新 reference，memo 形同虛設。
