# LightDance 網路架構重構計畫

## 問題分析

### 現狀問題識別

經過深入分析專案的網路請求架構，我們發現以下核心問題：

**開發環境與生產環境的不一致性**：
- **開發環境**：Vite 代理將 `/api/xxx` 完整轉發到後端 `backend:8000/api/xxx`
- **生產環境**：Nginx 將 `/api/xxx` 重寫為 `/xxx` 後轉發到後端 `backend:8000/xxx`
- **後端設定**：FastAPI 設置 `root_path="/api"`，期望所有請求都帶有 `/api` 前綴

### 具體衝突點分析

1. **路由不匹配**：
   - 開發：前端 `/api/token` → Vite → 後端 `/api/token` ✅
   - 生產：前端 `/api/token` → Nginx 重寫 → 後端 `/token` ❌

2. **健康檢查差異**：
   - 開發環境：`test: ["CMD", "curl", "-f", "http://localhost:8000/api/"]`
   - 生產環境：`test: ["CMD", "curl", "-f", "http://localhost:8000/"]`

3. **CORS與代理配置複雜**：
   - 雙重代理導致請求頭處理複雜
   - 環境差異造成除錯困難

## 解決方案設計

### 方案A：統一路由架構（推薦）

**核心理念**：在所有環境中統一使用相同的路由處理邏輯

#### 修改重點：

1. **統一後端路由結構**
   ```python
   # 移除 root_path，讓後端處理純淨的路由
   app = FastAPI(
       title="LightDance API", 
       description="API for LightDance project",
       version="1.0.0"
       # 移除 root_path="/api"
   )
   ```

2. **統一代理配置**
   ```nginx
   # Nginx 配置：保持 /api 前綴
   location /api/ {
       proxy_pass http://backend:8000/api/;  # 不進行路徑重寫
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

3. **後端新增路由前綴中介軟體**
   ```python
   # 新增統一的API前綴處理
   from fastapi import FastAPI
   from fastapi.routing import APIRoute
   
   def add_api_prefix_to_routes(app: FastAPI):
       for route in app.routes:
           if isinstance(route, APIRoute):
               route.path = f"/api{route.path}"
   ```

### 方案B：環境變數驅動配置

**核心理念**：使用環境變數動態調整路由配置

#### 實作細節：

1. **動態 root_path 配置**
   ```python
   import os
   
   # 根據環境動態設置
   ROOT_PATH = os.getenv('API_ROOT_PATH', '')
   
   app = FastAPI(
       root_path=ROOT_PATH,
       title="LightDance API",
       description="API for LightDance project", 
       version="1.0.0"
   )
   ```

2. **環境變數設定**
   ```bash
   # .env.development
   API_ROOT_PATH=/api
   
   # .env.production  
   API_ROOT_PATH=""
   ```

## 推薦方案：統一路由架構

### 選擇原因

1. **最小化環境差異**：所有環境使用相同的路由邏輯
2. **簡化除錯**：開發和生產環境行為一致
3. **向後相容**：不改變前端API呼叫方式
4. **易於維護**：減少條件性配置

### 實施步驟

#### 第一階段：後端重構
1. 移除 FastAPI 的 `root_path="/api"`
2. 手動為所有路由新增 `/api` 前綴
3. 更新健康檢查端點
4. 測試所有API端點

#### 第二階段：Nginx配置統一
1. 修改 nginx/default.conf，移除路徑重寫
2. 確保 `/api/` 請求直接轉發到 `backend:8000/api/`
3. 測試生產環境部署

#### 第三階段：開發環境對齊
1. 確認 vite.config.js 配置正確
2. 統一健康檢查配置
3. 全面測試開發環境

#### 第四階段：文件與監控
1. 更新API文件
2. 建立網路請求監控機制
3. 制定故障排除指南

## 實作細節

### 後端路由重構

```python
# backend/main.py 重構範例

from fastapi import FastAPI
from fastapi.routing import APIRoute

app = FastAPI(
    title="LightDance API",
    description="API for LightDance project", 
    version="1.0.0"
    # 移除 root_path="/api"
)

# 方法1：使用路由器統一管理
from fastapi import APIRouter
api_router = APIRouter(prefix="/api")

@api_router.get("/")
async def health_check():
    return {"status": "healthy"}

@api_router.post("/token")
async def login():
    # 登入邏輯
    pass

# 將路由器添加到主應用程式
app.include_router(api_router)

# 方法2：手動為現有路由新增前綴（如果路由已經定義）
def add_api_prefix():
    for route in app.routes:
        if isinstance(route, APIRoute) and not route.path.startswith('/api'):
            route.path = f"/api{route.path}"

# 在應用程式啟動時執行
add_api_prefix()
```

### 統一的Nginx配置

```nginx
# nginx/default.conf 統一配置

server {
    listen 80;
    server_name _;

    # API 統一轉發 - 保持完整路徑
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支援（未來可能需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 前端靜態檔案
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri /index.html;
        
        # 快取靜態資源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

### 統一的健康檢查

```yaml
# docker-compose 健康檢查統一
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/api/"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s
```

## 風險評估與緩解策略

### 潛在風險

1. **向下相容性風險**
   - 風險：現有前端代碼可能依賴特定路由結構
   - 緩解：段階式遷移，保留舊路由一段時間

2. **部署風險**
   - 風險：生產環境切換可能導致短暫服務中斷
   - 緩解：使用藍綠部署或滾動更新策略

3. **除錯複雜性**
   - 風險：統一配置可能隱藏環境特定問題
   - 緩解：加強日誌記錄和監控

### 緩解策略

1. **分階段實施**
   - 先在開發環境完整測試
   - 使用staging環境驗證
   - 最後部署到生產環境

2. **回滾策略**
   - 保留原始配置檔案
   - 準備快速回滾腳本
   - 監控關鍵指標

## 測試計畫

### 單元測試
- [ ] 後端API路由測試
- [ ] 前端API呼叫測試
- [ ] 錯誤處理測試

### 整合測試
- [ ] 開發環境端到端測試
- [ ] 生產環境模擬測試
- [ ] 跨域請求測試

### 負載測試
- [ ] API回應時間測試
- [ ] 並發請求處理測試
- [ ] 長時間運行穩定性測試

## 監控與維護

### 監控指標
1. **API回應時間**
2. **錯誤率統計**
3. **請求數量趨勢**
4. **健康檢查狀態**

### 日誌策略
```python
# 新增請求日誌中介軟體
import logging
from fastapi import Request

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # 記錄請求資訊
    logger.info(f"Request: {request.method} {request.url}")
    
    response = await call_next(request)
    
    # 記錄回應資訊
    process_time = time.time() - start_time
    logger.info(f"Response: {response.status_code} in {process_time:.2f}s")
    
    return response
```

## 預期效益

### 短期效益
1. **統一開發體驗**：開發和生產環境行為一致
2. **簡化除錯流程**：減少環境相關的網路問題
3. **提升開發效率**：減少環境切換造成的問題

### 長期效益
1. **降低維護成本**：統一的配置減少維護負擔
2. **提升系統穩定性**：一致的網路架構減少故障點
3. **便於功能擴展**：標準化的架構便於新增功能

## 實施時間軸

- **第1週**：後端路由重構與測試
- **第2週**：Nginx配置修改與驗證  
- **第3週**：開發環境統一化測試
- **第4週**：生產環境部署與監控

## 結論

透過統一路由架構的重構方案，我們可以徹底解決現有的網路請求問題，建立一個穩定、一致且易於維護的系統架構。這個方案不僅解決了當前的技術債務，也為未來的擴展奠定了良好的基礎。

重構完成後，開發者將享有：
- **一致的開發體驗**：無論在開發或生產環境
- **簡化的除錯流程**：網路問題診斷更直觀  
- **穩定的API呼叫**：統一的路由處理邏輯
- **清晰的架構文件**：便於新成員理解和維護

這個重構計畫體現了「可讀性優先、可維護性第二」的開發原則，為專案的長期健康發展提供了堅實的技術基礎。