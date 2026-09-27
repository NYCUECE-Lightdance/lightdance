# 封存的文件

這裡的文件**描述的是過去的狀態**，留著是為了查「當初為什麼這樣做」，
不要照著裡面的內容操作或修改程式碼。現在的做法請看每一列右邊那一欄。

2026-09-27 封存。

| 文件 | 當初是什麼 | 為什麼封存 | 現在看哪裡 |
|---|---|---|---|
| [`technical-analysis.md`](./technical-analysis.md) | 2025-08 的全專案技術分析：架構、API、已知問題、改進路線圖 | 第五章列的安全問題（明文密碼、權杖就是使用者名稱、CORS）**全部修掉了**；架構描述停在 keyframe 模型與單一 `audioplayer.jsx` 的時代 | 根目錄 `CLAUDE.md`（各模組的設計與踩過的坑）、`README.md`（資料模型）；還沒做的安全項目在 `todo.md` 的 C3b |
| [`configuration.md`](./configuration.md) | 環境變數、API 端點、部署模式的設定說明 | 描述的「Smart Endpoint Detection」（`REACT_APP_API_BASE_URL` 判斷）已經不存在——前端現在一律打相對路徑 `/api`；提到的根目錄 `.env` 也不存在 | `.env.development` 與 `.env.deployment.example` 裡每個變數旁邊的註解；`docs/getting-started.md` |
| [`network-architecture-refactor-plan.md`](./network-architecture-refactor-plan.md) | 統一開發／正式環境 `/api` 路由的重構計畫 | **計畫已經做完**：後端路由統一掛在 `APIRouter(prefix="/api")`，`root_path` 已移除 | `CLAUDE.md` 開頭的架構圖；`frontend/vite.config.js` 的 proxy 設定 |
| [`nginx.md`](./nginx.md)（原 `nginx/nginx.md`） | 用 Docker 跑 Nginx 容器、以正規表示式轉發 API 的說明 | 描述的是更早的架構（`fast-api` 服務名稱、逐一列舉 API 路徑）。正式環境現在用的是**伺服器主機上的 Nginx**，`run-deploy.sh` 把前端檔案複製到 `/usr/share/nginx/html/lightdance`，而那份 Nginx 設定不在 repo 裡 | `run-deploy.sh` 開頭的說明；`docs/backend-management.md` |

## 同一天順手整理的：快捷鍵表只剩一份

編輯器的「Shortcuts」視窗讀的是 `frontend/public/shortcuts.md`，但大家一直在更新
`docs/shortcuts.md`。原本前者應該是一個指向後者的 symlink，在 Windows 上 commit
時變成了一份普通檔案，兩份從此分岔——**使用者在編輯器裡看到的是舊版**
（少了框選、頻閃對話框、Shift+方向鍵的退化行為等說明）。

現在只剩 `frontend/public/shortcuts.md` 一份（內容取自較新的 `docs/shortcuts.md`），
改快捷鍵時改它就好。原本為了讓 symlink 在容器裡解析得到而掛載的 `./docs:/docs`
（`docker-compose.dev.yml` 與 `run-deploy.sh`）也一併拿掉了。
