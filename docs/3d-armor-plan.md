# 用 3D 模型取代平面人像 —— 規劃與代辦

編輯器上半部現在是七張卡片，每張一個手繪的 SVG 光衣（`config/armorShapes.js`
的 14 個圓角方塊）。這份文件規劃把那個圖形換成 Blender 做的 3D 模型要動哪些
東西，以及每一項的風險在哪。

**沒有要改的：** 光表資料模型、韌體 ABI、上傳路徑、時間軸、後端。這次動的
只有「怎麼把 22 個顏色畫出來、怎麼點它們」這一層。

---

## 1. 現況盤點（2026-09-11 實測）

| 項目 | 現況 |
|---|---|
| `src/model/rigged.glb` | 140 KB。3 個 mesh（`Plane` / `Sphere` / `Sphere.001`）、**0 個材質**、67 節點的人形骨架、1 個 skin、0 個動畫 |
| `src/model/BASEmodel*.glb` | 各 125 KB。1 個 mesh（`Cube.001`）、0 個材質、55 節點骨架 |
| `.blend` 原檔 | **不在版控裡**。只有 `._BASEmodel.blend`（macOS 資源分叉，4 KB 的殼） |
| `._*` 垃圾檔 | ~~4 個被 git 追蹤中~~ 已刪除並加進 .gitignore（2026-09-11） |
| `pages/model.jsx` | 用 `@google/model-viewer` 全螢幕顯示 `rigged.glb`。**與編輯器沒有任何關聯**，是一頁孤兒 |
| 打包預算 | 上限 600 KB / gzip 200 KB，現況 487 / 160。`/model` 那一路的 `three` + model-viewer 共 746 KB，靠路由 lazy 擋在外面 |

⚠️ **結論是建模從零開始。** 現有的 glb 是綁骨練習，沒有任何可上色的部位。

---

## 2. 已拍板的五件事（2026-09-11）

**① 相機可以轉動，但第一版先不實作。** 大多數部位在正面就看得到，所以第一版是
固定的正面視角；轉動的能力要在架構上留著（相機狀態不要寫死成常數），但不排進
第一批工作。**建模的含意**：背面不必做細節，但也不要做成「只有正面」的片狀模型
——之後開放轉動時整包要重做。

**② 一個 canvas，七個模型實例。** 瀏覽器同時存在的 WebGL context 有上限
（約 8–16 個），超過會**靜默丟掉最舊的那個**；七個 context 加七個 render loop
在低配機器上必死。這表示元件結構跟現在相反：現在是七個獨立的 `<Armor>` 各自
訂閱自己那位，3D 版是一個元件擁有整個場景。

**③ 丟掉 `@google/model-viewer`，改用裸的 `three`。** model-viewer 是自帶相機
控制、自動旋轉、AR、poster 的完整檢視器，你要的功能一個都不需要；而你真正需要的
「伸手進場景圖把第 7 個部位的材質改成這個顏色」它並不打算讓你做。

**④ SVG 版留著當回退。** 低配機器、WebGL 不可用、3D 載入失敗時都走它，
而成本幾乎是零（`armorShapes.js` 已經是一張表）。

**⑤ 道具做進模型裡，卡片上那排 LED 方鈕在 3D 模式下不保留。** 道具跟著角色
一起呈現，點擊也點模型本身。**建模的含意**：道具的每個 LED 分段都要是獨立可
定址的 mesh（刀有 3 組 6 顆），而且在 3D 裡要點得準——這是模型精度與互動設計
要一起解的問題，穿刺階段就要試一次。

## 3. 模型與程式之間的契約

這是整個專案最容易靜默壞掉的地方：介面是**字串**（mesh 名字），而字串打錯不會
報錯——把 `part_chestL` 存成 `part_ChestL`，結果是左胸永遠不亮，畫面上一切正常。
所以契約要寫成文件，並且用腳本驗證。

| 項目 | 規則 |
|---|---|
| 命名 | 每個身體部位一個 mesh，名字是 `part_<key>`，`key` 取自 `constants/parts.js` 的 `PART_KEYS`（`part_hat`、`part_face`、`part_chestL`…共 14 個） |
| 道具 | `prop_<armorIndex>_<partIndex>`，只做 `config/accessoryConfig.js` 裡列出來的（舞者 1,2,3,4,6 有，0 和 5 沒有）。**每個 LED 分段各自一個 mesh**——卡片上那排方鈕在 3D 模式下不保留，所以模型本身就是唯一的點擊入口 |
| 材質 | **每個部位一個獨立材質，不可共用。** 共用材質的症狀是「改左胸右胸跟著變」，而且看起來像一個很難查的渲染 bug |
| 材質型別 | `MeshStandardMaterial`，底色暗（未亮的 LED 就是暗的），`emissive` 留給程式寫 |
| 座標系 | +Y 上、+Z 面向相機、單位公尺、原點在腳底中心、身高約 1.7 |
| 預算 | 單一模型三角形數 ≤ 30k、glb ≤ 500 KB（七個實例共用同一份幾何，所以這是一份的量） |
| 不要有的 | 動畫、相機、燈光、非必要的骨架（這次是靜態站姿） |

⚠️ **「亮度」接到 `emissiveIntensity`，不是 `opacity`。** 現在 SVG 是
`fill: rgba(R,G,B,A)`，A 當透明度剛好；3D 裡照抄會得到**半透明的身體**，
穿得到後面。正確映射是 `emissive` 吃 RGB、`emissiveIntensity` 吃 A。

⚠️ **場景要暗、環境光壓低。** 理由跟現在光衣要站在黑卡上是同一個：畫面上唯一
飽和的顏色應該是使用者的燈光資料（見 CLAUDE.md 的設計系統一節）。

---

## 4. 要新增的檔案

沿用這個專案的慣例：**運算是純函式、放 `utils/`、測得到；React 元件只負責
接線與寫 DOM。** jsdom 沒有 WebGL，所以測不到的東西越少越好。

| 檔案 | 內容 | 測得到？ |
|---|---|---|
| `utils/armor3d/contract.js` | `meshNameFor(partIndex)` / `partIndexOf(meshName)`，命名規則的唯一定義處 | ✅ |
| `utils/armor3d/paint.js` | 22 個 rgba → 寫進材質的 `emissive` / `emissiveIntensity`。收的是材質陣列不是場景 | ✅ |
| `utils/armor3d/pick.js` | raycast 命中的物件 → `{armorIndex, partIndex}`，含 `isPartAllowed` 過濾 | ✅ |
| `utils/armor3d/scene.js` | 建 renderer / camera / 燈光 / 七個實例的位置，回傳 `dispose()`。**不認得 React** | 部分 |
| `utils/armor3d/loadModel.js` | GLTF 載入與快取。幾何共用、**材質逐實例 clone** | 部分 |
| `components/armor3d/ArmorStage.jsx` | 唯一的 canvas 與 render loop | 冒煙 |
| `components/armor3d/ArmorStage.css` | 版面 | — |
| `hooks/useArmorColorsRef.js` | 七位 × 22 色收進一個 **ref**，播放時不觸發 re-render | ✅ |
| `scripts/audit-model.mjs` | 契約驗證：解析 glb 斷言 14 個 `part_*`、材質不共用、三角形數與檔案大小在預算內 | 自己是測試 |
| `docs/3d-model-contract.md` | 給建模的人看的規格（第 3 節的展開版，含匯出設定截圖） | — |

⚠️ **顏色更新不要走 React。** 播放時每一幀 7×22 個顏色都在變，走 `useMemo` +
re-render 是災難。寫進 ref、由 render loop 直接改材質——這跟既有的「拖曳期間直接
寫 DOM、放開才 dispatch 一次」是同一套思路，不是新發明。

⚠️ **render loop 不要無條件跑。** 沒有播放、沒有編輯時畫面是靜止的，
每秒 60 次重畫純粹是把低配機器的風扇吹起來。只在 `currentTime` 或光表變動時
標記 dirty 再畫一幀。

---

## 5. 要改的既有檔案

| 檔案 | 改什麼 |
|---|---|
| `package.json` | 移除 `@google/model-viewer`、加 `three`、加 `audit:model` script |
| `vite.config.js` | `assetsInclude` 已經有 `**/*.glb`，不用改 |
| `src/model/` | ~~刪掉 4 個 `._*` 垃圾檔~~（已完成）；`.blend` 原檔要補進版控；glb 改放 `public/` 或走後端，**不要讓它進 JS chunk** |
| `pages/model.jsx` | 現在是孤兒頁。改成模型檢查工具（載入 glb、列出 mesh 與材質、逐部位試亮）或直接刪掉 |
| `App.jsx` | `/model` 路由跟著上一項調整。3D 層要 lazy 載入 |
| `pages/Home.jsx` | 上半部的 People 區塊改成 `<ArmorStage>`，flag 決定 2D/3D |
| `components/Armor.jsx` | **拆成兩塊**：卡片外殼（標題列、隱藏鈕、道具 LED、選取邊框）與圖形。2D/3D 只換圖形那一塊，外殼共用 |
| `components/Armor.css` | 版面要重想：3D 是一整條 canvas，但標題列、隱藏鈕、道具 LED 是疊在上面的 DOM。`.personBackGround { flex: 1 1 0 }` 那套分寬度的規則要換成「canvas 佔滿、DOM 依舞者索引定位」 |
| `config/armorShapes.js` | 不動，回退用 |
| `config/accessoryConfig.js` | 不動，但 3D 要讀它決定顯示哪些道具節點 |
| `e2e/bundle-budget.mjs` | three 進來之後預算數字要重訂（**先量再訂，不要先訂**） |
| `CLAUDE.md` / `README.md` | 新增一節 |

---

## 6. 測試與驗收（最容易低估的部分）

canvas 裡沒有 DOM，所有「點某個部位」的測試都會失效。目前有四處：

| 位置 | 現況 | 要怎麼辦 |
|---|---|---|
| `components/__tests__/armor.dom.test.jsx:28` | `svg [data-part="N"]` | 3D 的顏色與命中邏輯留在 `paint.js` / `pick.js` 純函式裡測；元件層只剩冒煙測試 |
| `e2e/checklist.mjs:150` 的 `clickArmorPart` | `svg [fill]:not([fill='none'])` 的 `.nth(part)` | 改成穩定的入口（見下） |
| `e2e/layout-audit.mjs:106` | `.armor-container svg [fill]:not([fill='none'])` 列為可點控制項 | 換成 3D 的命中區或 DOM 疊層 |
| `e2e` 的舞者隱藏、道具 LED | 走 `.armor-container` / `.armor-props__led` | 外殼保留的話不受影響 |

⚠️ **`clickArmorPart` 現在有一顆未爆彈**：它用「第 N 個有 fill 的元素」定位，
而帽子由 2 個形狀組成、領帶也是——所以 `.nth(1)` 拿到的是帽簷不是臉。
目前六個呼叫端**全部傳 0**，所以還沒中；第一個寫 `clickArmorPart(page, 0, 1)`
以為在點臉的人就會踩到，而且不會有任何錯誤。這是兩行的修法（改用
`[data-part="N"]`），**現在就該修，不要等 3D**。

3D 版需要一個測試接縫：在 canvas 上掛一層透明的 DOM 命中區（順便解決
layout-audit 的可點性檢查），或掛一個 `window.__pickPart(armor, part)`。
前者比較誠實——它驗的是使用者真的點得到。

**新增的驗收**：`npm run audit:model`（契約），以及播放時的幀率量測
（在真的低配機器上，不是開發機）。

---

## 7. 代辦清單

### 階段 0：決策與穿刺（不要跳過）

- [x] 回答第 2 節的五個問題，寫進本文件（2026-09-11）
- [x] 刪掉 4 個 `._*` 垃圾檔並加進 .gitignore（2026-09-11）
- [ ] **補回 `.blend` 原檔**（只有做那個檔案的人手上有）
- [x] 順手修 `clickArmorPart` 改用 `data-part`（2026-09-11）
- [ ] **穿刺**：一個模型、一個 canvas、一個部位跟著時間軸變色、點得到。
      交出三個數字：換裸 three 之後初始 chunk 變多少、七個實例在低配機器上幾 fps、
      點擊到變色的延遲
- [ ] 依穿刺結果決定繼續或停損

### 階段 1：契約

- [ ] `docs/3d-model-contract.md`
- [ ] `utils/armor3d/contract.js` + 測試
- [ ] `scripts/audit-model.mjs` + 接進 CI
- [ ] 做一個**刻意違規**的 glb 驗證腳本真的會紅（共用材質、少一個部位、名字大小寫錯）

### 階段 2：模型

- [ ] 基礎人體（靜態站姿，符合座標系與預算）
- [ ] 14 個身體部位切開、各自獨立材質、照命名規則
- [ ] 五位舞者的道具（傘 / 螢光繩 / 刀 / 匕首）
- [ ] 通過 `audit:model`

### 階段 3：渲染

- [ ] `scene.js`：renderer、相機、燈光、七個實例的位置
- [ ] `loadModel.js`：載入、快取、幾何共用 + 材質 clone
- [ ] `paint.js` + 測試（含「A=0 時是暗的不是透明的」）
- [ ] `useArmorColorsRef.js`：七位 × 22 色進 ref，播放時零 re-render
- [ ] dirty 標記，靜止時不重畫

### 階段 4：互動

- [ ] `pick.js` + 測試（含 `isPartAllowed` 為 false 的部位點不到）
- [ ] 選取高亮（3D 版的「描邊」怎麼做——outline pass 還是換材質）
- [ ] hover 提示
- [ ] 測試接縫（透明 DOM 命中層）

### 階段 5：接線

- [ ] `Armor.jsx` 拆成外殼與圖形
- [ ] flag 決定 2D/3D，**預設仍是 2D**
- [ ] 版面：canvas + 疊在上面的標題列 / 隱藏鈕 / 道具 LED
- [ ] 3D 載入失敗或 WebGL 不可用時自動退回 SVG
- [ ] lazy 載入，重訂 bundle 預算

### 階段 6：驗收與切換

- [ ] 低配機器上量播放幀率與記憶體
- [ ] e2e 的四處選擇器改完、全綠
- [ ] `audit:layout` 全綠
- [ ] 文件：CLAUDE.md 一節、README、contract
- [ ] 預設值切成 3D，SVG 留著當回退

---

## 8. 停損點

穿刺量出來低配機器跑不動的話，**不要進入「再優化一下」的迴圈**——那表示這個
功能對你們現在的硬體太早。那時候該把力氣轉回 CLAUDE.md「編輯操作還缺的東西」
那九項，那些是每天都在用的東西。

同樣地，如果建模的進度停在階段 2，程式那邊**不要空等**：`audit:model` 通得過的
假模型（十四個上色方塊擺成人形）就足以讓階段 3 和 4 全部做完。契約先行的價值
就在這裡。
