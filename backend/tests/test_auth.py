"""
身份驗證的回歸測試。

這裡守的是**兩個真的洞**，不是一般的功能行為：

1. 舊版的權杖就是使用者名稱（`decode_token` 直接拿它去查人），所以任何人送
   `Authorization: Bearer <某個帳號名>` 都會通過，密碼完全不需要。
2. 密碼是明文比對，資料庫裡存的也是明文。

修法必須同時滿足「不能有人被鎖在外面」——現場帳號的密碼欄位還是明文，
所以登入要兩種都認，並在成功時就地換成雜湊。

測試用假的 collection 取代 pymongo，不需要真的 MongoDB。
"""

import pytest
from fastapi.testclient import TestClient

import auth
import main


class FakeUsers:
    """只實作 find_one / update_one 的假 users collection。"""

    def __init__(self, documents):
        self.documents = documents

    def find_one(self, query, sort=None):
        for doc in self.documents:
            if all(doc.get(key) == value for key, value in query.items()):
                return doc
        return None

    def update_one(self, query, update):
        doc = self.find_one(query)
        if doc is not None:
            doc.update(update["$set"])


@pytest.fixture
def users(monkeypatch):
    """一個明文密碼的舊帳號（現場資料就長這樣）+ 一個已經雜湊的新帳號。"""
    collection = FakeUsers(
        [
            {"username": "alice", "password": "pw-alice", "disabled": False},
            {
                "username": "bob",
                "password": auth.hash_password("pw-bob"),
                "disabled": False,
            },
        ]
    )
    monkeypatch.setattr(main, "user_list", collection)
    return collection


@pytest.fixture
def client():
    return TestClient(main.app)


def login(client, username, password):
    return client.post(
        "/api/token", data={"username": username, "password": password}
    )


# ---------------------------------------------------------------------------
# 權杖
# ---------------------------------------------------------------------------

def test_使用者名稱不再是合法權杖(users, client):
    """
    這是這次修的主要問題。

    舊版 `decode_token(token)` 就是 `get_user(user_list, token)`——權杖與使用者
    名稱是同一個字串。帳號名稱不是秘密，於是知道有誰在用這個系統就等於登入。
    """
    response = client.get("/api/users/me", headers={"Authorization": "Bearer alice"})
    assert response.status_code == 401


def test_登入拿到的權杖可以用(users, client):
    token = login(client, "alice", "pw-alice").json()["access_token"]
    response = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "alice"


def test_亂簽的權杖不會過(users, client):
    forged = auth.jwt.encode(
        {"sub": "alice"}, "another-secret-that-is-long-enough-32b", algorithm=auth.ALGORITHM
    )
    response = client.get("/api/users/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_過期的權杖不會過(users, client):
    expired = auth.create_access_token("alice", ttl_hours=-1)
    response = client.get("/api/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_權杖裡的人被刪掉之後就失效(users, client):
    token = login(client, "alice", "pw-alice").json()["access_token"]
    users.documents.clear()
    response = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# 密碼
# ---------------------------------------------------------------------------

def test_明文舊資料仍然登得進去(users, client):
    """現場帳號的密碼欄位還是明文，改成只認雜湊的話那些人全部被鎖在外面。"""
    assert login(client, "alice", "pw-alice").status_code == 200


def test_登入成功會把明文就地換成雜湊(users, client):
    assert users.documents[0]["password"] == "pw-alice"

    login(client, "alice", "pw-alice")

    stored = users.documents[0]["password"]
    assert auth.is_hashed(stored)
    assert auth.verify_password("pw-alice", stored)
    # 換完之後還要能再登入一次，否則等於自己把人鎖在外面
    assert login(client, "alice", "pw-alice").status_code == 200


def test_已經雜湊的帳號正常運作(users, client):
    assert login(client, "bob", "pw-bob").status_code == 200
    assert login(client, "bob", "錯的").status_code == 400


def test_密碼錯了就是錯了(users, client):
    assert login(client, "alice", "pw-bob").status_code == 400


def test_含中文的密碼不會把登入弄成_500(users, client):
    """
    回歸測試。明文比對曾經用 `secrets.compare_digest` 比 str，而它遇到非 ASCII
    字元會直接丟 TypeError——密碼是使用者自己取的，裡面有中文完全合理，
    那些人登入會拿到 500 而不是「密碼錯誤」。
    """
    assert login(client, "alice", "中文密碼").status_code == 400

    users.documents.append(
        {"username": "carol", "password": "中文密碼", "disabled": False}
    )
    assert login(client, "carol", "中文密碼").status_code == 200
    assert auth.is_hashed(users.documents[-1]["password"])


def test_不存在的帳號與密碼錯誤給一樣的回應(users, client):
    """兩者的訊息與狀態碼要一致，否則可以拿來探測「有沒有這個帳號」。"""
    missing = login(client, "nobody", "whatever")
    wrong = login(client, "alice", "錯的")
    assert missing.status_code == wrong.status_code == 400
    assert missing.json() == wrong.json()


# ---------------------------------------------------------------------------
# 雜湊本身
# ---------------------------------------------------------------------------

def test_同一個密碼每次雜湊都不一樣(users):
    """有 salt 才會這樣；兩次相同代表 salt 沒生效，彩虹表就有用了。"""
    assert auth.hash_password("pw") != auth.hash_password("pw")


def test_雜湊過的密碼認得出來(users):
    assert auth.is_hashed(auth.hash_password("pw"))
    assert not auth.is_hashed("pw")
    assert not auth.is_hashed("")


def test_壞掉的雜湊不會炸掉只會驗不過(users):
    """手動改過資料庫之類的情況：要回 False，不要拋例外把整個登入弄成 500。"""
    assert auth.verify_password("pw", "$2b$看起來像雜湊但不是") is False
    assert auth.verify_password("pw", None) is False


# ============================================================================
# 密碼遷移的進度檢查（audit_passwords.py）
# ============================================================================


def test_audit_classifies_plaintext_and_hashed():
    """
    懶惰遷移的代價是「你不知道什麼時候遷移完」。這支分類要能分得出來，
    否則沒有辦法知道還剩誰沒換。
    """
    from audit_passwords import classify

    hashed, plaintext, missing = classify(
        [
            {"username": "alice", "password": auth.hash_password("pw")},
            {"username": "bob", "password": "明文密碼"},
            {"username": "carol", "password": ""},
            {"username": "dave"},
        ]
    )

    assert hashed == ["alice"]
    assert plaintext == ["bob"]
    assert sorted(missing) == ["carol", "dave"]


def test_audit_never_returns_passwords():
    """
    ⚠️ 輸出只有帳號名稱。這支腳本的結果可能被貼進聊天室或截圖，
    把密碼帶出來等於自己製造一次外洩。
    """
    from audit_passwords import classify

    secret = "不可以出現在輸出裡"
    result = classify([{"username": "bob", "password": secret}])

    assert secret not in str(result)
    assert result[1] == ["bob"]


# ============================================================================
# AUTH_SECRET 漏設時的行為
# ============================================================================


def test_missing_secret_is_fatal_when_required(monkeypatch):
    """
    ⚠️ 正式環境漏設秘鑰要**啟動失敗**，不是印一行警告。

    臨時產生的秘鑰讓服務跑得起來，但每次重啟都會換一把、所有人被登出——而那個
    症狀（「怎麼又要登入」）看起來像網站不穩，不像設定漏了。啟動日誌裡的一行
    warning 沒有人會看到。`docker-compose.prod.yml` 設了 REQUIRE_AUTH_SECRET=1。
    """
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    monkeypatch.setenv("REQUIRE_AUTH_SECRET", "1")

    with pytest.raises(auth.MissingSecretError):
        auth._load_secret()


def test_missing_secret_is_tolerated_in_development(monkeypatch):
    """開發環境不必先設定就跑得起來，代價是重啟要重新登入一次。"""
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    monkeypatch.delenv("REQUIRE_AUTH_SECRET", raising=False)

    generated = auth._load_secret()

    assert isinstance(generated, str) and len(generated) >= 32
    # 每次都是不同的一把——這正是重啟會把大家登出的原因
    assert generated != auth._load_secret()


def test_explicit_secret_wins_even_when_required(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "a-real-secret")
    monkeypatch.setenv("REQUIRE_AUTH_SECRET", "1")

    assert auth._load_secret() == "a-real-secret"


def test_require_flag_accepts_the_usual_falsy_spellings(monkeypatch):
    """`REQUIRE_AUTH_SECRET=0` 或空字串要當成「不強制」，否則開發環境會炸。"""
    monkeypatch.delenv("AUTH_SECRET", raising=False)

    for value in ("", "0", "false", "False", "  "):
        monkeypatch.setenv("REQUIRE_AUTH_SECRET", value)
        assert isinstance(auth._load_secret(), str)
