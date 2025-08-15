# 版本變更紀錄 (Changelog)

## 2025-08-14

### ✨ 功能與重構 (Features & Refactoring)

本次更新重構了整個專案的開發與部署流程，旨在提升穩定性、可攜性與可維護性。

**主要變更如下：**

1.  **引入環境特定的 Docker Compose 設定檔**
    -   新增 `docker-compose.dev.yml`，專門用於本地開發。它啟動了一個包含前端熱修改、後端和本地資料庫的完整開發環境。
    -   新增 `docker-compose.prod.yml`，專門用於生產部署。它啟動了由 Nginx 驅動的前端、後端以及一個獨立的本地資料庫實例。
    -   移除了舊的、職責不清的 `docker-compose.yml` 檔案。

2.  **更新啟動與部署腳本**
    -   `start-dev.sh` 現在會使用 `docker-compose.dev.yml` 來啟動一個完全容器化的本地開發環境。
    -   `run-deploy.sh` 現在會使用 `docker-compose.prod.yml` 來模擬或執行生產環境的部署。
    -   兩個腳本都加入了更友善的提示訊息與中文註解。

3.  **文件與版本控制**
    -   新增 `REFACTOR_PLAN.md` 檔案，詳細記錄了本次重構的規劃過程。
    -   更新了 `.gitignore` 檔案，明確將 `.env.production` 加入忽略清單，以保護生產環境的敏感資訊。
