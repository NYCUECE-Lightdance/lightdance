# LightDance 專案深度分析報告

## 一、專案概述

### 1.1 專案定位
LightDance 是由國立陽明交通大學電機工程學系學生開發的**全端 Web 應用程式**，專門用於設計和控制燈光舞蹈表演。這是一個典型的創意科技應用，結合了硬體控制（LED 燈光）與軟體介面（Web 應用）。

### 1.2 核心功能
- **燈光編排設計**：透過直觀的 Web 介面創建燈光編舞
- **音樂同步**：上傳並同步音樂檔案與燈光模式
- **多使用者支援**：使用者認證和個人工作空間管理
- **即時預覽**：設計時即時預覽燈光序列
- **資料管理**：儲存和管理多個版本的燈光設計

## 二、技術架構分析

### 2.1 整體架構模式
專案採用**微服務架構**（Microservices Architecture），透過 Docker Compose 進行容器編排：

```
┌─────────────────────────────────────────────────┐
│                   使用者瀏覽器                    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│                 Nginx (Port 80)                  │
│          反向代理 & 靜態檔案服務器                 │
└──────┬──────────────────────┬───────────────────┘
       │                      │
       │ /api/*               │ /*
       │                      │
┌──────▼──────────┐    ┌─────▼────────────────────┐
│    FastAPI      │    │    React Frontend         │
│   (Port 8000)   │    │   (Dev: Port 3000)        │
│                 │    │   (Prod: Nginx served)    │
└──────┬──────────┘    └──────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│                MongoDB (Port 27017)              │
│              資料持久化儲存層                      │
└──────────────────────────────────────────────────┘
```

### 2.2 技術棧詳細分析

#### 前端技術 (Frontend)
- **React 18**：採用最新版本的 React，支援並發特性
- **Redux**：狀態管理（從目錄結構推測）
- **Tailwind CSS**：utility-first CSS 框架
- **熱重載開發**：開發模式下支援即時更新

#### 後端技術 (Backend)
- **FastAPI**：
  - 選擇理由：高效能、自動生成 API 文件、原生支援異步
  - 實現特點：使用 Pydantic 進行資料驗證
- **Python 3.11**：相對較新的 Python 版本
- **Uvicorn**：ASGI 伺服器，支援異步處理
- **PyMongo**：MongoDB 的 Python 驅動程式

#### 資料庫層
- **MongoDB**：NoSQL 文件資料庫
  - 適合儲存非結構化的燈光設計資料
  - 支援靈活的 schema 變更
- **Mongo Express**：Web 介面的資料庫管理工具

#### 部署與容器化
- **Docker & Docker Compose**：
  - 分離開發（dev）和生產（prod）環境
  - 確保環境一致性
- **Nginx**：
  - 生產環境的反向代理
  - 靜態檔案服務
  - 負載平衡潛力

## 三、專案結構深度解析

### 3.1 環境配置策略

專案採用**分層環境配置**：

```
.env                 # 主配置（生產預設值）
.env.development     # 開發環境覆蓋
.env.deployment      # 部署環境特定配置
backend/.env.local   # 後端本地開發配置
```

**優點**：
- 環境分離清晰
- 配置靈活性高
- 敏感資訊保護（.gitignore）

**潛在問題**：
- 環境變數分散，可能造成混淆
- 缺少集中化的配置管理

### 3.2 Docker Compose 策略

專案使用**雙 Compose 檔案策略**：

1. **docker-compose.dev.yml**：
   - 包含完整的開發環境
   - 支援熱重載
   - 暴露所有服務端口

2. **docker-compose.prod.yml**：
   - 優化的生產配置
   - 使用 Nginx 服務前端
   - 限制端口暴露

### 3.3 API 設計分析

#### RESTful API 端點設計
```python
# 認證相關
POST   /token                    # 登入取得 token
GET    /users/me                 # 取得當前使用者資訊

# 資料操作
GET    /timelist/                # 取得所有時間列表
GET    /timelist/{username}      # 取得特定使用者時間列表
GET    /items/{username}/{time}  # 取得燈光資料
POST   /upload_items/            # 上傳燈光資料
POST   /upload_raw/              # 上傳原始資料

# 音樂管理
POST   /upload_music             # 上傳音樂
GET    /get_music_list/{user}   # 取得音樂列表
GET    /get_music/{user}/{file} # 下載音樂

# 測試與隨機資料
GET    /get_rand_lightlist/     # 產生隨機燈光列表
GET    /get_test_lightlist/     # 產生測試燈光列表
```

**設計特點**：
- 使用 OAuth2 Bearer Token 認證
- RESTful 風格但不完全遵循 REST 原則
- 支援分塊載入（chunk）提升效能

## 四、核心功能實現分析

### 4.1 使用者認證系統

```python
# 簡化的認證流程
1. 使用者提供 username/password
2. 後端驗證後返回 access_token（實際上是 username）
3. 後續請求攜帶 Bearer Token
```

**問題**：
- Token 直接使用 username，無加密或簽名
- 缺少 refresh token 機制
- 密碼明文儲存在資料庫

### 4.2 資料模型設計

```python
class PlayerData(BaseModel):
    time: int        # 時間點
    head: int        # 頭部 LED
    shoulder: int    # 肩部 LED
    chest: int       # 胸部 LED
    front: int       # 前方 LED
    skirt: int       # 裙子 LED
    leg: int         # 腿部 LED
    shoes: int       # 鞋子 LED
    weap_1: int      # 武器 1
    weap_2: int      # 武器 2
```

**特點**：
- 每個身體部位對應一個 32-bit 整數（RGBA 顏色值）
- 支援多個玩家（舞者）的資料儲存
- 時間序列設計便於動畫播放

### 4.3 檔案儲存策略

```python
MUSIC_FILE_PATH = os.getenv('MUSIC_FILE_PATH', '/music')
# Docker: /music
# Local: ./music_file
```

**優點**：
- 環境相依的路徑配置
- Volume 掛載實現資料持久化

**問題**：
- 缺少檔案大小限制
- 無檔案類型嚴格驗證
- 可能的路徑遍歷漏洞

## 五、主要問題與改進建議

### 5.1 安全性問題

#### 嚴重問題
1. **密碼明文儲存**
   ```python
   # 現況：密碼直接儲存
   if not form_data.password == user.password:
   ```
   **建議**：使用 bcrypt 或 argon2 進行密碼雜湊

2. **Token 設計缺陷**
   ```python
   return {"access_token": user.username, "token_type": "bearer"}
   ```
   **建議**：使用 JWT 或其他安全的 token 機制

3. **CORS 配置過於寬鬆**
   ```python
   allow_methods=["*"],
   allow_headers=["*"],
   ```
   **建議**：明確指定允許的方法和標頭

#### 改進方案
```python
# 使用 JWT 的改進範例
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

### 5.2 架構設計問題

#### 現有問題
1. **業務邏輯耦合**：所有邏輯都在 main.py
2. **缺少分層架構**：沒有 service layer、repository pattern
3. **無錯誤處理機制**：缺少統一的異常處理

#### 建議架構
```
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── auth.py      # 認證路由
│   │   │   ├── items.py     # 項目路由
│   │   │   └── music.py     # 音樂路由
│   ├── core/
│   │   ├── config.py        # 配置管理
│   │   ├── security.py      # 安全相關
│   │   └── database.py      # 資料庫連接
│   ├── models/              # 資料模型
│   ├── schemas/             # Pydantic schemas
│   ├── services/            # 業務邏輯層
│   └── repositories/        # 資料存取層
└── main.py
```

### 5.3 效能優化建議

1. **資料庫查詢優化**
   ```python
   # 現況：每次都查詢所有資料
   all_entries = list(collection_color.find({}, {...}))
   
   # 建議：使用索引和分頁
   collection_color.create_index([("user", 1), ("update_time", -1)])
   results = collection_color.find({}).limit(20).skip(page * 20)
   ```

2. **快取機制**
   ```python
   # 建議加入 Redis 快取
   from redis import Redis
   cache = Redis(host='redis', port=6379)
   
   def get_cached_data(key):
       data = cache.get(key)
       if data:
           return json.loads(data)
       # 從資料庫獲取並快取
   ```

3. **非同步處理**
   ```python
   # 充分利用 FastAPI 的異步特性
   async def upload_music(file: UploadFile):
       async with aiofiles.open(file_path, 'wb') as f:
           content = await file.read()
           await f.write(content)
   ```

### 5.4 前端改進建議

1. **API 配置管理**
   - 現有的 API 端點自動檢測機制很好
   - 建議加入 API 版本管理

2. **狀態管理**
   - 考慮使用 Redux Toolkit 簡化 Redux 使用
   - 或改用 Zustand 等更輕量的方案

3. **錯誤處理**
   - 加入全局錯誤邊界
   - 統一的 API 錯誤處理

## 六、未來發展方向

### 6.1 短期改進（1-3 個月）

1. **安全性加固**
   - 實施密碼加密
   - 改進 token 機制
   - 加入輸入驗證和消毒

2. **程式碼重構**
   - 分離業務邏輯
   - 實施分層架構
   - 加入單元測試

3. **效能優化**
   - 實施資料庫索引
   - 加入基本快取
   - 優化大檔案處理

### 6.2 中期發展（3-6 個月）

1. **功能增強**
   - WebSocket 即時協作
   - 燈光效果預設模板
   - 視覺化編輯器改進

2. **部署優化**
   - CI/CD 管道建立
   - Kubernetes 部署
   - 監控和日誌系統

3. **擴展性改進**
   - 微服務進一步拆分
   - 訊息佇列整合
   - 水平擴展支援

### 6.3 長期願景（6+ 個月）

1. **平台化發展**
   - 開放 API 生態系統
   - 第三方整合
   - 社群功能

2. **AI 整合**
   - 音樂節奏自動識別
   - AI 輔助燈光設計
   - 智能效果推薦

3. **硬體整合**
   - IoT 設備直接控制
   - 即時串流協議
   - 邊緣運算支援

## 七、總結

### 優點
1. **完整的全端實現**：前後端分離架構清晰
2. **容器化部署**：Docker 使用得當，環境管理良好
3. **開發體驗**：熱重載、環境分離等開發友好特性
4. **基礎功能完備**：核心功能都已實現

### 主要改進點
1. **安全性**：急需改進認證和密碼處理
2. **架構**：需要更好的程式碼組織和分層
3. **可維護性**：缺少測試、文件和錯誤處理
4. **擴展性**：需要考慮未來的擴展需求

### 建議優先級
1. 🔴 **緊急**：修復安全漏洞（密碼、token）
2. 🟡 **重要**：重構程式碼結構
3. 🟢 **改進**：加入測試和文件
4. 🔵 **增強**：效能優化和新功能

這個專案展現了良好的技術基礎和創意應用，透過系統性的改進，可以發展成為一個專業級的燈光控制平台。