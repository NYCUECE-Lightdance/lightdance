"""
`/api/register` —— 在登入頁自己建帳號。

要守住的幾件事：

- 這條路徑**永遠不會產生明文密碼**（整個專案花了很多力氣才把明文清掉）
- 帳號名稱同時是網址片段與檔案路徑片段，字元集要在建立時就管好
- 重複的帳號要擋掉：資料庫裡有兩個同名帳號時，`find_one` 回哪一個是沒有定義
  的行為，密碼對不上的那位就登不進來
"""

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError, OperationFailure

import auth
import main
from tests.test_storage import FakeCollection


@pytest.fixture
def users(monkeypatch):
    collection = FakeCollection("users")

    def find_one(query, projection=None):
        for doc in collection.documents:
            if all(doc.get(k) == v for k, v in query.items()):
                return doc
        return None

    collection.find_one = find_one
    monkeypatch.setattr(main, "user_list", collection)
    # 邀請碼是必填的，所以「能建帳號」的測試都得先有一組碼可以填。
    # 沒設的情形另外驗（見下面的「沒設邀請碼 = 關閉註冊」）
    monkeypatch.setenv("REGISTER_CODE", TEST_CODE)
    return collection


@pytest.fixture
def client():
    return TestClient(main.app)


#: `users` fixture 預設設好的邀請碼。每則測試都要填對它才建得起來
TEST_CODE = "test-invite-code"


def post(client, **over):
    body = {
        "username": "newcomer",
        "password": "password123",
        "invite_code": TEST_CODE,
        **over,
    }
    return client.post("/api/register", json=body)


# ============================================================================
# 正常路徑
# ============================================================================


def test_creates_account_and_returns_a_usable_token(client, users):
    response = post(client)

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "newcomer"
    # 直接給權杖：剛設好密碼的人不必再打一次登入表單
    assert auth.read_token(body["access_token"]) == "newcomer"


def test_password_is_never_stored_in_plaintext(client, users):
    """
    ⚠️ 這是這個檔案存在的主要理由。

    整個專案花了很多力氣把明文密碼清掉（懶惰遷移 + 種子帳號改雜湊），
    新增一條建立帳號的路徑時最容易做的就是又寫回明文——而
    `verify_password` 為了相容舊資料連明文也認得，所以**登入完全正常**，
    沒有任何症狀。
    """
    post(client, password="hunter2000")

    stored = users.documents[0]["password"]
    assert stored != "hunter2000"
    assert auth.is_hashed(stored)
    assert auth.verify_password("hunter2000", stored)


def test_new_account_can_log_in(client, users):
    """建完之後真的登得進去（走的是既有的 /api/token）。"""
    post(client, username="dancer", password="password123")

    response = client.post(
        "/api/token", data={"username": "dancer", "password": "password123"}
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


# ============================================================================
# 帳號名稱的規則
# ============================================================================


@pytest.mark.parametrize(
    "username",
    [
        "ab",              # 太短
        "a" * 33,          # 太長
        "with space",      # 空白
        "..evil",          # 相對路徑
        ".hidden",         # 開頭是句點
        "who/../etc",      # 路徑分隔符號
        "中文帳號",          # 非 ASCII：它會變成目錄名稱
        "",
    ],
)
def test_rejects_names_that_are_unsafe_as_a_path_component(client, users, username):
    """
    帳號名稱會被當成 `{MUSIC_FILE_PATH}/{username}/` 的一段，也會出現在網址裡。
    `safe_component` 是最後一道防線，不該是唯一一道。
    """
    response = post(client, username=username)

    assert response.status_code == 422
    assert users.documents == []


def test_username_is_trimmed(client, users):
    assert post(client, username="  spaced  ").status_code == 201
    assert users.documents[0]["username"] == "spaced"


# ============================================================================
# 密碼的規則
# ============================================================================


def test_rejects_short_password(client, users):
    assert post(client, password="short").status_code == 422
    assert users.documents == []


def test_rejects_password_longer_than_bcrypt_actually_reads(client, users):
    """
    ⚠️ bcrypt **只看前 72 個 byte**，超過的部分直接丟掉而且不會有錯誤。

    允許使用者設一個 100 字的密碼，他以為自己很安全，實際上後面的字完全沒有
    作用。明確擋掉比默默截斷誠實。中文一個字 3 bytes，所以算的是 byte。
    """
    assert post(client, password="中" * 25).status_code == 422
    assert users.documents == []


# ============================================================================
# 重複與失敗
# ============================================================================


def test_rejects_duplicate_username(client, users):
    post(client, username="taken")

    response = post(client, username="taken")

    assert response.status_code == 409
    assert len(users.documents) == 1


def test_relies_on_the_unique_index_not_just_the_pre_check(client, users):
    """
    「先 find_one 再 insert」中間有一段空窗，兩個人同時註冊同一個名字會兩邊都
    通過檢查。真正的保證是 `users.username` 的唯一索引——這裡模擬它擋下來。
    """
    users.fail_insert = DuplicateKeyError("E11000")

    response = post(client)

    assert response.status_code == 409
    assert "已經有人用了" in response.json()["detail"]


def test_database_failure_is_reported_not_swallowed(client, users):
    users.fail_insert = OperationFailure("disk full")

    response = post(client)

    assert response.status_code == 503
    assert users.documents == []


# ============================================================================
# 邀請碼
# ============================================================================


def test_registration_is_closed_when_no_code_is_configured(client, users, monkeypatch):
    """
    ⚠️ 這則守的是 **fail-closed**。

    舊版「沒設 REGISTER_CODE = 開放註冊」是 fail-open 的：漏設一個環境變數的
    後果是任何知道網址的人都能在資料庫裡開帳號，而那條路壞掉時畫面上完全正常
    ——註冊成功、登入成功、什麼異常都沒有。設定漏了應該要撞牆。

    回 503 不是 403：這不是「你填錯了」，是這個站台根本沒開這條路，訊息要講得
    出下一步（找管理員），否則使用者只會一直重填邀請碼。
    """
    monkeypatch.delenv("REGISTER_CODE", raising=False)

    response = post(client)

    assert response.status_code == 503
    assert users.documents == []
    assert "管理員" in response.json()["detail"]


def test_a_blank_code_is_also_closed(client, users, monkeypatch):
    """整串空白等於沒設。不 strip 的話 `REGISTER_CODE=" "` 會變成一組空白邀請碼。"""
    monkeypatch.setenv("REGISTER_CODE", "   ")

    assert post(client, invite_code="   ").status_code == 503
    assert users.documents == []


def test_requires_the_right_code(client, users):
    assert post(client, invite_code=None).status_code == 403
    assert post(client, invite_code="").status_code == 403
    assert post(client, invite_code="wrong").status_code == 403
    assert users.documents == []

    assert post(client, invite_code=TEST_CODE).status_code == 201


def test_surrounding_whitespace_in_the_code_is_forgiven(client, users):
    """使用者是從聊天室複製貼上的，前後多一個空白很常見。"""
    assert post(client, invite_code=f"  {TEST_CODE}  ").status_code == 201


def test_invite_code_with_non_ascii_does_not_crash(client, users, monkeypatch):
    """
    compare_digest 收到含非 ASCII 的 str 會丟 TypeError（500 而不是 403）。
    這和 auth.verify_password 踩過的是同一個坑，所以比的是 bytes。
    """
    monkeypatch.setenv("REGISTER_CODE", "通關密語")

    assert post(client, invite_code="猜錯了").status_code == 403
    assert post(client, invite_code="通關密語").status_code == 201
