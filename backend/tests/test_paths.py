"""
音樂檔端點的路徑穿越回歸測試。

三支端點都是直接把使用者給的字串接進路徑：

```python
file_location = f'{MUSIC_FILE_PATH}/{username}/{filename}'   # 沒有任何檢查
file_loc = file_location + '/' + file.filename               # 上傳，檔名由客戶端決定
```

FastAPI 的 `{param}` 不匹配 `/` 讓它看起來安全。實測（用 TestClient 逐個試）
確認哪些寫法**真的會進到函式裡**：

| 寫法 | 結果 |
|---|---|
| `..%2F..%2Fx` | 404，`%2F` 在路由階段就被擋掉 |
| `/../x` | 404，客戶端與路由都會正規化 |
| **`%2e%2e`** | **200，參數值就是 `..`** |
| **`.%2e`** | **200，參數值就是 `..`** |
| **`..%5c..%5cx`** | **200，參數值含反斜線** |
| **`a%00b`** | **200，參數值含 NUL** |

也就是說穿越是真的做得到，只是走的是把**點**編碼起來而不是把斜線編碼起來。
下面的測試只用會進到函式裡的那幾種——用 `%2F` 的話測試會通過，但它是被路由
擋掉的，等於什麼都沒驗到。
"""

import os

import pytest
from fastapi.testclient import TestClient

import main
from paths import UnsafePathError, resolve_within, safe_component


@pytest.fixture
def music_dir(tmp_path, monkeypatch):
    """一個乾淨的音樂根目錄，裡面有 alice 的一首歌。"""
    root = tmp_path / "music"
    (root / "alice").mkdir(parents=True)
    (root / "alice" / "song.mp3").write_bytes(b"ID3fake")
    # 根目錄外面放一個「機密檔案」，穿越成功的話會讀到它
    (tmp_path / "secret.txt").write_text("不該被讀到")

    monkeypatch.setattr(main, "MUSIC_FILE_PATH", str(root))
    return root


@pytest.fixture
def client():
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# 端點
# ---------------------------------------------------------------------------

def test_正常的檔案讀得到(music_dir, client):
    response = client.get("/api/get_music/alice/song.mp3")
    assert response.status_code == 200
    assert response.content == b"ID3fake"


@pytest.mark.parametrize(
    "path",
    [
        # 這四種都實測過會進到函式裡（見檔案開頭的表）
        "/api/get_music/%2e%2e/secret.txt",
        "/api/get_music/alice/%2e%2e",
        "/api/get_music/alice/.%2e",
        "/api/get_music/alice/..%5c..%5csecret.txt",
        "/api/get_music/alice/song%00.mp3",
    ],
)
def test_路徑穿越被擋下來(music_dir, client, path):
    response = client.get(path)
    assert response.status_code == 400


def test_錯誤訊息不洩漏伺服器上的路徑(music_dir, client):
    """
    舊版是 `detail=f"file not found: {file_location}"`——把組出來的絕對路徑
    直接回給客戶端，等於免費告訴對方伺服器的目錄結構長什麼樣。
    """
    response = client.get("/api/get_music/alice/nope.mp3")
    assert response.status_code == 404
    assert str(music_dir) not in response.text


def test_音樂清單也擋穿越(music_dir, client):
    assert client.get("/api/get_music_list/alice").status_code == 200
    assert client.get("/api/get_music_list/%2e%2e").status_code == 400


# ---------------------------------------------------------------------------
# 純函式
# ---------------------------------------------------------------------------

def test_合法的片段原樣通過():
    assert safe_component("song.mp3") == "song.mp3"
    assert safe_component("2026_show 最終版.mp3") == "2026_show 最終版.mp3"


@pytest.mark.parametrize(
    "value",
    ["", "..", ".", "../x", "a/b", "a\\b", "a\x00b"],
)
def test_不合法的片段一律拒絕(value):
    with pytest.raises(UnsafePathError):
        safe_component(value)


def test_不要清理只要拒絕():
    """
    `....//` 之類的東西，「把 ../ 刪掉再用」清一次之後正好變成 `../`。
    所以看到不對的東西就拒絕，不要試著修好它。
    """
    with pytest.raises(UnsafePathError):
        safe_component("....//")


def test_接出來的路徑一定在根目錄底下(tmp_path):
    root = tmp_path / "music"
    root.mkdir()
    assert resolve_within(str(root), "alice", "song.mp3") == os.path.join(
        os.path.realpath(str(root)), "alice", "song.mp3"
    )


def test_相鄰的同名目錄不算在裡面(tmp_path):
    """
    `/music-evil` 的字串前綴是 `/music`，用 startswith 比會誤判成在裡面。
    commonpath 會正規化兩邊，不會有這個問題——這條測試守的就是別改回去用
    字串前綴比較。
    """
    (tmp_path / "music").mkdir()
    (tmp_path / "music-evil").mkdir()
    with pytest.raises(UnsafePathError):
        resolve_within(str(tmp_path / "music"), "..", "music-evil")
