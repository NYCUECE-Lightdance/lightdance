from typing import Union
from pymongo import MongoClient
from fastapi import Request, FastAPI, HTTPException, Depends, Path, status, Form, APIRouter
from fastapi import File, UploadFile
# 從 models.py 匯入所有資料模型
from models import PlayerData, Player, Data, RAW, Item, User, UserInDB, FullUpload, RegisterRequest
# typing.List 已在 models.py 中使用
# from app import app
# from flask import Flask, send_file, render_template
import json
import os
import secrets
import shutil
import random
from dotenv import load_dotenv

from bson import ObjectId
from time import strftime, localtime

from fastapi.middleware.cors import CORSMiddleware

from paths import UnsafePathError, resolve_within
from pymongo.errors import DuplicateKeyError, PyMongoError

from storage import (
    DEFAULT_LIST_LIMIT,
    LIST_PROJECTION,
    MAX_LIST_LIMIT,
    StorageError,
    color_document,
    ensure_indexes,
    insert_show,
    now_stamp,
    now_utc,
    prune_history,
    raw_document,
)
from auth import (
    InvalidCredentialsError,
    create_access_token,
    hash_password,
    needs_rehash,
    read_token,
    validate_credentials,
    verify_password,
)
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm #
from fastapi.responses import FileResponse
from fastapi.encoders import jsonable_encoder

app = FastAPI(
    title="LightDance API",
    description="API for LightDance project",
    version="1.0.0"
)

# 建立 API 路由器，統一管理所有 /api 路由
api_router = APIRouter(prefix="/api")

load_dotenv()
uri = os.getenv('MONGO_CONNECT_URI')

# 音樂文件路徑配置
# Docker容器內使用 /music，本地開發使用 ./music_file
MUSIC_FILE_PATH = os.getenv('MUSIC_FILE_PATH', '/music')
print(f"Music file path: {MUSIC_FILE_PATH}")

client = MongoClient(uri)

try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
    MONGO_REACHABLE = True
except Exception as e:
    print(e)
    MONGO_REACHABLE = False

SIZE = 256 # number of LED per board

db = client['test']
collection_color = db['color']
collection_raw = db['raw_json']
user_list = db['users']

# 索引在啟動時建立一次（冪等）。定義與理由在 storage.py——簡單說：這個資料庫
# 原本一個索引都沒有，每次「載入最新版本」都是把該使用者的所有光表撈出來排序。
#
# ⚠️ **連不上就不要試。** `create_index` 連不上時會等滿 server selection 的
# 逾時（預設 30 秒）才丟例外，三個索引就是一分半——服務起不來、測試也跟著卡。
# 上面那個 ping 已經知道答案了，直接用它。連不上時服務照樣起得來，
# 讀寫會各自失敗並回報。
if MONGO_REACHABLE:
    ensure_indexes(db)
else:
    print("[storage] MongoDB 連不上，略過索引建立（服務仍會啟動）")

# 允許的來源。
#
# 舊版是一份**寫死在程式裡**的清單（不是 `*`，所以沒有原本記的那麼糟），
# 但那代表換一個部署位置就要改程式、重新 build image。收成環境變數之後
# 換機器只要改 .env。
#
# 預設值就是原本那份清單，所以沒設 CORS_ORIGINS 的環境行為完全不變。
DEFAULT_ORIGINS = [
    "http://localhost",
    "http://localhost:8000",
    "http://localhost:8081",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://140.113.160.136:419",
    "http://140.113.160.136",
]

def _load_origins():
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return DEFAULT_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

origins = _load_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token") 

# 資料模型已移至 models.py 檔案

def get_user(list, username: str):
    user_now = list.find_one({"username": username})
    if user_now:
        user_dict = user_now
        return User(**user_dict)

def decode_token(token):
    """
    權杖 → 使用者。

    ⚠️ 舊版是 `get_user(user_list, token)`——**權杖就是使用者名稱**，於是任何人
    只要送 `Authorization: Bearer <某個帳號名>` 就通過了，密碼完全不需要。
    帳號名稱不是秘密（它會出現在網址、截圖、彼此喊人的訊息裡），所以那條路徑
    等於整個驗證都不存在。

    現在先驗簽章與有效期，通過了才去查那個人還在不在。
    """
    username = read_token(token)
    if not username:
        return None
    return get_user(user_list, username)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    user = decode_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail = "Invalid authentication credentials",
            headers = {"WWW-Authenticate": "Bearer"},
        )
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# ============================================================================
# 使用者資源 (User Resource) - 身份驗證與個人資訊管理
# ============================================================================

# 使用者登入驗證，返回存取令牌
# 使用方法：POST /api/token，Body: username & password (form-data)
# 使用場景：前端登入、API 權限獲取
@api_router.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user_dict = user_list.find_one({"username": form_data.username})
    if not user_dict:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    user = UserInDB(**user_dict)
    if not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    # 懶惰遷移：舊資料的密碼欄位是明文，登入成功的當下就地換成 bcrypt 雜湊。
    # 不需要停機、不需要遷移腳本，也不會有人被鎖在外面——每個人登入一次就完成。
    if needs_rehash(user.password):
        user_list.update_one(
            {"username": user.username},
            {"$set": {"password": hash_password(form_data.password)}},
        )

    return {"access_token": create_access_token(user.username), "token_type": "bearer"}

# 建立帳號
# 使用方法：POST /api/register，需要填對 REGISTER_CODE 那組邀請碼
# 使用場景：新成員自己開帳號，不必找人手動塞進資料庫
@api_router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest):
    """
    建立一個新帳號，成功之後直接回一張權杖（不必再登入一次）。

    ## 誰可以註冊

    **邀請碼是必填的**，由 `REGISTER_CODE` 環境變數提供：

    - **有設** ＝ 要在表單裡填對那組邀請碼才建得起來
    - **沒設** ＝ 這個站台**不開放自行註冊**（回 503），帳號要請管理員手動建

    ⚠️ 沒設的時候是**關起來**而不是打開。舊版的預設是「沒設 = 開放註冊」，
    那條路是 fail-open 的：漏設一個環境變數的後果是全世界都能在你的資料庫裡
    開帳號，而畫面上什麼異常都沒有（註冊成功、登入成功、一切正常）。設定漏了
    應該要撞牆，不應該悄悄變成最寬鬆的那個狀態——和 `AUTH_SECRET` 在
    `REQUIRE_AUTH_SECRET=1` 下啟動失敗是同一個理由。

    ⚠️ 邀請碼擋的是**濫用**不是機密：這個服務的讀取端點大多不需要認證
    （`timelist` / `raw` / `items` 都是公開的），所以「多一個帳號」本身洩漏
    不了東西，真正的成本是有人可以無限開帳號並上傳光表佔掉資料庫。也因為
    如此，**這組碼不要進版控**——這個 repo 是 public fork，寫進去的那一刻
    它就不再是一道門了。值放在 `.env.deployment`（已 gitignore）。

    ## 為什麼不先查有沒有重複

    有查（為了給一句好懂的訊息），但**真正的保證是 `users.username` 的唯一
    索引**。「先 find_one 再 insert」中間有一段空窗，兩個人同時註冊同一個名字
    會兩邊都通過檢查——而重複的帳號會讓 `find_one` 回哪一個變成沒有定義的行為，
    密碼對不上的那位就登不進來了。
    """
    required_code = os.getenv("REGISTER_CODE", "").strip()
    if not required_code:
        # 503 而不是 403：這不是「你填錯了」，是這個站台根本沒開這條路。
        # 訊息要講得出下一步，否則使用者只會一直重填邀請碼
        raise HTTPException(
            status_code=503,
            detail="這個站台沒有開放自行註冊（未設定邀請碼），請找管理員開帳號",
        )

    provided = (payload.invite_code or "").strip()
    # 比 bytes 不比 str：compare_digest 遇到非 ASCII 會丟 TypeError，
    # 而邀請碼是人取的（和 auth.verify_password 踩過的是同一個坑）
    if not secrets.compare_digest(
        provided.encode("utf-8"), required_code.encode("utf-8")
    ):
        raise HTTPException(status_code=403, detail="邀請碼不正確")

    try:
        username, password = validate_credentials(payload.username, payload.password)
    except (InvalidCredentialsError, UnsafePathError) as error:
        raise HTTPException(status_code=422, detail=str(error))

    if user_list.find_one({"username": username}, {"_id": 1}):
        raise HTTPException(status_code=409, detail=f"帳號「{username}」已經有人用了")

    try:
        user_list.insert_one(
            {
                "username": username,
                # 一開始就是 bcrypt。這個路徑不會產生任何明文
                "password": hash_password(password),
                "disabled": False,
                "created_at": now_utc(),
            }
        )
    except DuplicateKeyError:
        # 上面查完到這裡之間有人搶先了。唯一索引擋下來的就是這種情形
        raise HTTPException(status_code=409, detail=f"帳號「{username}」已經有人用了")
    except PyMongoError as error:
        print(f">>> [ERROR] 建立帳號失敗: {error}")
        raise HTTPException(status_code=503, detail="資料庫暫時無法寫入，請稍後再試")

    return {
        "access_token": create_access_token(username),
        "token_type": "bearer",
        "username": username,
    }

# 取得當前登入使用者的基本資訊
# 使用方法：GET /api/users/me，需要 Bearer Token
# 使用場景：驗證登入狀態、顯示使用者資訊
@api_router.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

# ============================================================================
# 系統基礎功能 (System Utilities) - 系統狀態檢查與基礎服務
# ============================================================================

# 系統健康狀態檢查
# 使用方法：GET /api/，無需驗證
# 使用場景：系統狀態監控、服務可用性檢查
@api_router.get("/")
async def read_root():
	print("Success!! OuOb")
	return {"Hello": "World"}

# ============================================================================
# 光表項目資源 (Light Item Resource) - 光表資料的查詢與管理
# ============================================================================

# 取得所有使用者的光表資料時間清單
# 使用方法：GET /api/timelist/，無需驗證
# 使用場景：前端載入選單、顯示可用的光表資料列表
@api_router.get("/timelist/")
async def list_all_timestamps(limit: int = DEFAULT_LIST_LIMIT):
    """
    ⚠️ **一定要有上限。** 舊版是 `find({})` 全部撈出來再在 Python 裡排序：
    這個資料庫從來不刪舊版本，用一學期之後這支端點會把整個歷史一次回給前端。

    排序交給資料庫（`(user, update_time)` 的索引正好就是這個順序），
    Python 這端不再排一次。
    """
    limit = max(1, min(limit, MAX_LIST_LIMIT))

    entries = list(
        collection_color.find({}, LIST_PROJECTION)
        .sort([("user", 1), ("update_time", -1)])
        .limit(limit)
    )

    return {
        "list": [
            {
                "user": entry["user"],
                "update_time": entry["update_time"],
                # 預設值是空字串不是 0：先前用 0，於是同一個欄位在資料庫裡
                # 同時有字串與整數兩種型別
                "music_filename": entry.get("music_filename", ""),
            }
            for entry in entries
        ]
    }

# 取得特定使用者的光表資料時間清單
# 使用方法：GET /api/timelist/{username}，無需驗證
# 使用場景：查看特定使用者的所有光表資料版本
@api_router.get("/timelist/{username}")
async def list_user_timestamps(username: str, limit: int = DEFAULT_LIST_LIMIT):
	limit = max(1, min(limit, MAX_LIST_LIMIT))

	entries = list(
		collection_color.find({"user": username}, LIST_PROJECTION)
		.sort("update_time", -1)
		.limit(limit)
	)

	return {
		"list": [
			{
				"user": entry["user"],
				"update_time": entry["update_time"],
				"music_filename": entry.get("music_filename", ""),
			}
			for entry in entries
		]
	}

# 取得特定使用者在特定時間的完整光表資料
# 使用方法：GET /api/items/{username}/{query_time}，無需驗證
# 使用場景：載入指定版本的光表資料進行編輯或播放
@api_router.get("/items/{username}/{query_time}")
async def get_user_color (username: str, query_time: str):
    if query_time == "LATEST":
        user_data = collection_color.find_one(
            {"user": username}, 
            sort=[("update_time", -1)]  # Sort by update_time in descending order to get the latest entry
        )
    else:
        user_data = collection_color.find_one({"user": username, "update_time": query_time})

    if user_data:
        user_json = jsonable_encoder(user_data, custom_encoder={ObjectId: str})
        return user_json
    else:
        return {"message": f"user not found: '{username}'"}

# 取得特定玩家的分塊光表資料（用於大型資料集分批載入）
# 使用方法：GET /api/items/{username}/{query_time}/player={player}/chunk={chunk}
# 使用場景：大資料量時分批載入，提升前端效能
@api_router.get("/items/{username}/{query_time}/player={player}/chunk={chunk}")
async def get_user_color_by_chunk (username: str, query_time: str, chunk: int, player: int):
    CHUNK_SIZE = 10
    
    start_idx = chunk * CHUNK_SIZE

    if chunk < 0 or player < 0:
        raise HTTPException(status_code=400, detail="player 與 chunk 不能是負數")

    """
    ⚠️ 只撈需要的那一段，不要把整份光表拉出來再切。

    舊版是「find_one 整份文件 → jsonable_encoder 整份 → 取第 player 個 →
    切 10 筆」。一份密集光表實測 43KB，分 100 次載入就從資料庫搬了 100 份
    完整光表出來——而這支端點存在的理由正是「資料太大要分批」。

    `$slice` 讓 mongo 在伺服器端就切好，`players.$slice` 取的是第一層
    （哪一位舞者），第二層再用 Python 切（BSON 的 $slice 不能巢狀）。
    """
    projection = {"players": {"$slice": [player, 1]}}

    if query_time == "LATEST":
        user_data = collection_color.find_one(
            {"user": username},
            projection,
            sort=[("update_time", -1)],
        )
    else:
        user_data = collection_color.find_one(
            {"user": username, "update_time": query_time}, projection
        )

    if not user_data:
        return {"message": f"user not found: '{username}'"}

    players = user_data.get("players") or []
    if not players:
        return {"message": f"Invalid player index: {player}"}

    chunk_data = jsonable_encoder(
        players[0][start_idx : start_idx + CHUNK_SIZE],
        custom_encoder={ObjectId: str},
    )

    return {"player_data": chunk_data}

# ============================================================================
# 原始資料資源 (Raw Data Resource) - 原始 JSON 格式資料的存取
# ============================================================================

# 取得特定使用者在特定時間的原始光表資料
# 使用方法：GET /api/raw/{username}/{query_time}，無需驗證
# 使用場景：載入原始編輯資料、資料備份與還原
@api_router.get("/raw/{username}/{query_time}")
async def get_user_raw (username: str, query_time: str):
    # 兩條分支都必須查 collection_raw。這裡原本 LATEST 分支查的是 collection_color，
    # 回傳的是播放用的 32-bit 打包資料而不是編輯器原始 JSON，前端載入會拿到錯的東西。
    if query_time == "LATEST":
        user_data = collection_raw.find_one(
            {"user": username},
            sort=[("update_time", -1)]  # Sort by update_time in descending order to get the latest entry
        )
    else:
        user_data = collection_raw.find_one({"user": username, "update_time": query_time})

    if user_data:
        user_json = jsonable_encoder(user_data, custom_encoder={ObjectId: str})
        return user_json
    else:
        return {"message": f"user not found: '{username}'"}

# 取得特定玩家的光表資料
# 使用方法：GET /api/items/{username}/{query_time}/{player_ID}，無需驗證
# 使用場景：編輯單一玩家光表效果時使用
@api_router.get("/items/{username}/{query_time}/{player_ID}")
async def get_certain_player_color (username: str, query_time: str, player_ID: int):
    user_data = collection_color.find_one({"user": username, "update_time": query_time})
	
    if user_data:
        if player_ID < len(user_data['players']):
            return {
                'color_data': user_data['players'][player_ID]
            }
        else:
            return {"message": "no such player"}
    else:
        return {"message": f"user not found: '{username}'"}

# 上傳處理後的光表資料（用於硬體播放）
# 使用方法：POST /api/upload_items，需要 Bearer Token
# 使用場景：將編輯完成的光表資料上傳至伺服器
@api_router.post("/upload_items")
async def upload_user_color (request: Request, current_user: User = Depends(get_current_active_user)):
	b = await request.json()

	current_time = strftime("%Y-%m-%d-%H:%M:%S", localtime())

	user_data = Data(
		user = current_user.username,
		last_updated_time = current_time,
		players = [Player(data=[PlayerData(**item) for item in sublist]) for sublist in b['players']],
        music_filename = b.get('music_filename', 0)
	)

	# 保留策略統一走 storage.prune_history（預設 HISTORY_LIMIT=0，不刪任何東西）。
	# 這裡原本有一段「撈出所有版本、數一數、取出最舊那一筆」——而真正的刪除
	# 那一行是註解掉的。等於每次上傳都掃一次該使用者的全部光表，然後什麼也沒做。
	prune_history(collection_color, user_data.user)

	document = {
		'user': user_data.user,
		'update_time': user_data.last_updated_time,
		'players': [[player_data.dict() for player_data in player.data] for player in user_data.players],
        'music_filename': user_data.music_filename
	}

	collection_color.insert_one(document)

	return {
		'message': 'upload success d(OvO)y'
	}

# 同時上傳原始與處理後資料（解決時間不同步問題）
# 使用方法：POST /api/upload_full，需要 Bearer Token
@api_router.post("/upload_full")
async def upload_full_data (data: FullUpload, current_user: User = Depends(get_current_active_user)):
	"""
	一次上傳兩份：韌體要播的 `color` 與編輯器要載回來的 `raw_json`，
	共用同一個 `update_time` 當版本編號。

	⚠️ **兩份要嘛都寫成功、要嘛都不留**（見 storage.insert_show）。舊版是分別
	try/except、各自印一行錯誤，然後**不管結果一律回 success**——寫壞一份的話
	會留下「跑得動但打不開」或「打得開但跑不動」的版本，而使用者看到的是綠色的
	上傳成功訊息，下次才發現東西不見了。

	⚠️ 舊版還有一段「模型驗證失敗就以原始格式存入」的保底方案。那不是保底，
	是**把驗不過的資料塞進資料庫再回報成功**——驗證存在的唯一理由就是擋掉那種
	資料。現在驗不過就回 422，讓使用者知道這一版沒存進去。
	"""
	current_time = now_stamp()

	# 1. 先把兩份文件都組好、驗完，再開始寫。驗證失敗時資料庫完全沒被碰過
	try:
		# data.players 是 List[List[PlayerData]]，轉成 List[Player] 之後
		# 走 Data 模型，形狀與舊端點 100% 一致（韌體的 ABI 靠這個鎖住）
		color_data_obj = Data(
			user = current_user.username,
			last_updated_time = current_time,
			players = [Player(data=player_list) for player_list in data.players],
			music_filename = str(data.music_filename)
		)
	except Exception as e:
		print(f">>> [REJECT] 光表格式驗證失敗: {e}")
		raise HTTPException(
			status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
			detail=f"光表格式不正確，這一版沒有存進去：{e}",
		)

	document_color = color_document(
		user = color_data_obj.user,
		update_time = current_time,
		players = [[p.dict() for p in player.data] for player in color_data_obj.players],
		music_filename = color_data_obj.music_filename,
	)
	document_raw = raw_document(
		user = current_user.username,
		update_time = current_time,
		raw_data = data.raw_data,
		music_filename = color_data_obj.music_filename,
	)

	# 2. 成對寫入。失敗就回滾並回報，不要假裝成功
	try:
		insert_show(
			collection_color,
			collection_raw,
			color = document_color,
			raw = document_raw,
		)
	except StorageError as error:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
		)

	# 3. 超出保留上限的舊版本。預設 HISTORY_LIMIT=0 → 什麼都不刪
	prune_history(collection_color, current_user.username)
	prune_history(collection_raw, current_user.username)

	return {
		'message': 'Full data upload success (synchronous timestamp) d(OuO)y',
		'update_time': current_time
	}

# 上傳原始光表資料（JSON 格式）
# 使用方法：POST /api/upload_raw，需要 Bearer Token
# 使用場景：儲存編輯中的光表資料，保留完整計時資訊
@api_router.post("/upload_raw")
async def upload_raw_data (request: Request, current_user: User = Depends(get_current_active_user)):
	b = await request.json()

	current_time = strftime("%Y-%m-%d-%H:%M:%S", localtime())

	user_data = RAW(
		user = current_user.username,
		last_updated_time = current_time,
		raw_data = b['raw_data']
	)

	# 保留策略統一走 storage.prune_history（預設 HISTORY_LIMIT=0，不刪任何東西）。
	# 這裡原本有一段「撈出所有版本、數一數、取出最舊那一筆」——而真正的刪除
	# 那一行是註解掉的。等於每次上傳都掃一次該使用者的全部光表，然後什麼也沒做。
	prune_history(collection_color, user_data.user)

	document = {
		'user': user_data.user,
		'update_time': user_data.last_updated_time,
		'raw_data': user_data.raw_data
	}
    
	collection_raw.insert_one(document)

	return {
		'message': 'raw data upload success d(OuO)y'
	}

# ============================================================================
# 音樂資源 (Music Resource) - 音樂檔案的上傳與管理
# ============================================================================

# 上傳音樂檔案到伺服器
# 使用方法：POST /api/upload_music，需要 Bearer Token，檔案以 multipart/form-data 格式
# 使用場景：為光表表演配對音樂檔案、建立音樂庫
@api_router.post("/upload_music")
async def upload_music(file: UploadFile = File(None), current_user: User = Depends(get_current_active_user)):
	print(f"Received file: {file.filename}")  # Add this line to debug

	if file is None:
		raise HTTPException(status_code=400, detail="No file provided")
	if file.content_type != "audio/mpeg":
		raise HTTPException(status_code=415, detail="File must be an MP3")

	# 檔名完全由客戶端決定，直接接上去的話 `../../something` 會寫到目錄外面
	try:
		file_loc = resolve_within(MUSIC_FILE_PATH, current_user.username, file.filename)
	except UnsafePathError as error:
		raise HTTPException(status_code=400, detail=str(error))

	file_location = os.path.dirname(file_loc)
	if not os.path.exists(file_location):
		print("make new directory")
		os.makedirs(file_location, exist_ok=True)

	print("saving files")
	# Save the uploaded file to the local server
	with open(file_loc, "wb") as buffer:
		shutil.copyfileobj(file.file, buffer)
	    
	return {"info": f"file '{file.filename}' saved at '{file_location}'"}


# 取得特定使用者上傳的音樂檔案清單
# 使用方法：GET /api/get_music_list/{username}，無需驗證
# 使用場景：瀏覽特定使用者的音樂檔案庫
@api_router.get("/get_music_list/{username}")
async def get_music_list(username: str):
	try:
		file_path = resolve_within(MUSIC_FILE_PATH, username)
	except UnsafePathError as error:
		raise HTTPException(status_code=400, detail=str(error))

	if not os.path.isdir(file_path):
		return {"music_list": [], "message": f"no music directory for {username}"}
	files = os.listdir(file_path)
	# Filtering only the files.
	files = [f for f in files if os.path.isfile(file_path+'/'+f)]
	print(*files, sep="\n")

	return {
		"music_list": files,
		"message": f"get music list from {file_path}"
	}


# 下載特定使用者的音樂檔案
# 使用方法：GET /api/get_music/{username}/{filename}，無需驗證
# 使用場景：播放或下載音樂檔案
@api_router.get("/get_music/{username}/{filename}")
async def get_music_file(username: str, filename: str):
	# 網址裡的字串不能直接接進路徑：百分比編碼是在路由之後才解開的，
	# `..%2F..%2Fetc%2Fpasswd` 進到這裡就是 `../../etc/passwd`（見 paths.py）
	try:
		file_location = resolve_within(MUSIC_FILE_PATH, username, filename)
	except UnsafePathError as error:
		raise HTTPException(status_code=400, detail=str(error))

	if not os.path.isfile(file_location):
		# 不要把組出來的路徑回給客戶端——那會洩漏伺服器上的目錄結構
		raise HTTPException(status_code=404, detail="File not found")

	# Return the file as a response
	return FileResponse(file_location, media_type='audio/mpeg', filename=filename)
from os import listdir
from os.path import isfile, join, isdir

# 取得所有使用者的音樂檔案清單
# 使用方法：GET /api/get_music_list，無需驗證
# 使用場景：瀏覽所有可用的音樂檔案
@api_router.get("/get_music_list")
async def get_all_music_lists():
    root_path = MUSIC_FILE_PATH
    if not os.path.exists(root_path):
        return {"message": f"Root directory '{root_path}' not found"}
    user_music_lists = {}
    for username in listdir(root_path):
        user_path = join(root_path, username)
        if isdir(user_path):
            files = [f for f in listdir(user_path) if isfile(join(user_path, f))]
            user_music_lists[username] = files
    return {"music_lists": user_music_lists, "message": "Retrieved all music lists"}

# ============================================================================
# 生成工具資源 (Generator Resource) - 隨機與測試資料生成
# ============================================================================

# 生成指定數量的隨機光表資料（可指定種子值）
# 使用方法：GET /api/get_rand_lightlist/cnt={cnt}/seed={seed}，無需驗證
# 使用場景：測試光表效果、產生演示資料
@api_router.get("/get_rand_lightlist/cnt={cnt}/seed={seed}")
async def get_rand_lightlist_seeded(cnt : int,seed : int):
    if not (1 <= cnt <= 1500):
        raise HTTPException(status_code=400, detail="cnt 必須介於 1 和 1500 之間")
    random.seed(seed)
    time_values = random.sample(range(1500), cnt)
    
    time_values.sort()
    
    data = []
    for t in time_values:
        item = {
            "time": str(t),
            "head": str(random.randint(0, 2147483647)),
            "shoulder": str(random.randint(0, 2147483647)),
            "chest": str(random.randint(0, 2147483647)),
            "front": str(random.randint(0, 2147483647)),
            "skirt": str(random.randint(0, 2147483647)),
            "leg": str(random.randint(0, 2147483647)),
            "shoes": str(random.randint(0, 2147483647))
        }
        data.append(item)
    
    response = {
        "color_data": data
    }
    
    json_str = json.dumps(response, ensure_ascii=False)
    
    # return json_str
    return response

# 生成指定數量的隨機光表資料（自動種子值）
# 使用方法：GET /api/get_rand_lightlist/cnt={cnt}，無需驗證
# 使用場景：快速生成隨機測試資料
@api_router.get("/get_rand_lightlist/cnt={cnt}")
async def get_rand_lightlist(cnt : int):
    if not (1 <= cnt <= 1500):
        raise HTTPException(status_code=400, detail="cnt 必須介於 1 和 1500 之間")
    
    time_values = random.sample(range(1500), cnt)
    
    time_values.sort()
    
    data = []
    for t in time_values:
        item = {
            "time": str(t),
            "head": str(random.randint(0, 2147483647)),
            "shoulder": str(random.randint(0, 2147483647)),
            "chest": str(random.randint(0, 2147483647)),
            "arm_waist": str(random.randint(0, 2147483647)),
            "leg1": str(random.randint(0, 2147483647)),
            "leg2": str(random.randint(0, 2147483647)),
            "shoes": str(random.randint(0, 2147483647))
        }
        data.append(item)
    
    response = {
        "color_data": data
    }
    
    json_str = json.dumps(response, ensure_ascii=False)
    
    # return json_str
    return response

# 生成指定數量的隨機光表資料（JSON 格式）
# 使用方法：GET /api/get_rand_lightlist/json/cnt={cnt}，無需驗證
# 使用場景：獲取原始 JSON 格式的隨機資料
@api_router.get("/get_rand_lightlist/json/cnt={cnt}")
async def get_rand_lightlist_json(cnt : int):
    if not (1 <= cnt <= 1500):
        raise HTTPException(status_code=400, detail="cnt 必須介於 1 和 1500 之間")
    
    time_values = random.sample(range(1500), cnt)
    time_values.sort()
    
    data = []
    for t in time_values:
        item = {
            "time": str(t),
            "head": str(random.randint(0, 2147483647)),
            "shoulder": str(random.randint(0, 2147483647)),
            "chest": str(random.randint(0, 2147483647)),
            "arm_waist": str(random.randint(0, 2147483647)),
            "leg1": str(random.randint(0, 2147483647)),
            "leg2": str(random.randint(0, 2147483647)),
            "shoes": str(random.randint(0, 2147483647))
        }
        data.append(item)
    
    response = {
        "color_data": data
    }
    
    return response

# 生成指定數量的測試光表資料（固定模式）
# 使用方法：GET /api/get_test_lightlist/cnt={cnt}，無需驗證
# 使用場景：系統測試、效能基準測量
@api_router.get("/get_test_lightlist/cnt={cnt}")
async def get_test_lightlist(cnt : int):

    BLACK  = int("0x000000FF", 16) 
    RED    = int("0xFF0000FF", 16)
    GREEN  = int("0x00FF00FF", 16)
    BLUE   = int("0x0000FFFF", 16)
    YELLOW = int("0xFFFF00FF", 16)
    CYAN   = int("0x00FFFFFF", 16)
    PURPLE = int("0xFF00FFFF", 16)
    WHITE  = int("0xFFFFFFFF", 16)
    COLOR  = [BLACK, RED, GREEN, BLUE, YELLOW, CYAN, PURPLE, WHITE]

    data = []
    for i in range(0, cnt):
        item = {
            "time"      : str(i),
            "head"      : str(COLOR[(i>>8) & 3]-250),
            "shoulder"  : str(COLOR[(i>>6) & 3]-250),
            "chest"     : str(COLOR[(i>>4) & 3]-250),
            "arm_waist" : str(COLOR[(i>>2) & 3]-250),
            "leg1"      : str(COLOR[(i>>12) & 3]-250),
            "leg2"      : str(COLOR[(i>>10) & 3]-250),
            "shoes"     : str(COLOR[(i>>0) & 3]-250)        
        }
        data.append(item)

    response = {
        "color_data": data
    }
    
    return response

# 生成指定數量的測試光表資料（分塊模式）
# 使用方法：GET /api/get_test_lightlist/cnt={cnt}/chunk={chunk}，無需驗證
# 使用場景：大量資料測試時分批載入
@api_router.get("/get_test_lightlist/cnt={cnt}/chunk={chunk}")
async def get_test_lightlist_chunk(cnt : int, chunk : int):

    BLACK  = int("0x000000FF", 16) 
    RED    = int("0xFF0000FF", 16)
    GREEN  = int("0x00FF00FF", 16)
    BLUE   = int("0x0000FFFF", 16)
    YELLOW = int("0xFFFF00FF", 16)
    CYAN   = int("0x00FFFFFF", 16)
    PURPLE = int("0xFF00FFFF", 16)
    WHITE  = int("0xFFFFFFFF", 16)
    COLOR  = [BLACK, RED, GREEN, BLUE, YELLOW, CYAN, PURPLE, WHITE]

    CHUNK_SIZE = 100

    data = []
    for i in range(chunk*CHUNK_SIZE, min((chunk+1)*CHUNK_SIZE, cnt)):
        item = {
            "time"      : str(i),
            "head"      : str(COLOR[(i>>8) & 3]-250),
            "shoulder"  : str(COLOR[(i>>6) & 3]-250),
            "chest"     : str(COLOR[(i>>4) & 3]-250),
            "arm_waist" : str(COLOR[(i>>2) & 3]-250),
            "leg1"      : str(COLOR[(i>>12) & 3]-250),
            "leg2"      : str(COLOR[(i>>10) & 3]-250),
            "shoes"     : str(COLOR[(i>>0) & 3]-250)        
        }
        data.append(item)

    response = {
        "color_data": data
    }
    
    return response

# 韌體組測試字串測試API
# 使用方法：GET /api/get_test_lightlist/cnt={cnt}/chunk={chunk}，無需驗證
# 使用場景：給韌體組測試用的字串
@api_router.get("/test/get_test_color")
async def get_test_string():
    test_color = {
        "color1": [
            "0x000000FF", "0xFF0000FF", "0x00FF00FF", "0x0000FFFF",
            "0xFFFF00FF", "0x00FFFFFF", "0xFF00FFFF", "0xFFFFFFFF",
            "0x000000FF", "0xFF0000FF", "0x00FF00FF", "0x0000FFFF"
        ]
        ,"color2": [
            "0x000000FF", "0xFF0000FF", "0x00FF00FF", "0x0000FFFF",
            "0xFFFF00FF", "0x00FFFFFF", "0xFF00FFFF", "0xFFFFFFFF",
            "0x000000FF", "0xFF0000FF", "0x00FF00FF", "0x0000FFFF"
        ]
    }
    return test_color

# 將 API 路由器加入到主應用程式
app.include_router(api_router)