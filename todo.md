# 重構 Roadmap：keyframe → segment（2026-08-08 修訂版）

> **本文件取代 4 月版 todo.md。** 4 月版在 `jerry` 分支上制定並執行到 Phase 0.5 中段後捨棄；
> 本版基於 upstream (NYCUECE-Lightdance) 最新 main（`refract` 分支）重新稽核全部假設後修訂。
> 設計動機與已拍板決策見 CLAUDE.md「色塊資料模型重構計畫」章節。
>
> 基準狀態：audioplayer.jsx 1971 行、Timeline.jsx 1217 行、22 個部位、零測試設施。

---

## 🎯 使用者已拍板的決策（2026-08-08）

| 項目 | 決策 |
|---|---|
| 硬體 tick | 可調常數 `TICK_MS = 50`，集中於 `constants/time.js`，不寫死 |
| 點光衣放色預設長度 | **1 秒**（`DEFAULT_SEGMENT_MS = 1000`） |
| raw_data 格式 | **可以改** — 前端黑盒子，直接存 segment JSON + `schemaVersion: 2` |
| 黑色哨兵 | **徹底消滅** — 不保留 -10ms 相容規則，`blackthreshold` 從專案完全消失；f9489cf 的「黑點豁免 50ms 對齊」特例隨 v1→v2 遷移作廢 |
| 輸出等價標準 | 從 byte-equal 放寬為**結構化 diff**：所有列的 time 必須完全相同；差異只允許出現在「線性漸變內部取樣點」；幅度依漸變長度而定（見 D2 實測），預設容許最大通道差 16；其他任何差異視為 bug |
| 優先順序 | 可維護性 → DAW 風燈光編輯 → 多軌音訊 |

---

## 📌 對 4 月版規劃的 16 項更正

> upstream 在 4 月版寫作後前進了 39 個 commit，以下逐項更正過時假設（2026-08-08 已逐項對照 HEAD 驗證）。

1. **tempActionTable 現在真的是死代碼** — Timeline.jsx 的 tempActionTable 拖曳整段被註解停用（L775-984），現行拖曳 = Move Mode（M 鍵、redux `moveMode`、拖曳期間 direct-DOM transform）+ 邊緣 resize。4 月版的自我修正（「列為 dead 是錯的」）需反轉：**可刪**。
2. **快捷鍵已變**：`M` = toggleMoveMode、`P` = 改色（原本 M）；`B` 會 prompt 50ms 倍數週期；`handleAlphaChoose` 已刪除（Ctrl+數字 直接走 `handleBrightnessChange`）。
3. **Q3 已解**：韌體時間單位確為 50ms tick（上傳 `time = floor(ms/50)`）；黑點 -10ms 曾被 f9489cf 制度化為刻意設計，但**使用者已拍板消滅它**（見上表）。
4. **Q4 已解**：放色預設 1 秒。
5. **Q5 已解**：raw_data 可改存 v2 segment 格式。
6. **上傳路徑已變**：前端只走 `POST /api/upload_full`（Home.jsx:411，一次寫 color+raw 兩個 collection）。`upload_items` / `upload_raw` 是死路徑。輸出等價的比對目標 = `handleOutput` 產生的 `players` 陣列。
7. **死檔清單修正**：**新增 `components/Item.jsx`**（415 行全死，含一份 insertArray 與過時 7 部位名稱）；**移除 WaveSurferplayer.jsx**（EditActionTable.jsx:5 引用、`/edit` 路由活著）；musicsrc/ 仍被 musicData.js 引用（Home.jsx:23、waveform.jsx:4），不可用 4 月版理由刪。
8. **寫入者清單過時**：audioplayer.jsx 1761→1971 行，新增 `handleUniformSameColorAlphaChange`（L1502）；`blackthreshold=10` 聲明在 **5 個檔案**（audioplayer:104、Timeline:58、Armor:19、Item:19、AccessoryPanel:64）；insertArray 黑點邏輯重複 **4 份**（Armor:100、audioplayer:578、Item:53、AccessoryPanel:64）。
9. **部位模型過時**：14 → **22**（14 身體 + 8 飾品 acc0-7）。新增 AccessoryPanel.jsx + `config/accessoryConfig.js`（`isPartAllowed` 閘門）。部位名稱重複 **6 處聲明 / 5 個檔案**；`PART_COUNT=22`（Home.jsx:33）、`TOTAL_PARTS=22`（LoadData.jsx:11）。
10. **undo 機制已變**：歷史在 `UPDATEACTIONTABLE` reducer case 內自動 push（profiles.js:100-115，cap 50，`skipHistory` 逃生口）。剩餘問題只有 EditActionTable.jsx 的獨立 local `useState` history。
11. **持久化現況**：redux-persist 走 localforage/IndexedDB、2s debounce、StripEphemeralTransform + PeaksTransform，**無 version/migrate hook**。且存在 4 月版未提及的**第三條載入路徑**：`utils/indexedDB.js` 本地備份（原樣存 keyframe actionTable、無版本欄位）。
12. **新增約束**：`docs/frontend-rendering-optimization.md` 記載的零 re-render 拖曳路徑（rAF 三層分離、direct-DOM、React.memo）必須保留（見 Phase 5 驗收）。
13. **新發現問題**：actionTable 容器型別不一致 — Home.jsx normalize 產 **array**、LoadData.jsx / sanitizeActionTable.js / Armor.jsx / AccessoryPanel.jsx 寫 **object**（key "0".."21"）、audioplayer 用 `.map`。Phase 1 統一為 array。
14. **舊 Phase 0.5 廢除** — 「先寫 8 個 keyframe-native utils + 測試、segment 化後重寫」是雙重工。改為：元件拆分只做純搬移，新邏輯一律 segment-native（見 Phase 3 / Phase 5）。
15. **Q2（linear 統計）不再是 blocker** — 轉換器逐格保語意 + golden fixtures 覆蓋真實資料，無需先統計 mongo。
16. **後端不動**，但註記已知 bug：`GET /api/raw/{u}/LATEST` 查錯 collection（main.py:243，查 color 而非 raw）→ **golden fixture 擷取須用明確 timestamp 或本地備份，勿用 LATEST**。retention「保留 5 筆」邏輯是 no-op（delete 被註解），upload_full 完全無 retention — 維持現狀不處理。

---

## 🔑 四個關鍵設計決策

### D1. Golden fixture 測試安全網（動資料模型的前提）

專案目前**零測試**（無 vitest/jest/pytest，CI 唯一硬門檻是 build）。改 shape 前必須先有安全網：

- 把 Home.jsx:246-390 的 players 建構迴圈**原樣**抽成純函式 `utils/export/buildPlayers.js`（這是測試存在前唯一允許的程式碼變動；merge 前在瀏覽器 console 對真實專案做一次前後 `JSON.stringify` diff 確認）。
- Fixture 三來源，全部要：
  1. **真實本地備份**（最佳）：從隊員機器的 IndexedDB（`LightDanceBackupDB/backups`）匯出 `local_backup_*`，commit 成 `{input, expected}` 對放 `utils/export/__fixtures__/`。
  2. **mongo raw_json**：用明確 timestamp 撈（避開 LATEST bug），每位 production 使用者至少 1 筆。
  3. **合成邊界案例**：空表、鏈式 `linear===1`、漸變中途接離網格黑點、連續黑點、同時間重複 keyframe、最後 keyframe == duration、object-keyed vs array 容器、僅飾品有資料的舞者。
- Expected 輸出由抽出的 `buildPlayers` 跑一次產生後 commit；之後每個 Phase 都重跑全部 fixture。

### D2. 黑色哨兵徹底消滅 + 結構化 diff（2026-08-08 使用者拍板）

黑色色塊目前只承擔三個功能，segment 世界各有更乾淨的替代：LED 熄滅 = segment 空隙；視覺縫隙 = 真實空隙；漸變不流血 = 段內漸變語意。因此：

- `keyframesToSegments`：色 keyframe @t1 + 黑 keyframe @b → segment `{start: t1, end: ceil(b/TICK_MS)*TICK_MS}`；**所有黑點正規化上網格後丟棄**——黑色不再是資料。
- `segmentsToKeyframes`（僅供匯出壓平與過渡期 adapter 使用）：segment 後有空隙時，在**網格點 `end` 整點**輸出熄滅。不保留任何 -10ms 相容規則，**`BLACK_SENTINEL_MS` 不存在**。
- 已知且被接受的輸出差異：黑點從 `g−10` 移到 `g` 後**時間格完全不變**（`ceil((g−10)/50)*50 = g`）；唯一差異是**線性漸變**的插值分母微調（如 990→1000），只影響漸變**內部**取樣點（端點不受影響，端點在兩種算法下都是黑）。
- **誤差幅度（2026-08-08 實測，非估計）**：理論上界約 `255 × 10 / (漸變長度ms − 10)`，漸變越短誤差越大。
  - **真實 production 資料全庫實測**（2026-02-27 mongodump：336 份光表、544,673 個關鍵格）：
    **結構性差異 0**（時間格、列數、非漸變欄位全部相同）；漸變內部差異僅 **103 個欄位**；
    **最大通道差 = 2**（分布：22 份文件差 0、7 份差 1、5 份差 2）
  - 資料背景：離網格黑點 **260,866 個**（佔黑點 92%，偏移以 40ms 即 `g−10` 為主）；
    漸變關鍵格僅 **1,780 個**，且**全部**終止於離網格黑點；最短漸變 40ms
  - 合成極端案例實測：100ms 漸變 15、1000ms 漸變 2
  - 為何遠低於理論上界：短漸變跨不到一個 50ms 取樣格，不會產生內部取樣點——誤差自我限制
  > ⚠️ 修正紀錄：本計畫初稿曾寫「最多 ±1」，那是錯的（未考慮分母比例效應）。Phase 0 建立比對器時實測後更正。
- **等價測試 = 結構化 diff**（`utils/export/structuredDiff.js`）：斷言 (a) 舞者數/列數/所有 `time` 完全相同；(b) 有差異的欄位必須**兩邊 linear bit 都是 1**（即確實位於漸變內部）；(c) 最大通道差不超過容許值（預設 16，實測最大 15）；(d) 其他任何差異 = 測試失敗。round-trip 冪等（轉過去再轉回來達到不動點）為必要測試。
- 若真實資料量測出超過 16 的差異，代表現場存在比 100ms 更短的漸變——屆時再決定調高容許值或對短漸變特別處理，**用資料決定，不要臆測**。

### D3. Adapter 橋一次切換（取代 4 月版的長混合期）

4 月版「讀走 segment、寫走 keyframe」的混合期會讓資料同時活在兩種語意下數週，極難除錯。改為：

1. Phase 2 先證明轉換**冪等 + 結構化 diff 全綠**（閘門）。
2. Phase 4 **單一原子 PR**：store 換成 segments；舊寫入者各包 `withKeyframeAdapter(fn) = segs => toSegments(fn(toKeyframes(segs)))`，舊渲染改讀 memoized `selectKeyframes` selector——**既有程式碼零改動**，行為不變。
3. Phase 5 逐個把寫入者/讀取者改寫成 segment 原生並拆掉它的 adapter；全拆完刪橋。

代價：過渡期每次編輯 commit 多兩次 O(n) 轉換（拖曳過程不受影響，照走 direct-DOM）。回滾：見 D4 的 persist key bump。

### D4. schemaVersion + 三條載入路徑統一遷移

單一入口 `utils/migration/loadProjectData.js`：偵測形狀（v1 = `{time, color, linear}` 條目；v2 = `{schemaVersion: 2, actionTable: segments}`）回傳標準 v2。

- **路徑 1 redux-persist**：persist key `root` → `root_v2`，自訂 getStoredState fallback 讀舊 `root` key 並遷移。選 key bump 而非 createMigrate 是為了回滾安全：deploy revert 後舊 build 讀原封不動的舊 key。
- **路徑 2 遠端 raw_data**（LoadData.jsx fetchRawPlayerData）：parse → loadProjectData，v1 mongo 舊文件**永久**保留 lazy migrate。
- **路徑 3 本地備份**（utils/indexedDB.js）：讀取時遷移；新寫入帶 `schemaVersion: 2`；v1 讀取相容永久保留。
- 新上傳：`raw_data = JSON.stringify({schemaVersion: 2, actionTable: <segments>, ...})`，後端不解析、不改動。

---

## 🗺️ 分期 Roadmap

### Phase 0 測試安全網（S / 低風險 / **最先做，block 一切**）✅ 大致完成 2026-08-08

- [x] `npm i -D vitest`（v4.1.10）+ `vitest.config.js`；`package.json` 加 `test` / `test:watch` / `test:update-golden`；接進 `.github/workflows/pr-checks.yml`（**硬性門檻**，無 continue-on-error）
- [x] 抽出 `frontend/src/utils/export/buildPlayers.js`（Home.jsx:246-390 原樣搬），Home.jsx 改呼叫
  - 驗證方式**優於原訂的「console 手動 diff」**：直接從 git HEAD 取出舊的內嵌迴圈包成函式，與新 `buildPlayers` 在全部 fixture 上跑 `JSON.stringify` 比對 → **13/13 byte-equal**，證明抽出零行為變更
- [x] 合成邊界 fixtures（13 筆）於 `src/utils/export/__tests__/fixtures/synthetic.js`：空表、離網格黑點漸變、短漸變、鏈式漸變、連續黑點、同時間重複、網格邊界、頻閃配對、alpha 變化、僅飾品、object 容器、多舞者混合
- [x] Golden 測試 + 韌體 ABI 鎖定（欄位順序、uint32 範圍、時間遞增）：`buildPlayers.golden.test.js`
- [x] 結構化 diff 比對器 `utils/export/structuredDiff.js` + 測試（含 Phase 2 情境預演）
- [x] **真實 production fixtures 已匯入**（2026-08-08，來源：2026-02-27 mongodump 備份）
  - 匯入工具 `scripts/import-mongo-fixtures.mjs`（零依賴自製 BSON 解析器；白名單只讀 raw_json/color，**永不碰含明文密碼的 users.bson**）
  - 3 筆 fixture：`real-rich-show`（1,020 關鍵格、56 漸變）、`real-dirty-times`（非整數時間、缺 linear 欄位）、`real-legacy-9parts`（舊版 9 部位 schema）
  - 合成案例補上真實資料才暴露的三種形狀：`missing-linear-field`（真實資料 96% 的關鍵格沒有 linear 欄位）、`dirty-fractional-times`、`off-grid-color-keyframe`
  - `maxChannelDelta` 預設 16 經真實資料驗證**綽綽有餘**（實測最大 2）
- [x] **端到端 production 驗證**（`buildPlayers.production.test.js`）：斷言 `buildPlayers` 重現當時實際存進 mongo、餵給韌體的 `color` 輸出
  - ⚠️ fixture 必須挑 **2026-01-07 之後**的資料：全庫掃描顯示 2026-01-06 以前的匯出邏輯與現行版本不同（每份 126~336 欄位有差異），那是專案刻意演進的結果
  - 01-07 之後 33/37 份完全相同；剩 4 份差 1~4 欄位，推測因該批資料早於 `a99d5fc`（upload_full），當時 color 與 raw_data 是兩個獨立 POST，可能對應不同編輯狀態
- **Ship**：單一 PR。回滾：revert。

### Phase 1 清理與常數統一（M / 低風險）✅ 完成 2026-08-08

- [x] **死 redux**：刪 `UPDATETIMELINEBLOCK`（單數）、`UPDATEHISTORY`、`UPDATE_IS_DIRTY`、`UPDATEMAGNETACTIVE`/`magnetActive`、`tempActionTable`（刪除前逐一 grep 驗證零消費者）。保留：`timelineBlocks`、`isColorChangeActive`、`playbackRate`、`fullPeaks`、`moveMode`、`selectedDancerId`
- [x] **死檔**：`src/Block.js`、`src/pages/ex.js`、`components/audio/audioUploadBtm.jsx`、`components/Item.jsx`，以及 Timeline.jsx 內 210 行 `[Drag 已停用]` 註解區塊。**未刪** WaveSurferplayer.jsx 與 musicsrc/（仍在使用）
- [x] **`constants/time.js`**：`TICK_MS = 50`、`DEFAULT_SEGMENT_MS = 1000`、`LEGACY_BLACK_SENTINEL_MS = 10`（標記 @deprecated，Phase 5 刪除；此 export 消失即代表 Phase 5 完成）
- [x] **`constants/parts.js`**：`PARTS` / `PART_KEYS` / `PART_LABELS` / `PART_COUNT` / `BODY_PART_COUNT` / `PLAYER_COUNT`，取代 5 個檔案中的 6 份重複宣告；buildPlayers 的 22 行欄位展開改由 `PART_KEYS` 產生，欄位順序（韌體 ABI）由 golden + ABI 測試雙重鎖定
- [x] **容器統一**：新增 `utils/actionTable/toNestedArray.js`；LoadData / sanitizeActionTable / Armor / AccessoryPanel 的 object 寫法全部改為 array，並加 5 個測試釘住不變式
- [x] **insertArray 三合一**：`utils/actionTable/insertColorKeyframes.js`（@deprecated）。**合併前以 20,000 組隨機輸入 fuzz 證明三份原始實作在可觸及路徑上等價**，非假設等價；唯一真實差異（audioplayer 的 t=0 守衛）保留在呼叫端
- **成果**：淨減約 1,400 行；測試由 39 增至 53

### Phase 2 Segment 規格 + 轉換器 ✅ 完成 2026-08-08

- [x] `utils/segments/core.js`：**payload-agnostic**（永不 import 色彩，多軌音訊可直接複用）——quantize、binary search、範圍查詢、不變式檢查、trim 碰撞（clearRange / insertSegment）
- [x] `utils/segments/convert.js`：`keyframesToSegments` / `segmentsToKeyframes`，邊界一律 `ceil` 對齊（與 buildPlayers 相同的取整方式，時間格由建構方式保證一致）
- [x] 順手把 Home.jsx 內嵌的 `normalizeActionTable` 抽成 `utils/actionTable/normalizeActionTable.js`，讓 app 與測試共用同一份正規化邏輯
- [x] 測試 28 筆：core 不變式/trim、轉換器各分支、round-trip 冪等、全 fixture 語意等價

#### 實作過程發現、且**只有真實資料才抓得到**的三個問題

1. **漸變終點色被壓平成錯誤顏色**（最嚴重，色差達 145）：舊資料的黑色哨兵 2990ms 向上對齊後
   變成 3000ms，正好與下一個色塊的起點重合，於是「白→黑」的漸變被壓平成「白→紅」。
   修正：緊鄰下一段時，若 `colorEnd` 與下一段的 `colorStart` 不同，額外發一個帶 `colorEnd`
   的關鍵格當漸變終點。
2. **尾端截斷**：舊模型每個部位尾端的黑關鍵格同時承載「時間軸有多長」的資訊，
   丟棄它會讓輸出時間範圍變短。修正：`segmentsToKeyframes` 依 `duration` 還原尾端。
3. **openEnded**：舊資料中最後一個關鍵格是彩色時代表「一路亮到最後」，沒有熄滅點。
   用旗標明確記錄，而非靠 `end === duration` 推斷——後者會讓輸出正確與否取決於呼叫端
   有沒有傳對 duration，傳錯就靜默改變韌體資料。

#### 一併修正的既有不一致

`normalizeActionTable` 對「完全缺少的部位」只補 time 0 黑點、對「有內容的部位」卻補到
duration，同樣是全程熄滅卻產生不同長度的時間軸。已統一為都涵蓋 `[0, duration]`，
「每個部位的時間軸都涵蓋整場」才成為真正成立的不變式。**這是一個小的行為變更**：
完全空白的舞者（例如舊版 9 部位資料補齊到 22 部位後）輸出會多一列全黑資料，畫面無變化。

#### 等價測試的標準修正

原訂「所有列的 time 完全相同」太嚴格：segment 模型會**正確地丟棄多餘的黑關鍵格**
（黑色不再是資料），列數本來就會變少。改用 `compareRenderedOutput`——把兩邊展開成
「每個 tick 的實際畫面」（模擬韌體的 hold/插值行為）再比對，這才是真正在意的等價。

#### 實測結果（Phase 4 閘門，全 19 個 fixture 通過）

| fixture | 差異取樣點 | 最大通道差 |
|---|---|---|
| real-rich-show（1,020 關鍵格、56 漸變） | 644 | **1** |
| real-dirty-times（非整數時間） | 18 | **2** |
| off-grid-color-keyframe（合成） | 20 | 6 |
| short-fade-to-black（合成極端：100ms 漸變） | 1 | 15 |

非漸變差異 **0**；容許值 16 足夠。

### Phase 3 audioplayer 拆件 + 鍵盤統一 ✅ 已完成

**audioplayer.jsx：1,992 → 368 行（-82%）**，測試 93 → 125。

- [x] **3a 元件層冒煙測試**（`05c9996`）：jsdom project + 真 Redux store，拆件前的安全網
- [x] **3b 死碼清除 + 接回兩個功能**（`7eb55ea`）
  - 刪：`audioRef` / `prevTimeRef` / `isExternalSeekRef` + 其 effect / `handleAlphaChoose` /
    Waveform 死 prop / ControlPanel 的 `act` import / waveform 的 `<audio>` 殘骸
  - **修好亮度階梯 popup**：`effectType` 從無被設成 `"gradient"` 的路徑，整塊 popup
    與 `applyGradientEffect` 不可達 → 效果選單加第三項接回
  - **修好 Shift+1~8 插入最愛顏色**：`Shift+1` 的 `event.key` 是 `"!"` 不是 `"1"`，
    條件永遠不成立 → 改用 `event.code`。接回後發現 `favoriteColor[0].length` 在顏色盤
    未載入時會 throw，抽 `favoriteColorAt()` 統一守衛（平鍵 1~8 那條本來就走得到）
- [x] **3c 逐元件搬移**（`25d1721`…`f095e20`，一元件一 commit）
  - `MusicSelector` / `PlayerControls` / `ShiftTool` / `EffectMenu` / `TrackToolbar` /
    `CopyPasteManager` + 外殼
  - 模式：**有快捷鍵的動作 = `useXxx()` hook（邏輯）+ 元件（UI）**，外殼呼叫一次
    hook，按鈕與鍵盤共用同一組函式
  - `isCopying` 留在 hook 裡，沒進 redux（純 UI 狀態）
  - `ensureBlackBefore` / `removeDuplicateBlackBlocks` 移到
    `utils/actionTable/blackSentinel.js`（標 `@deprecated`，Phase 5 整檔刪除）
  - 順手修：選單的頻閃沒有守衛會 crash、亮度選項的浮點誤差
- [x] **3d 鍵盤統一**（`aa8df69`）：三個 listener → `hooks/useKeyboardShortcuts.js`
  宣告式 keymap；移除 `.timeline-container` 重複的 `onKeyDown`
- [x] Timeline.jsx 與 waveform.jsx 內部不動（留 Phase 5）

#### ⚠️ 保留下來的既有鍵位衝突（已加測試鎖住，修它是獨立變更）

| 鍵 | 同時觸發 | 實際結果 |
|---|---|---|
| `Shift+←/→` | ±50ms **和** 跳到上/下個關鍵格 | 後者覆蓋前者 |
| `Ctrl+1~8` | 套用最愛色 N **和** 設定透明度 N/10 | 兩個 handler 從**同一份 actionTable 快照**各自 produce 再 dispatch，後跑的透明度整份蓋掉最愛色 → **套色被靜默丟棄** |

第二項比原本預期的更嚴重（不是「兩件事都發生」而是「其中一件被吃掉」）。

> ~~待辦：`docs/shortcuts.md` 需補上「亮度階梯」與「Shift+1~8」兩個接回來的功能。~~
> 已補（2026-08-12）。`Shift+1~8` 於 2026-08-14 隨最愛色收成六格改為 `Shift+1~6`。

### Phase 4 資料模型切換 ✅ 已完成

store 的 `data.actionTable` 已改存 segments。既有的寫入者與渲染邏輯**一行邏輯都沒改**，
靠 `useKeyframeActionTable()` 這座橋繼續用 keyframe 思考。

- [x] **遷移入口** `utils/migration/loadProjectData.js`：五條載入路徑
      （persist rehydrate / Dashboard / LoadData 遠端 / LoadData 本地備份 /
      LoadData 從韌體 players 反推）全部收斂到這裡
- [x] **靠形狀辨認、不靠版號**：keyframe 有 `time`、segment 有 `start`/`end`。
      版號是寫入時才加的欄位，persist 快照根本沒有 envelope——賭每條路徑都記得加，
      賭輸就是把 segment 當 keyframe 再轉一次（資料直接壞掉）
- [x] **轉接橋** `utils/segments/withKeyframeAdapter.js` + `hooks/useKeyframeActionTable.js`：
      逐 (armor, part) 以 reference 快取雙向轉換，沒動到的部位沿用原 reference
      （memo 才有效、segment id 才穩定）
- [x] persist key `root` → `root_v2` + rehydrate transform；raw_data / 本地備份帶 `schemaVersion: 2`
- [x] 匯出改為 `buildPlayers(segmentsToActionTable(segments))`；`sanitizeActionTableTimes` 退出上傳路徑
- [x] 初始化一律用 `meta.skipHistory` 明示（People.jsx、Home.jsx 新專案）

#### 過程中修掉的三個「stride 2」地雷

黑哨兵模型下「一個視覺色塊 = 顏色點 + 黑點」，所以程式各處寫死了 `+2`。
segment 壓平回 keyframe 之後**緊鄰的色塊之間沒有黑點**，這個假設全面失效：

| 位置 | 症狀 | 修法 |
|---|---|---|
| `EffectMenu` 亮度階梯 | stride 2 跳過一整個色塊 | 改用 `findNextColorIndex()` 逐個色塊走 |
| `TrackToolbar` 剪下 | 選取落在隔壁色塊 | `commit()` 回傳寫入後的 keyframe 表，用時間找回 index |
| `profiles.js` history | 「第一個部位只有 1 個元素 = 初始化」的形狀猜測，在 segment 世界會把「放下第一個色塊」誤判成初始化 → 該次編輯無法 undo | 刪掉猜測，初始化改由呼叫端傳 `skipHistory` |

#### 驗收結果

`npm test` **150 passed**、`npm run build` 通過。閘門測試（`loadProjectData.test.js`）：
**全 fixture 結構性差異 0**（含 2 份真實 production 光表），漸變內部最大通道差 15
（合成極端案例 100ms 漸變），真實光表 1~2 —— 與 Phase 2 量到的數字完全一致，
代表遷移本身沒有引入任何新誤差。

**回滾**：revert deploy —— 舊 build 讀原本的 `root` key；伺服器上的 v1 `raw_data`
永遠可載（lazy migrate）。

> 待辦（下次動手前先做）：手動 checklist 尚未實跑，Timeline 拖曳/resize 的
> 零 re-render 路徑沒有自動化測試涵蓋。

### Phase 5 逐項 segment 原生化 ✅ 全部完成（5a–5g）

每項都改寫成 `utils/segments/*` 原生 → 拆該項 adapter → golden + checklist → ship。

- [x] **5a** 建立 segment 原生的色彩層（`utils/segments/color.js`）與逐部位 hook
- [x] **5b** Armor / AccessoryPanel：點擊 → `insertColorSegment`，顯色走 `getColorAt`
- [x] **5c** TrackToolbar：刪除 / 剪下 / 亮度 / 統一透明度 / 導航
- [x] **5d** EffectMenu：漸變 / 頻閃 / 亮度階梯（`blockIndex + step*2` 的 stride 假設死亡）
- [x] **5e** CopyPasteManager 與 ShiftTool
- [x] **5f** Timeline 色塊渲染與拖曳 / resize（運算抽到 `utils/segments/gestures.js`）
- [x] **5g** 最終清掃：`withKeyframeAdapter` / `useKeyframeActionTable` /
      `insertColorKeyframes` / `LEGACY_BLACK_SENTINEL_MS` / 選取項目的 `blockIndex`
      全部刪除。**黑色哨兵與陣列索引在執行路徑上完全消失**，keyframe 只剩壓平
      輸出時存在（`segmentsToKeyframes`）

#### 零 re-render 拖曳路徑約束（已維持）

- 手勢期間維持 direct-DOM（transform + rAF），拖曳中零 React render
- Commit = mouseup 時**恰好一次** dispatch；history 合併為一筆 undo
- 穩定 `seg.id` key；segment 操作只對被改動的 (armor, part) 回傳新陣列，其餘結構共享

### Phase 6 DAW 加強與介面（進行中）

- [x] **多 segment 一起拖曳**：`movableRange`（能移多遠的單一真相，像素預覽與
      commit 共用）+ `moveSegments`。順手修掉「色塊首尾相接時拖 0 會彈開 50ms」
      與「duration 未載入時 NaN 寫壞 start/end」
- [x] **工作集**：`showPart` 升級成具名軌道組，可命名 / 儲存 / 一鍵切換
      （`utils/worksets.js` + `hooks/useWorksets.js` + `WorksetBar.jsx`）
- [x] **軌道行高可調**：像素而非百分比，全域滑桿 + 逐軌把手
      （`utils/tracks.js`）；低於 64px 自動收起次要按鈕
- [x] **右側收成單一調色盤欄，道具搬到人旁邊**：飾品燈畫進光衣卡片與人並排
      （播放時整個人連同手上的東西一起亮），身體部位本來就能在光衣上點，
      右欄 376px → 200px
- [x] **工具列換行時播放控制靠右**：那一組有 647px 寬，1280 下必定換行，先前落在
      第二排最左邊（正下方是空的軌名欄）。`margin-left: auto` 之後排得下貼齊時間軸
      右緣、排不下從右邊接續第一排；它前面那條分隔線一併移除（換行後會變成懸空的
      短線，而自動留白換行仍然成立）
- [x] **調色盤重做**：形狀收進 `utils/palette.js`，修掉三個行為問題——
      點最愛色的預設是覆蓋（改成 `使用/存色` 二選一，預設使用、空格一律存）、
      亮度只有六段（改成 1% 一格的滑桿，與 `Ctrl+1~9` 的 10%~90% 一致）、
      空格補成白色而白色是合法燈色（改成 `null` + 虛線框）。新增「最近使用」一排
      （reducer 的 `UPDATECHOSENCOLOR` 自動記、依色相去重，所以拉亮度不會塞爆）。
      順手修掉快捷鍵 7/8 繞回第 1/2 格的靜默錯誤，與 `TransparentButton.css` 裡
      一條套到全站的裸 `*` 選擇器
- [x] **outside-click listener 收成一份**：`Timeline.jsx` 每個實例都在 document
      上掛一個「點到 block 以外就取消選取」的 handler，內容完全一樣（154 條軌
      就是 154 份，每次點擊全部跑一遍、各自做十次 `closest()` 再各自 dispatch）。
      而那個行為本來就不屬於某一條軌。收成 `hooks/useDeselectOnOutsideClick.js`。
      順帶把頻閃的輸入框也收成一份——B 鍵與效果選單先前各寫一份，鍵盤那份還
      卡著舊的「只能選一個」限制
- [x] **Blink 改 metadata**：`seg.effect = {type:'blink', period}`（`effects.js`），
      只在 `segmentsToKeyframes` 壓平與 `getColorAt` 預覽時展開，UI 維持單一可
      拖曳色塊（左下角一排短豎線當記號）。可以一次套到多個選取的色塊、再套一次
      改間隔、輸入 0 取消。顏色的基本運算順帶拆到 `rgba.js` 避免
      `color.js` ↔ `effects.js` 循環相依
- [x] **框選（marquee）多選**：幾何在 `utils/segments/marquee.js`（純函式），
      事件與像素換算在 `MarqueeSelect.jsx`。從空隙拉、Alt 從任何地方拉、
      Shift 加選。踩到兩個順序問題：拖曳後瀏覽器補的 `click` 會被判成「點在
      block 外面」而清空剛框好的選取；Shift 的加選基準必須在 mousedown 就存好
- [x] **節拍格線**（2026-08-15）：速度**掛在 clip 上**而不是掛在時間上
      （`clip.bpm` / `beatAnchor` / `beatsPerBar`，運算在 `utils/audio/tempo.js`）。
      使用者拍板同一音檔不變速，所以不需要速度區段。密度由「相鄰兩條至少
      `MIN_GAP_PX`」推導，最細到四分之一拍，三連音略過
- [ ] **節拍吸附**（A3b，格線先用一陣子再決定）
- [ ] **敲拍取速度**（A3c）

#### 速度模型：為什麼最後是掛在 clip 上（2026-08-15 實作時修正）

原本規劃的是「專案維護一串速度區段 `{start, bpm, beatsPerBar, anchor}`」，
實作時換成**每個 clip 各自帶速度**。理由是歌單可以重排：

⚠️ **`beatAnchor` 是相對於這個 clip 的，不是表演時間的絕對毫秒。** 用絕對時間
的速度表時，使用者把第三首和第四首對調的那一瞬間，整片格線就對到別首歌去了
——而畫面上不會有任何異常，波形照畫、格線照畫，只是每一條都錯了。
真的遇到 medley 就把那個檔案切成兩個 clip。

其餘設計原樣成立：

- `anchor` 是第一拍落在哪一毫秒。**只有 BPM 定不出格線**，還需要相位——
  第二首歌的第一拍幾乎不會剛好落在 clip 的起點
- ⚠️ **50ms 網格才是真相**：韌體吃 `floor(ms/50)`，而 128 BPM 一拍是 468.75ms、
  八分之一拍 58.59ms，都不是 50 的倍數。吸附順序是「先吸到拍，再 `roundToTick`」，
  最後那一步最多挪 25ms。節拍格線只能是輔助線（所以格線本身刻意**不**對齊網格：
  它畫的是音樂真正的位置，而使用者是照著線在對拍的）
- ⚠️ 任何「每拍重複一次」的功能都必須**從 `beatLines` 逐點取位置**，不能拿一個
  固定間隔一直加——加法會累積誤差，八小節之後偏掉半格以上
- BPM 來源是**手動輸入 + 敲拍取平均**（後者尚未實作，見 A3c），不做自動偵測

### Phase 7 多軌音訊（遠期，只記介面決策，不 block 燈光重構）

前面 Phase 已埋好的可能性，實作時不得反悔：

- `Segment<T>` generic core（Phase 2）；`utils/segments/core.js` 永不 import 色彩程式碼
- Timeline 手勢邏輯（Phase 5）做成可複用 hook
- raw_data 的 `schemaVersion` envelope 可長出 `tracks` 陣列，後端零改動
- Phase 3 拆件不得把單一 `sourceNode` 假設更深綁進新元件；多軌時 waveform 改寫為一個 AudioContext + N 個 AudioBufferSourceNode + 每軌 gain node

---

## 📋 目前的待辦總表（2026-08-14 整理）

> 這一節是**唯一**要看的待辦清單。上面各 Phase 的勾選是施工記錄，
> 底下的「拍板決策」是不得反悔的約束——動到相關程式碼前先讀那一段。

### A. 編輯器功能（Phase 6 剩餘）

| # | 項目 | 大小 | 備註 |
|---|---|---|---|
| A3a | ~~節拍格線~~ | M | **2026-08-15 完成**。速度掛在 clip 上（`clip.bpm` / `beatAnchor` / `beatsPerBar`），運算在 `utils/audio/tempo.js`，`BeatGrid` 畫在軌道底下。使用者拍板：同音檔不變速、最細 1/4 拍、三連音略過 |
| A3b | **節拍吸附** | M | 格線先用一陣子再決定。要做的話必須是 `gestures.js` 的一個參數（先吸到拍再 `roundToTick`），不能是另一條路徑；套用範圍：拖曳 / resize / 放色預設長度 / 貼上 / 區間平移，並用全域開關控制 |
| ~~A4~~ | ~~跨軌的複製貼上與拖曳~~ | M | **2026-08-27 完成**。框選早就跨軌，但幾乎每個操作都在 `multiSelectedBlocks[0]` 那一條收斂。收成 `groupSelectionsByPart` + `utils/segments/table.js` + `utils/segments/clipboard.js`，拖曳同時支援水平（整批共用位移量）與垂直（拖到別條軌，落點覆蓋） |
| ~~A6~~ | ~~跑馬燈（相位偏移貼上）~~ | S | **2026-08-28 完成**。`target.phaseMs`，落點與預覽走同一份 `planPaste` |
| ~~A7~~ | ~~對齊與分佈~~ | S | **2026-08-28 完成**。`utils/segments/arrange.js`，入口在特效選單 |
| A8 | **cue 標記（時間軸上的具名位置）** | S | 一串 `{time, label}` 放進 raw_data 的 envelope（後端零改動），畫在刻度尺上走 `ClipMarkers` 同一套座標，加「跳到上/下一個標記」與「選取兩個標記之間」。五分鐘的表演現在只能拖捲軸目測 |
| A9 | **效果庫（presets）** | S | 具名的剪貼簿。`packClipboard` 吐出來的已經是完整可序列化的矩形，加名字存進 profiles 就成立 |
| A10 | **迴圈播放（loop region）** | M | 排燈時的實際節奏。⚠️ 成本比看起來高：引擎是「一次排完整場」，`anchorFor()` 假設時間單調前進，迴圈等於引入折返點，seek / 變速 / 接縫都要重想 |
| A5 | **亮度滑桿拖曳中不 dispatch** | S | 每一格像素寫一次 redux，在改色模式下等於每格佔一格 undo。做法和逐軌行高把手、接縫滑桿一樣（拖曳中只改預覽、放開才寫），但那三個地方「拖曳中要看到什麼」各不相同，所以不是照抄 |
| A3c | **敲拍取速度（tap tempo）** | S | 目前 BPM 只能手動輸入。敲拍時記 `engine.positionMs()`，丟掉第一個間隔取平均，**第一次敲擊的位置就是 anchor**（相位與速度一次拿到） |

### B. 尚未拆件 / 技術債

| # | 項目 | 大小 | 備註 |
|---|---|---|---|
| ~~B3~~ | ~~多曲銜接的 UI~~ | M | **2026-08-15 完成**。`utils/audio/clips.js`（形狀與不變式）+ `hooks/useAudioClips.js`（唯一讀取入口）+ `Playlist.jsx`（可收合，加 / 移除 / 排序 / 改名 / 接縫）+ 時間軸的 `ClipMarkers`。波形改畫整場（`stitchPeaks`） |
| ~~B2~~ | ~~bundle 1.8MB（gzip 542kB）~~ | S | **2026-08-15 完成**。路由層 `lazy`（`/model` 的 three + model-viewer 佔了 746KB）+ 刪掉沒用到的 lodash import。初始 chunk 1817 → 475 KB（gzip 547 → 156 KB），`npm run audit:bundle` 守著 |
| B5 | **`.dict()` → `.model_dump()`** | S | Pydantic v2 已標記棄用（每次跑測試 10 則警告），v3 會直接壞掉。模型是扁平的整數欄位，兩者輸出相同，但那條路徑是韌體 ABI，要配 golden 驗一次 |
| B4 | **dist 有 91MB 的 mp3** | S | `musicsrc/` 十一首示範曲被複製進 build，其中一首是商業歌曲而這個 repo 是 public fork。不影響載入速度（選到才抓），但每次部署都要搬 91MB。拿掉的話音樂改走後端 `/music` |

### C. 安全性（**從專案開始到現在一件都沒動**）

CLAUDE.md 一直有記，但沒進過 todo，所以列在這裡免得又被忘掉。這幾項不影響
排燈，但這個服務是掛在網路上的。

| # | 項目 | 備註 |
|---|---|---|
| ~~C1~~ | ~~密碼明文儲存~~ | ✅ bcrypt（cost 12），舊明文在**登入成功時就地換成雜湊**，不停機、不用遷移腳本 |
| ~~C2~~ | ~~Token 機制不安全~~ | ✅ HS256 JWT（`sub` + `exp`）。實際情況比記錄的更糟：**權杖就是使用者名稱**，送 `Bearer <帳號名>` 就通過，密碼完全不需要 |
| ~~C3a~~ | ~~音樂檔端點的路徑穿越~~ | ✅ `backend/paths.py`。**這一項比 todo 上寫的嚴重**：`get_music` 連登入都不用，實測 `/api/get_music/%2e%2e/secret.txt` 回 200 並吐出根目錄外的檔案內容 |
| C3b | 其他端點的輸入驗證 | 上傳的 payload 內容、query 參數的範圍還沒驗。**唯一還沒動的一項** |
| ~~C5~~ | ~~憑證寫在版控裡~~ | ✅ 2026-08-15。`.env.deployment` 移出版控（範本留 `.example`）、`mongo-init` 改讀環境變數且沒設就 throw、`run-deploy.sh` 找不到 env 檔改成**停下來**（舊版會用空憑證起 mongo、用臨時秘鑰起後端，而畫面上看起來部署成功）|
| ~~C6~~ | ~~註冊是 fail-open~~ | ✅ 2026-08-21。邀請碼改必填，`REGISTER_CODE` 沒設 = **關閉註冊**（503）而不是開放。碼本身不進版控——public fork 寫進去就不再是一道門 |
| ~~C4~~ | ~~CORS~~ | ✅ 收成 `CORS_ORIGINS` 環境變數，留空就用原本那份清單（不設也不會壞）|

⚠️ **部署時要設 `AUTH_SECRET`**（`.env` / docker-compose 已經接好，值留空）。
`docker-compose.prod.yml` 現在設了 `REQUIRE_AUTH_SECRET=1`，漏設會啟動失敗。

⚠️ **`.env.deployment` 已移出版控**，部署機器要自己有一份（範本
`.env.deployment.example`）。裡面那組 `root`/`nycuee` 已經公開過，**必須換掉**
——移出 repo 不等於收回。
沒設的話後端每次重啟都會臨時產生一把新秘鑰，所有人被登出。產生方式：
`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`

驗收：`cd backend && uv run pytest`（18 項，含「使用者名稱不再是合法權杖」
與「明文舊資料仍然登得進去」兩條回歸）。前端不用改——它一直只是把
`access_token` 原樣存起來再送回去，權杖長什麼樣它不在乎。

⚠️ **`db/dump_data/**/users.bson` 裡有 7 組帳號的明文密碼。這個 repo 是
public fork——那個檔案永遠不得 import 進 fixture、不得 commit。**
`frontend/scripts/import-mongo-fixtures.mjs` 的 `ALLOWED_COLLECTIONS`
白名單（只允許 `raw_json` / `color`）是硬性防線，不要為了方便繞過它。
fixture 裡的使用者名稱預設匿名化，也是同一個理由。

### D. 後端已知但刻意不處理

| # | 項目 | 備註 |
|---|---|---|
| ~~D1~~ | ~~`upload_full` 沒有 retention~~ | 已修（2026-08-15）。`storage.prune_history` + `HISTORY_LIMIT`，**預設 0 = 什麼都不刪**——刪的是使用者存過的光表版本，備份每兩天才一次。舊版那段 delete 是註解掉的，但**查詢還留著**（每次上傳掃一次全部然後什麼也沒做） |
| D2 | ~~`GET /api/raw/{u}/LATEST` 查錯 collection~~ | 已修（2026-08-12） |

### E. 使用者已拍板、之後不要再問的事

這幾項在對話裡討論過並且定了案，記在這裡是為了不要下次又重新設計一遍。

- **編輯器介面完全無彩色。** 討論過要不要給每位舞者一個識別色，使用者的答覆是
  「**完全不引入，維持全無彩色**」。畫面上唯一飽和的顏色必須是使用者的燈光資料，
  狀態一律靠亮度、邊框與圖示表達。
- **軌道保留手動一條一條加**，工作集是加在它上面的功能，不是取代它。
- **左側軌名列保留原本那組下拉選單與按鈕**（舞者／部位／上下移／刪除），
  設計稿裡那種「D3 帽子」文字標題不採用。
- **軌道的眼睛（顯示切換）按鈕已移除，不要加回來。** 它把軌道設成
  `opacity: 0` 但照樣佔滿高度，變成看不見也點不到的空白帶；而且 persist 裡
  存了 `hidden: true` 之後，使用者除了刪掉那條軌之外沒有辦法讓它回來
  （按鈕就在那條看不見的列上）。
- **亮度 100% 時不顯示角標。** 已實作（`Timeline.jsx` 的 `block-dim-mark`
  條件是 `A < 1`），角標只表達「這塊沒有全亮」。
- **多音軌的 BPM 問題用「速度軌」解，不做自動偵測**，且實作延後（見 A3）。
- **後端不動**：`upload_full`、mongo schema、韌體 PlayerData 路徑維持原樣。

### F. 已修完的版面問題（保留記錄，別再走回頭路）

- [x] ~~左右兩欄的每一列沒有對齊~~（2026-08-14）。右半邊上方多了工具列與
      時間刻度尺，左欄沒讓出同樣的高度：1600 下差 25px、1280 下差 49px（工具列
      在那個寬度換兩行）。**寫死一個高度只對得了一種寬度**，所以改成量第一列的
      落差再補，版面稽核逐列比對守住。
- [x] ~~工作集列與下方工具列的左緣沒對齊~~（2026-08-14）。三排的內容左緣
      12 / 6 / 1 收成 `.control-panel` 的 `--row-inset`；左欄寬與播放器起點收成
      `--gutter-w`（先前 240 vs 235 重疊 5px）；工作集列右緣 1600 → 1595。
      版面稽核第五項已擴充到守「各排內容左緣」。
- [x] ~~上下兩塊的右緣一個停 1427、一個停 1595~~（2026-08-13）。欄寬收進
      `pages/Home.css` 的 `.homepage`。
- [x] ~~工具列換行時播放控制孤零零掛在第二排最左邊~~（2026-08-14）。
      改成 `margin-left: auto` 靠右。

## ⚠️ 風險總覽

| Phase | 規模 | 風險 | Ship/回滾 | 平行性 |
|---|---|---|---|---|
| 0 測試 | S | 低 | 單 PR，trivial revert | —（block 一切） |
| 1 清理 | M | 低 | 4 個獨立 PR | ∥ P2 |
| 2 轉換器 | M | 中（概念） | 可 ship（未接線） | ∥ P1、P3 |
| 3 拆件 | L | 中（搬移期行為漂移） | 逐元件 | ∥ P2 |
| 4 切換 | M | **高**（持久化 + 全寫入者一次過橋） | 單一原子 PR；key bump 回滾 | **否**，凍結其他合併 |
| 5 原生化 | L | 中 | 逐寫入者 | 高 ∥ |
| 6 新功能 | M | 低中 | 逐功能 | 高 ∥ |

前三大風險與對策：
1. **漸變輸出差異的範圍失控**（短漸變誤差可達 ~15/255） → Phase 0 的結構化 diff 比對器把允許差異**類別**寫成硬斷言（非漸變欄位差異一律紅燈），幅度則用可設定閾值 + 實測統計，加入真實 fixture 後重新量測
2. **Phase 4 遷移吃掉某人未上傳的本地作品** → key bump + lazy migrate + IndexedDB 備份維持 v1 可讀
3. **Phase 3 純搬移期間行為漂移** → 每拆一個元件跑 golden + 手動 checklist

---

## ✅ 驗收 checklist

這份清單是 Phase 0 之前寫的，那時專案零測試所以每一項都得手動點。現在絕大多數
已經有機器在守——下面標了 `e2e` 的由 `npm run e2e` 跑（真瀏覽器、`/api/**` 攔截
成假資料，所以後端不用起），標了 `unit` 的由 `npm test` 跑（jsdom）。

```bash
cd frontend
npm run dev            # 另一個終端機
npm test               # 758 項
npm run e2e            # 78 項
npm run audit:layout   # 5 項版面
npm run audit:bundle   # 初始 JS 大小預算
cd ../backend && uv run pytest   # 87 項
```

**仍然只有人驗得到的**：拖曳的手感（幾何接線對不對）、播放時燈與音樂對不對得上、
本地備份（IndexedDB）載回來的樣子。其餘見下表。


| 項目 | 誰在守 |
|---|---|
| 點光衣放色 → 時間軸出現色塊（預設 1 秒） | e2e |
| M 鍵 Move Mode 拖曳移動；拖曳邊緣 resize | e2e（幾何接線仍需人眼） |
| click 選色塊、Shift+click 多選、框選跨軌 | e2e |
| 跨軌選取一起搬、把色塊拖到別條軌 | e2e |
| 複製模式的滑鼠預覽與按左鍵貼上 | e2e |
| Ctrl+C / Ctrl+V 區間貼上；Ctrl+Shift+V 固定時間貼上 | unit |
| Shift+C / Shift+V 整條複製貼上 | unit |
| L 鍵切漸變 | unit |
| B 鍵頻閃（50ms 倍數週期） | e2e |
| P 鍵改色；1–6 最愛色；Shift+1–6 插入；Ctrl+數字 改亮度 | e2e（Ctrl+數字、最愛色）＋ unit（其餘）|
| Shift 工具三步驟平移 | unit |
| C 鍵 Cut / Del 刪除 | e2e |
| W/S/A/D 跨軌跳格 | unit |
| Ctrl+Z / Ctrl+Y | e2e |
| 飾品部位可編輯、`isPartAllowed` 閘門正常 | e2e |
| Output 上傳成功；結構化 diff 全綠 | e2e（觸發）＋ unit（golden 與 diff）|
| 重新整理後 redux-persist 復原 | e2e |
| **本地備份（IndexedDB）載得回來** | **只有人** |
| **播放時燈與音樂對得上** | **只有人** |
