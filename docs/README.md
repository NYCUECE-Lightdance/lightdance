# LightDance 專案文檔

第一次接觸這個專案：先看 [`getting-started.md`](./getting-started.md) 把環境跑起來，
再看根目錄的 [`README.md`](../README.md) 了解資料模型。每個模組的設計理由與踩過的坑
在根目錄的 `CLAUDE.md`，改哪一塊之前先讀那一節。

## 上手與交接

- [`getting-started.md`](./getting-started.md) — 在全新電腦上把開發環境跑起來（含匯入真實資料、跑測試、常見問題）
- [`data-handoff.md`](./data-handoff.md) — 給維護者：新成員需要哪些資料、怎麼從伺服器安全地打包光表與音樂

## 設計與實作

- [`data-flow-pipeline.md`](./data-flow-pipeline.md) — 從編輯器到 MongoDB 的完整資料流：色塊格式、壓平成韌體格式、32-bit RGBA 打包、上傳 API
- [`frontend-rendering-optimization.md`](./frontend-rendering-optimization.md) — 前端渲染與效能：元件樹、播放管線、Redux 訂閱粒度、memo 策略
- [`ui-design-plan.md`](./ui-design-plan.md) — UI 設計系統：token、無彩色原則、按鈕階層、時間刻度尺的決策與施工回顧
- [`3d-armor-plan.md`](./3d-armor-plan.md) — 規劃中：用 3D 模型取代平面人像

## 維運

- [`backend-management.md`](./backend-management.md) — MongoDB 備份還原、Docker 容器管理、日誌查看
- [`troubleshooting-login-500.md`](./troubleshooting-login-500.md) — MongoDB 連線失敗導致登入 500 錯誤的 SOP

## 其他位置的文件

- 鍵盤快捷鍵：[`frontend/public/shortcuts.md`](../frontend/public/shortcuts.md)（編輯器裡按 Shortcuts 按鈕看到的就是這一份）
- 待辦與已拍板的決策：根目錄的 [`todo.md`](../todo.md)
- 備份腳本：[`backend/BACKUP_README.md`](../backend/BACKUP_README.md)、[`backend/SHELL_SCRIPT_GUIDE.md`](../backend/SHELL_SCRIPT_GUIDE.md)

## 封存

[`archive/`](./archive/) — 描述過去狀態的文件（2025 年的技術分析、已完成的路由重構計畫等）。
只用來查「當初為什麼這樣做」，不要照著裡面的內容操作。

---

[← 返回專案根目錄](../README.md)

*最後更新：2026-09-27*
