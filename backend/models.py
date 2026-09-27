"""
資料模型定義
此檔案包含所有 Pydantic 模型定義，用於 API 請求/回應的資料驗證和序列化

模型分類：
- 使用者相關：User, UserInDB
- 燈光控制相關：PlayerData, Player, Data
- 資料傳輸相關：RAW, Item
"""

from typing import List, Union
from pydantic import BaseModel


# ============================================================================
# 燈光控制相關模型
# ============================================================================

class PlayerData(BaseModel):
    """
    單一時間點的玩家燈光資料
    包含身體各部位的燈光顏色數值
    """
    time: int
    hat: int
    face: int
    chestL: int
    chestR: int
    armL: int
    armR: int
    tie: int
    belt: int
    gloveL: int
    gloveR: int
    legL: int
    legR: int
    shoeL: int
    shoeR: int
    acc0: int
    acc1: int
    acc2: int
    acc3: int
    acc4: int
    acc5: int
    acc6: int
    acc7: int


class Player(BaseModel):
    """
    單一玩家的完整燈光序列資料
    包含該玩家所有時間點的燈光設定
    """
    data: List[PlayerData]


class Data(BaseModel):
    """
    完整的燈光表演資料
    包含使用者資訊、更新時間和所有玩家的燈光序列
    """
    user: str
    last_updated_time: str
    players: List[Player] = []
    music_filename: str


# ============================================================================
# 資料傳輸相關模型
# ============================================================================

class RAW(BaseModel):
    """
    原始資料格式
    用於儲存未處理的 JSON 字串格式燈光資料
    """
    user: str
    last_updated_time: str
    raw_data: str


class FullUpload(BaseModel):
    """
    完整的上傳資料格式
    同時包含原始資料與處理後供播放用的資料
    """
    raw_data: str
    players: List[List[PlayerData]]
    music_filename: Union[str, int]


class RegisterRequest(BaseModel):
    """
    建立帳號。

    `invite_code` 是**必填**的，值來自後端的 `REGISTER_CODE`（見 main.py 的
    /api/register）。型別留 `None` 是因為「沒填」與「填錯」都要走到那支端點
    才判得出來——這裡擋掉的話回的是 Pydantic 的 422 而不是那句看得懂的訊息。
    """
    username: str
    password: str
    invite_code: Union[str, None] = None


class Item(BaseModel):
    """
    時間軸項目資料
    用於前端時間軸顯示的個別項目
    """
    ID: int
    update_time: str
    color: str


# ============================================================================
# 使用者相關模型
# ============================================================================

class User(BaseModel):
    """
    使用者基本資訊
    包含使用者名稱和停用狀態
    """
    username: str
    disabled: Union[bool, None] = None


class UserInDB(User):
    """
    資料庫中的使用者資訊
    繼承基本使用者資訊，額外包含密碼欄位
    """
    password: str