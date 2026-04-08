## 🐛 Phase 0.5 驗收回報的待辦事項

- [ ] **Blink 不要拆成 N 對 keyframe**：使用者回報目前 `applyBlink` 把單一 block 展開成多個彩/黑 keyframe 後，難以選取與修改。
  - **新規格**：閃爍應該是 segment 的 metadata（例如 `seg.effect = { type: 'blink', period: 100 }`），硬體輸出 (`upload_items`) 時才展開成實際的 50ms 取樣序列；UI 上仍然是「一個 block」可整段選取/拖曳/刪除。
  - **依賴**：需要 Phase 4 segment 模型先到位，才能在 segment 上掛 effect 欄位。在那之前 `applyBlink` 維持現狀。
  - **回報日期**：2026-04-08

## 🚨 重構前置：需要使用者回答的問題 (Phase 1 Audit)

> 在開始 segment 重構前，必須先對齊以下資訊。每答完一題就在這裡記錄答案。

- [ ] **Q1. audioplayer.jsx (1761 行) 的互動清單**
  - 它對 actionTable 有 27 處讀寫，內含自己的一份 `insertArray` 與 `blackthreshold = 10`
  - 與 [Armor.jsx](frontend/src/components/Armor.jsx) 的 `insertArray` 是兩份重複實作
  - 需釐清：時間軸上有哪些互動（拖曳？剪刀？快捷鍵？右鍵選單？）
  - 與 ControlPanel 的職責邊界？
  - 答案（Claude 分析 2026-04-07，使用者請審閱補充）：

    **檔案分工釐清**
    - `audioplayer.jsx` (1761 行)：時間軸**外殼** + 全域工具列 + 全域快捷鍵 dispatcher + 跨 part 操作（複製/貼上/平移/批次效果）
    - `Timeline.jsx` (658 行)：**單一 part 軌**內的色塊渲染與互動（click/shift-click/拖移/resize）。這才是真正「色塊本體」的家
    - 兩者重構時必須一起改，誰都不是 dead

    **A. audioplayer.jsx 工具列按鈕（render 部分 L1410–1702）**
    | 按鈕 | 函式 | 行為 |
    |---|---|---|
    | 🎵 音樂下拉 | `handleMusicChange` | 切換 musicFilename |
    | ↔ Shift | `handleShiftStep` / `executeTimeShift` (L1321/1348) | 三步驟引導：選 start → end → target，把區間內所有 armor/part 的點整體平移 |
    | ✨ Effect | `handleEffect` | 開選單：漸變 (L) / 頻閃 (B) |
    | ← / → | `handleGoLeft` / `handleGoRight` (L987/1029) | 跳到當前 part 的上/下個 keyframe，會 skip 距離 10ms 的黑色斷點 |
    | ✂ Cut | `handleCut` (L1074) | 在 currentTime 把選中色塊**切成兩段**：linear 段會算插值色，並插一個 `currentTime - 10ms` 的黑點 |
    | 🗑 Delete | `ClickedDelete` → `handleMultiDelete` (L771) | 把選中區間整段塗黑、刪掉中間多餘 keyframe |
    | 亮度下拉 | `handleBrightnessChange` (L1243) | 改選中 block 的 alpha |
    | 🎨 Color | `ClickedColorChange` (L943) | 開 colorpicker，套到 `multiSelectedBlocks` 全部 |
    | 速度 / Play / Zoom / Volume | 純播放器控制 | 不動 actionTable |

    **B. audioplayer.jsx 全域快捷鍵 (`handleKeyDown` L361–529)**
    | 鍵 | 動作 |
    |---|---|
    | Space | play/pause |
    | ← / → | currentTime ±50ms |
    | Shift+← / Shift+→ | `handleGoLeft/Right`（跳 keyframe） |
    | C | `handleCut` |
    | M | `ClickedColorChange` |
    | L | `handleSetLinear`（切換選中 block 的 linear flag） |
    | B | `applyBlinkEffect`（prompt 輸入週期，產生頻閃序列） |
    | Del / Backspace | `handleMultiDelete` |
    | 1–8 | `handleFavoriteColorChoose`（套最愛色到選中 block） |
    | Shift+1–8 | `handleFavoriteColorInsert` → `insertFavoriteColorArray` (L544) — **這就是 audioplayer 內第二份 `insertArray`，5 分支 + blackthreshold=10**，與 [Armor.jsx](frontend/src/components/Armor.jsx) 重複 |
    | Ctrl+1–9 / Ctrl+0 | `handleAlphaChoose`（設選中 block alpha = N/10） |
    | Ctrl+C | `handleCopy` (L235) — 區間複製，記下 `[startTime, endTime]` 與 `sourceBlocks`，進入 copy mode banner |
    | Ctrl+V | `handlePasteAlignedToTarget` → `executeAdvancedPaste` (L294)：以目標 block 對齊複製內容首點，套 trim + `ensureBlackBefore` 補黑 |
    | Ctrl+Shift+V | `handlePasteFixedTime`：保留原始時間貼上 |
    | Shift+C / Shift+V | `handleWholeCopy` / `handleWholePaste` (L1142/1179)：整條 part timeline 覆蓋複製貼上 |
    | Esc | 取消 copy mode |

    **C. audioplayer.jsx 內 actionTable 寫入點清單（27 處的源頭）**
    1. `useEffect` colorChange (L189) — 多選變色
    2. `executeAdvancedPaste` (L294) — 區間貼上 + trim + ensureBlackBefore
    3. `insertFavoriteColorArray` (L544) — **重複的 insertArray，5 分支黑點邏輯**
    4. `handleFavoriteColorChoose` (L700) — 多選改色
    5. `handleAlphaChoose` (L719) — 多選改 alpha
    6. `handleMultiDelete` (L771) — 區間塗黑 + removeDuplicateBlackBlocks
    7. `handleSetLinear` (L837) — 切 linear flag
    8. `applyBlinkEffect` (L852) — 產生 `(色, 黑-10ms)` 配對的頻閃序列
    9. `removeDuplicateBlackBlocks` (L919) — 連續黑點清理（重構後可整個刪）
    10. `handleCut` (L1074) — 切段 + 補黑點
    11. `handleWholePaste` (L1179) — 整條覆蓋
    12. `handleBrightnessChange` (L1243) — 多選改 alpha
    13. `applyGradientEffect` (L1287) — 漸變參數套到「每隔 2 格」的 block alpha（耦合「色, 黑」配對假設）
    14. `executeTimeShift` (L1348) — 區間平移 + ensureBlackBefore + cleanup

    **D. Timeline.jsx 內的互動（單一軌）**
    - L84：mouseDown → `dispatch(updateTempActionTable)` 把 actionTable 複製到 tempActionTable 開始拖曳
    - L181：mouseUp → 把 tempActionTable commit 回 actionTable
    - L196–234：click / shift-click 選單一/多個 block（純黑 block 點到會清空選擇）
    - L240–340：mouseMove 拖曳 — 根據 `hoveredBlock.leftindex / rightindex` 改 block 邊界，會同時動相鄰黑色斷點（**這就是「色塊不是一級物件」最痛的證據：拖曳要同步改 3 個 keyframe**）
    - 用了已標記 dead 的 `tempActionTable`，**所以 Phase 0 把 tempActionTable 列為 dead 是錯的**，應留待 Phase 4 重構拖曳一起處理

    **E. ControlPanel 的職責邊界**
    - ControlPanel：左側 timeline 列表管理（選 part / 顯隱 / 增刪 / 排序）+ 右側塞 audioplayer
    - audioplayer：時間軸本體 + 工具列 + 全域快捷鍵
    - 兩者**沒有功能重疊**，但 ControlPanel 也有 `handleKeyDown` 處理 W/S/A/D + Ctrl+Z/Y，**與 audioplayer 的 handleKeyDown 是兩套同時掛在 document 上的監聽器**——重構時要小心衝突

    **🚨 立刻可記下的待修正項目（Phase 0/1）**
    - [ ] todo.md 的 Phase 0「刪 tempActionTable」要改成「待 Phase 4 重構 Timeline.jsx 拖曳邏輯時一併清理」
    - [ ] Phase 0「刪 playbackRate」要改成「保留」——audioplayer L91 / L982 `handleSpeedChange` 有用
    - [ ] audioplayer.jsx + ControlPanel.jsx 兩個 document keydown listener 並存，重構時需統一到單一 KeyboardManager
    - [ ] `applyGradientEffect` 寫死「每隔 2 格 = 色+黑配對」，是 segment 重構時的 hard case：要先轉換成 `segmentsToKeyframes` 再重建
    - [ ] `handleCut` / `applyBlinkEffect` / `executeTimeShift` / `executeAdvancedPaste` 都用 `blackthreshold = 10`，全部要在 Phase 4 移除
    - [ ] Timeline.jsx 拖曳邏輯（L240–340）就是 segment 模型的最大殺手 app，重構後預期可從 ~100 行縮成 ~20 行

- [ ] **Q2. linear flag 的真實使用率**
  - 從 mongo `raw_json` 撈幾筆 production 資料統計：
    - `linear === 1` 的關鍵格數量
    - linear 段的下一格通常是純黑（漸到熄滅）還是另一顏色（漸到新色）
    - 是否有「連續多個 linear === 1」的鏈式漸變
  - 影響：新模型 (A 段內漸變) 對鏈式漸變會拆段，需驗證 byte-equal
  - 答案：_(待填)_

- [ ] **Q3. 50ms 是真的硬體單位嗎？**
  - 韌體實際 tick 是 50ms / 25ms / 其他？
  - `blackthreshold = 10ms` 不對齊 50ms 網格，是 bug 還是刻意？
  - 新模型 `start/end` 該存「ms」還是「50ms tick」？建議存 ms 但 invariant `% 50 === 0`
  - 答案：_(待填)_

- [ ] **Q4. 點光衣放色時，segment 的預設長度？**
  - (a) 50ms — 跟現況最像
  - (b) 1 秒
  - (c) 按住拖曳決定長度
  - 答案：_(待填)_

- [ ] **Q5. 後端「不變」承諾的範圍**
  - ✅ Mongo schema (color/raw_json) 不變
  - ✅ `upload_items` payload shape 不變
  - ✅ `upload_raw` 收 `{raw_data: JSON-string}` 外殼不變
  - ❓ **`upload_raw` 內 raw_data 字串的內容形狀可變嗎？**（建議：可變，前端自己讀寫的黑盒子，存 segment JSON 後端不關心）
  - ❓ 韌體拉的 `/api/items/...` PlayerData 必須 byte-equal — 這是 hard constraint，確認無誤
  - 答案：_(待填)_

---

## 🧹 Phase 0：Cleanup PR（純減法，無功能變動，先做）

> 這些清理可獨立 ship，把 segment 重構的雜訊砍掉 30%。

### Redux 死代碼（[profiles.js](frontend/src/redux/reducers/profiles.js) / [actions.js](frontend/src/redux/actions.js)）
**✅ 確認可刪（2026-04-07 已 grep 驗證）**
- [ ] `UPDATETIMELINEBLOCK`（單數）+ `updateTimelineBlock`：export 但 reducer 無 case，全專案無 dispatcher
- [ ] `UPDATEHISTORY` + `updateHistory`：reducer L156 有 case 但全專案無 dispatcher
- [ ] `UPDATE_IS_DIRTY` + `updateIsDirty`：export 但 reducer 無 case，無 dispatcher
- [ ] `UPDATEMAGNETACTIVE` + `updateMagnetActive` + `magnetActive`：全專案 0 讀寫

**❌ 不能刪（原 todo 寫錯）**
- ~~`tempActionTable`~~：Timeline.jsx 拖曳 staging buffer，多處讀寫
- ~~`timelineBlocks`~~：Timeline.jsx L182 dispatch、audioplayer/Timeline 共 11 處讀
- ~~`isColorChangeActive`~~：audioplayer L191/962、Timeline L112，套色流程必需
- ~~`playbackRate`~~：waveform.jsx 5 處 + audioplayer 速度下拉
- ~~`fullPeaks`~~：waveform.jsx 6 處，波形渲染必需

**保守保留**
- `clipboard.sourceArmorIndex / sourcePartIndex / sourceBlocks`：似乎只給 copy mode banner UI 用，重構時再清

### 死檔案（2026-04-07 已 grep 驗證）

**✅ 確認可刪**
- [ ] [frontend/src/Block.js](frontend/src/Block.js) — 全 src 無 import
- [ ] [frontend/src/pages/ex.js](frontend/src/pages/ex.js) — 全 src 無 import
- [ ] [frontend/src/components/audio/audioUploadBtm.jsx](frontend/src/components/audio/audioUploadBtm.jsx) — 全 src 無 import
- [ ] [frontend/src/components/audio/WaveSurferplayer.jsx](frontend/src/components/audio/WaveSurferplayer.jsx) — 唯一 import 在 EditActionTable.jsx:5 且 L191 已註解使用；**步驟：先把 EditActionTable.jsx L5 import 與 L191 註解拿掉，再刪此檔**

**❌ 不能刪**
- ~~musicsrc 是空目錄~~：錯，裡面有 13 個 mp3 且 waveform.jsx L4-23 hardcode import
- ~~Timeline.jsx~~：audioplayer L12/1397 使用，色塊互動本體

**順手清（同 PR 內）**
- [ ] [audioplayer.jsx:11](frontend/src/components/audio/audioplayer.jsx#L11) `import { musicNames }` 全檔未使用
- [ ] [waveform.jsx:4-30](frontend/src/components/audio/waveform.jsx#L4) hardcode 13 個 mp3 import + `musicList`/`musicNames` export 全檔未實際使用（L503 是註解，唯一外部 consumer audioplayer 的 import 也未使用） → 砍掉 30 行 + 連帶刪整個 musicsrc 目錄（13 個 mp3）

### 統一常數
- [ ] 建立 `frontend/src/constants/parts.js` 集中部位定義
  ```js
  export const PARTS = [
    { key: 'hat',   label: '帽子' },
    { key: 'face',  label: '臉' },
    // ...
    { key: 'board', label: '板子', virtual: true },
  ];
  export const PART_COUNT = 14;
  ```
- [ ] 把 [Armor.jsx](frontend/src/components/Armor.jsx) / [ControlPanel.jsx](frontend/src/components/ControlPanel.jsx) / [EditActionTable.jsx](frontend/src/pages/EditActionTable.jsx) / [Item.jsx](frontend/src/components/Item.jsx) 4 份重複的 partName 改成 import
- [ ] 修正現有 `board` 索引在不同檔案算法不一致的潛在 off-by-one

### 統一 undo/redo
- [ ] [EditActionTable.jsx](frontend/src/pages/EditActionTable.jsx) 自己的 `history` / `historyIndex` local state 改用 redux 的 `UPDATEUNDO` / `UPDATEREDO`
- [ ] 確認 audioplayer 是否還有第三套 undo/redo

### 後端
- [ ] 決定 `保留最近 5 筆` 淘汰邏輯（[main.py:294](backend/main.py#L294), [main.py:329](backend/main.py#L329)）的去留：刪除註解 / 啟用 / 改其他清理機制

---

## ⚠️ 重構過程預期會踩的雷（Phase 2+ 進行時對照）

- [ ] **redux-persist 舊資料**：localStorage 內可能殘留 keyframe 格式，store rehydrate 與 `loadProject` 都要 lazy migrate
  - 對策：在 data 內加 `schemaVersion: 2` 區分新舊
- [ ] **byte-equal 驗證腳本邊界覆蓋**
  - 空 actionTable
  - 連續黑色哨兵
  - linear === 1 鏈式漸變
  - duration 邊界（最後一個 keyframe == duration）
  - 同時間多個 keyframe（髒資料）
  - 每位 production 使用者各 1 筆真實資料
- [ ] **轉換器方向**：傾向只做單向 `keyframesToSegments`，新存檔直接存 segment（前提：Q5 確認 raw_data 內容可變）
- [ ] **trim + 50ms 對齊順序**：所有寫入路徑「先 quantize 50ms，再 trim」
- [ ] **segment id 生成**：`crypto.randomUUID()` 或單調遞增整數
- [ ] **拖曳中間狀態**：拖曳期間用 local state / `tempSegment`，放手才 commit；或 reducer 內 history coalesce
- [ ] **showPart W/S 跨軌跳轉**：基於最近 segment 重寫
- [ ] **音樂 duration race**：duration 還沒讀到就有 segment 寫入時的處理

---

## 📋 修正後的執行 Roadmap

### Phase 0  Cleanup PR (純減法)
見上方「Phase 0」清單

### Phase 0.5  抽 utils + 拆 audioplayer.jsx（已規劃 2026-04-07）

> 詳細規劃：把 1761 行的 audioplayer.jsx 拆成 9 個元件 + 8 個 utils 純函式。
> 為 Phase 4 segment 重構與 Phase 6 多軌音訊鋪路。
> 每一步可獨立 ship/rollback，每步都跑驗收 checklist。

#### Step 1：抽 utils 純函式（無 React，無 redux）

每個 util 簽名一律 `(actionTable, args) => newActionTable`，呼叫端負責 dispatch。
**設計約束**：第一個參數是「資料」，不寫死「色塊」字眼，未來換 segment 改 payload 不改簽名。

- [ ] `utils/actionTable/search.js` — 來源：Armor.jsx + audioplayer.jsx 兩份 `binarySearchFirstGreater`
  - 簽名：`(arr, target) => index`
- [ ] `utils/actionTable/insertColor.js` — 來源：Armor `insertArray` + audioplayer `insertFavoriteColorArray`
  - 簽名：`(actionTable, {armor, part, time, color, duration}) => newTable`
  - **兩份重複實作合一**，5 分支黑點邏輯封裝
- [ ] `utils/actionTable/cut.js` — 來源：audioplayer `handleCut`
  - 簽名：`(actionTable, {armor, part, blockIndex, currentTime}) => newTable`
  - 含 linear 段插值計算
- [ ] `utils/actionTable/blink.js` — 來源：audioplayer `applyBlinkEffect`
  - 簽名：`(actionTable, {armor, part, blockIndex, period, viewBlock, isLinear, targetEndBlock}) => newTable`
  - viewBlock 從 timelineBlocks 算出後傳入，util 不碰 redux
- [ ] `utils/actionTable/gradient.js` — 來源：audioplayer `applyGradientEffect`
  - 簽名：`(actionTable, {armor, part, blockIndex, startColor, endColor}) => newTable`
  - **重新規格 (B6)**：改成首尾顏色，預設取前後最近色塊
- [ ] `utils/actionTable/shift.js` — 來源：audioplayer `executeTimeShift`
  - 簽名：`(actionTable, {start, end, target}) => newTable`
- [ ] `utils/actionTable/paste.js` — 來源：audioplayer `executeAdvancedPaste` + `ensureBlackBefore`
  - 簽名：`(actionTable, {targetArmor, targetPart, offset, copiedData, blackthreshold}) => newTable`
- [ ] `utils/actionTable/deleteRange.js` — 來源：audioplayer `handleMultiDelete` + `removeDuplicateBlackBlocks`
  - 簽名：`(actionTable, {selections, timelineBlocks}) => newTable`

**單元測試（vitest 或 jest）**：每個 util 寫 2–4 個 test
- 正常 case
- Edge：空 actionTable、邊界 time（0 / duration）、連續黑色斷點
- Edge：選中色塊在頭/尾
- 對 `gradient.js` 測「無前後最近色塊」的 fallback

#### Step 2：audioplayer.jsx 內改呼叫 utils（不拆檔）

- [ ] `handleCut` → `cutAt(actionTable, ...)`
- [ ] `applyBlinkEffect` → `applyBlink(actionTable, ...)`
- [ ] `applyGradientEffect` → `applyGradient(actionTable, ...)`（同步改成新規格）
- [ ] `executeTimeShift` → `shift(actionTable, ...)`
- [ ] `executeAdvancedPaste` → `paste(actionTable, ...)`
- [ ] `handleMultiDelete` → `deleteRange(actionTable, ...)`
- [ ] `insertFavoriteColorArray` → `insertColor(actionTable, ...)`
- [ ] Armor.jsx `insertArray` → `insertColor(actionTable, ...)`（順手把兩份合一）
- [ ] **手測完整驗收 checklist**，行為應與重構前完全相同

#### Step 3：UI 元件拆分（依依賴順序，每拆一個跑一次驗收）

| # | 新元件 | 行數估 | 從 audioplayer 搬走什麼 |
|---|---|---|---|
| 1 | `MusicSelector.jsx` | ~50 | fetchMusicList + handleMusicChange + dropdown JSX |
| 2 | `PlayerControls.jsx` | ~120 | Play/Pause、Speed、Volume、Zoom、Time 顯示 |
| 3 | `EffectMenu.jsx` | ~150 | effect 按鈕 + 子選單 + 漸變 popup |
| 4 | `ShiftTool.jsx` | ~100 | shift 三步驟引導 + markers |
| 5 | `TrackToolbar.jsx` | ~150 | ← → / Cut / Delete / Brightness / Color |
| 6 | `CopyPasteManager.jsx` | ~200 | handleCopy / executeAdvancedPaste / Whole 系列 + copy mode banner + isCopying state |
| 7 | `KeyboardShortcuts.jsx` | ~150 | 整段 handleKeyDown |
| 8 | `AudioPlayer.jsx`（重構後外殼） | ~150 | 剩下：state 容器 + 組合 + Waveform/Timeline layout |

- [ ] # 1 MusicSelector.jsx
- [ ] # 2 PlayerControls.jsx
- [ ] # 3 EffectMenu.jsx
- [ ] # 4 ShiftTool.jsx
- [ ] # 5 TrackToolbar.jsx
- [ ] # 6 CopyPasteManager.jsx
- [ ] # 7 KeyboardShortcuts.jsx
- [ ] # 8 AudioPlayer.jsx 收尾

**狀態歸屬**
| state | 新家 | 理由 |
|---|---|---|
| `isPlaying`, `sourceNode`, `prevTimeRef`, `isExternalSeekRef` | `AudioPlayer.jsx` (lift up) | 多元件需要 |
| `volume`, `zoomLevel` | `PlayerControls.jsx` | 只與 Waveform 共用 |
| `brightness` | `TrackToolbar.jsx` | 只有它用 |
| `effectMenuVisible`/`effectType`/`gradientSettingsVisible`/`startBrightness`/`interval`/`endBrightness` | `EffectMenu.jsx` | 完全內封 |
| `shiftStep`/`shiftTimes` | `ShiftTool.jsx` | 完全內封 |
| `apiMusicList` | `MusicSelector.jsx` | 完全內封 |
| `isCopying` | `CopyPasteManager.jsx` 用 Context 提供（**不放 redux**） | UI ephemeral state，重新整理該歸零 |

**跨元件溝通：Context + useSelector 混用**
- 頻繁變動的資料（actionTable / currentTime / multiSelectedBlocks / duration）→ 各元件直接 `useSelector` 拉，靠 redux selector memo 控 re-render
- 穩定的 callback handlers → 放 `EditorContext`，value 用 `useMemo` 包，內部用 `store.getState()` 即時取資料避免依賴牽連
- isCopying 與相關 callback → 開獨立 `CopyPasteContext`（作用域只有 audio editor 子樹）
- **不**為了求方便把所有東西塞 redux

#### Step 4：統一 keydown listener

- [ ] 列出 audioplayer.jsx 全部快捷鍵 vs ControlPanel.jsx 全部快捷鍵的對照表
- [ ] 把 ControlPanel 的 W/S/A/D + Ctrl+Z/Y 搬進 KeyboardShortcuts.jsx
- [ ] 移除 ControlPanel 自己的 document keydown listener
- [ ] 用 keymap 物件統一 dispatch，避免雙 listener 撞鍵

#### Step 5：最終資料夾結構

```
frontend/src/
├── components/audio/
│   ├── AudioPlayer.jsx          ← 重構後外殼
│   ├── MusicSelector.jsx
│   ├── PlayerControls.jsx
│   ├── TrackToolbar.jsx
│   ├── EffectMenu.jsx
│   ├── ShiftTool.jsx
│   ├── CopyPasteManager.jsx
│   ├── KeyboardShortcuts.jsx
│   ├── EditorContext.js
│   ├── Timeline.jsx              ← 不動（留 Phase 4）
│   └── waveform.jsx              ← 不動
└── utils/actionTable/
    ├── search.js
    ├── insertColor.js
    ├── cut.js
    ├── blink.js
    ├── gradient.js
    ├── shift.js
    ├── paste.js
    └── deleteRange.js
```

#### 驗收 checklist（每個 step 都跑）

- [ ] 點光衣放色 → 時間軸顯示色塊
- [ ] 拖曳色塊邊緣 resize
- [ ] click 選色塊、shift+click 多選
- [ ] Ctrl+C / Ctrl+V 區間複製貼上
- [ ] Shift+C / Shift+V 整條複製貼上
- [ ] L 鍵切 linear，預覽看到漸變
- [ ] B 鍵頻閃
- [ ] Shift 工具三步驟平移
- [ ] Cut / Delete
- [ ] W/S/A/D 跨軌跳格
- [ ] Ctrl+Z / Ctrl+Y
- [ ] Output 上傳，PlayerData 與重構前 byte-equal（mongo diff）

#### 風險與對策

| 風險 | 對策 |
|---|---|
| 拆檔過程行為改變難察覺 | 每拆一個元件就跑驗收 checklist |
| Context 過度 re-render | EditorContext value 用 useMemo + 內部 store.getState()，依賴只放 dispatch |
| Timeline.jsx 內部還在直接讀 redux | Phase 0.5 不動 Timeline.jsx 內部，留 Phase 4 |
| utils 簽名定錯，Phase 4 又要改 | 設計時模擬「換成 segments[] 簽名還合理嗎」 |
| ControlPanel 快捷鍵搬走後漏掉 case | 搬之前先做對照表 |

---

### Phase 1  Audit & Spec
- [ ] 使用者回答上方 Q1~Q5
- [ ] 細讀 [audioplayer.jsx](frontend/src/components/audio/audioplayer.jsx) 全文，列出所有編輯互動
- [ ] 寫 segment schema + invariants 文件（更新 CLAUDE.md）

### Phase 2  轉換器 + 驗證腳本
- [ ] 寫 `frontend/src/utils/segments.js`：`keyframesToSegments()`
- [ ] 寫驗證腳本：拿 production raw_json 跑 keyframes → segments → 壓平 upload_items，與直接 keyframes 壓平 byte-equal diff
- [ ] 全綠才能進 Phase 3

### Phase 3  Lazy migrate + 唯讀 segment 渲染
- [ ] store rehydrate / loadProject 自動轉換成 segment
- [ ] [Armor.jsx](frontend/src/components/Armor.jsx) render 改吃 segment（getColorForPart）
- [ ] [ControlPanel.jsx](frontend/src/components/ControlPanel.jsx) 時間軸 render 改吃 segment
- [ ] [audioplayer.jsx](frontend/src/components/audio/audioplayer.jsx) render 改吃 segment
- [ ] 寫入路徑暫時保留 keyframe（透過反向 segment→keyframe），確保混合期可運作

### Phase 4  寫入路徑切換
- [ ] 寫 `insertSegment` / `dragSegment` / `resizeSegment` / `deleteSegment` utils
- [ ] [Armor.jsx](frontend/src/components/Armor.jsx) `insertArray` 改呼叫 utils
- [ ] [audioplayer.jsx](frontend/src/components/audio/audioplayer.jsx) 內各個 `insertArray` / `ensureBlackBefore` 改呼叫 utils（與 Armor 共用）
- [ ] [EditActionTable.jsx](frontend/src/pages/EditActionTable.jsx) 改編輯 segment
- [ ] 移除所有 `blackthreshold = 10` 與 `cleanActionTableByDuration` 補黑邏輯
- [ ] [Home.jsx](frontend/src/pages/Home.jsx) `handleOutput` 50ms 取樣改從 segment 直接取
- [ ] `upload_raw` 內容改存 `schemaVersion: 2` 的 segment JSON

### Phase 5  解鎖新功能（燈光 segment）
- [ ] DAW 風拖曳移動色塊（segment 中央 = move cursor）
- [ ] 拖邊 resize segment（segment 邊緣 ±5px = resize cursor）
- [ ] Ctrl 框選多個色塊
- [ ] 複製 / 貼上 / 平移 segment
- [ ] segment 量化 / 對齊節拍

### Phase 6  多軌音訊（DAW 風音樂編輯，長期目標）

> 願景：音軌也像色塊一樣可拖曳、可拼貼多個音軌。修改音樂時不用重新上傳整首。

**設計鋪墊（Phase 0.5/2/4 就要避免反向決策）**
- [ ] segment utils 介面設計成 generic `Segment<T>`，不要寫死 `colorStart/colorEnd`
  - 例：`insertSegment(segments, newSeg, { collisionStrategy: 'trim' })` 不關心 payload
- [ ] 拖曳/resize/move 的 UI 邏輯（重構後的 Timeline.jsx）要能被音軌複用
- [ ] 50ms 時間網格量化、trim collision、id/多選/undo coalesce 都做成 generic

**音訊 segment 資料模型（草案）**
```js
audioTracks = [
  {
    id, name,
    segments: [
      { id, start, end, sourceFile, sourceOffset, volume, fadeIn, fadeOut },
      ...
    ]
  },
  ...
]
```
與燈光 segment **幾乎同構**，差別只在 payload 欄位。

**後端改動**
- [ ] mongo 新 collection `audio_tracks` 或在 `raw_json` 內新增 `tracks` 陣列
- [ ] `upload_music` 維持不變（音檔池），新增「專案 ↔ 音軌 ↔ 音檔」關聯
- [ ] 韌體不關心音訊（只吃 PlayerData），所以後端 `color`/`upload_items` 路徑不變

**前端 Waveform 重新設計**
- [ ] 目前 waveform.jsx 是「整條時間軸只播一個音檔」的單軌設計（單一 sourceNode），需重寫成：
  - 一個 AudioContext + N 個 AudioBufferSourceNode mix
  - 每軌獨立 gain node
  - 預先 decode 所有引用的音檔，cache 成 AudioBuffer
  - 多軌共用 master timeline 與 currentTime
- [ ] Phase 0/0.5 拆檔時避免把「單軌假設」更深地綁進新元件

**注意事項**
- 這是大工程，不應 block 燈光 segment 重構
- 音軌 segment 與燈光 segment 共用 Timeline UI 框架，但各自有獨立的 redux state
- 修改音樂的工作流程：把音軌素材切段、拼貼、調整 fade，最後不需要重新上傳音檔（音檔池保持不變）

---

## UI 小修
- timeline-settings-block 與對應之 timeline 沒對齊，甚至有時候高度不相同
- lefttool-container 及 controls 中按鈕縮小

## 重構：色塊資料模型 keyframe → segment

詳細設計與動機見 CLAUDE.md「色塊資料模型重構計畫」章節。

**核心決策（已拍板）**
- 資料形狀：`actionTable[armor][part] = [{id, start, end, colorStart, colorEnd}, ...]`
- segment 之間**可以有間隔**，間隔 = LED 關閉 (黑)
- 時間最小單位仍為 **50ms**，所有 start/end 對齊到 50ms 網格
- 漸變語意：**(A) 段內漸變** — `colorStart → colorEnd` 在 `[start, end]` 內完成
- 拖曳碰撞策略：**trim**（被覆蓋的部分被裁掉）
- 空白區域：**黑色 (LED off)**
- **後端資料格式不變** — 換在前端，`upload_items` / `upload_raw` / mongo schema 全部維持原樣

**遷移步驟（每步可獨立 ship/rollback）**
- [ ] Step 0：寫雙向轉換器 `keyframesToSegments()` / `segmentsToKeyframes()` 放 utils
- [ ] Step 0.5：寫驗證腳本 — 對現有 raw_json，跑 `keyframes → segments → 壓平 upload_items payload`，與「直接從 keyframes 壓平」做 byte-equal diff，全部通過才繼續
- [ ] Step 1：載入時 lazy migrate（`loadProject` 拿到舊資料即轉成 segment 進 redux）
- [ ] Step 2：改 [Armor.jsx](frontend/src/components/Armor.jsx) render path（純讀取，風險最低）
- [ ] Step 3：把 `insertArray` 5 分支邏輯換成 `insertSegment(start, end, colorStart, colorEnd?)`，碰撞用 trim split
- [ ] Step 4：改 [EditActionTable.jsx](frontend/src/pages/EditActionTable.jsx) 改成編輯 segment（start/end/colorStart/colorEnd）
- [ ] Step 5：改 [ControlPanel.jsx](frontend/src/components/ControlPanel.jsx) 時間軸渲染為 segment 矩形；移除 W/S/A/D 的 skip-black 邏輯
- [ ] Step 6：改 [Home.jsx](frontend/src/pages/Home.jsx) `handleOutput` 50ms 取樣迴圈 — 對每個 tick t 找包含 t 的 segment，無則輸出黑；驗證 byte-equal 通過
- [ ] Step 7：移除 `cleanActionTableByDuration` 補黑邏輯，改成 segment clamp
- [ ] Step 8：移除 `blackthreshold = 10ms` 魔術數字
- [ ] Step 9：（可選）後端 raw_json 一次性 migration script；或永久 lazy migrate

**遷移完成後可加的新功能**
- [ ] 拖曳移動色塊（DAW 風格）
- [ ] 拖邊調整 segment 長度 (resize)
- [ ] Ctrl + 框選多個色塊
- [ ] 複製 / 貼上 / 平移 segment
- [ ] segment 量化 / 對齊到節拍

**注意事項**
- segment 不重疊是強制不變式 (invariant)，所有寫入路徑都要保證
- 單 tick 閃爍以 `start === end` 或 `end - start === 50` 表達
- segment 需要穩定 `id` (uuid 或自增)，方便多選與 undo diff
- redux history 可以用 segment id 做細粒度 diff，連續拖曳可 coalesce 成一筆 undo
