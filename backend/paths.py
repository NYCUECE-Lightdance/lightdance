"""
把使用者給的字串安全地接成檔案路徑。

## 為什麼需要這個

音樂檔的三支端點都是直接把網址裡的字串接進路徑：

```python
file_location = f'{MUSIC_FILE_PATH}/{username}/{filename}'   # 沒有任何檢查
```

FastAPI 的 `{param}` 不會匹配 `/`，看起來好像安全。實測（TestClient 逐個試）
的結果是：把**斜線**編碼起來（`..%2F..%2Fx`）會在路由階段被擋掉，但把**點**
編碼起來就進得來——`GET /api/get_music/%2e%2e/secret.txt` 到函式裡時
`username` 就是 `..`。同樣進得來的還有 `.%2e`、`..%5c..%5cx`（反斜線）
與含 NUL 的 `a%00b`。

實際驗證過舊版的行為：那支端點**沒有任何驗證**（連登入都不用），
`/api/get_music/%2e%2e/secret.txt` 回 200 並吐出音樂根目錄外面那個檔案的內容。
所以這不是理論上的風險，是可以直接用的任意檔案讀取。

上傳那支更直接——`file.filename` 完全由客戶端決定，寫檔時原樣接上去：

```python
file_loc = file_location + '/' + file.filename    # 檔名是 ../../something 就寫到外面
```

## 兩道防線

1. `safe_component()`：路徑片段只允許「一段名字」，出現 `/`、`\\`、`..`、
   空字串或 NUL 就拒絕。
2. `resolve_within()`：接完之後**再確認結果真的落在根目錄底下**。
   第一道是白名單式的檢查，第二道是拿實際解析出來的路徑去比對——
   符號連結之類第一道看不出來的東西由它擋。

兩道都留著是刻意的：任何一道單獨都足以擋掉已知的攻擊，但這種地方值得付
兩次成本，因為漏掉的代價是任意讀檔／任意寫檔。
"""

from __future__ import annotations

import os

#: 檔名裡明確不允許的東西。`..` 單獨列出來是因為它本身是合法字元組合，
#: 只有整段等於 `..`（或含有它）時才是路徑穿越。
_FORBIDDEN = ("/", "\\", "\x00")


class UnsafePathError(ValueError):
    """使用者給的片段不能拿來組路徑。呼叫端應轉成 400。"""


def safe_component(value: str, *, label: str = "path") -> str:
    """
    檢查單一路徑片段（使用者名稱、檔名）。

    通過就原樣回傳，不通過丟 `UnsafePathError`——**不要「清理」它**。
    把 `../` 刪掉再用是個常見但危險的作法：`....//` 清一次之後正好變成 `../`。
    看到不對的東西就拒絕，不要試著修好它。
    """
    if not isinstance(value, str) or not value:
        raise UnsafePathError(f"{label} 不能是空的")

    if any(bad in value for bad in _FORBIDDEN):
        raise UnsafePathError(f"{label} 不能包含路徑分隔符號")

    if value in (".", "..") or value.startswith(".."):
        raise UnsafePathError(f"{label} 不能是相對路徑")

    return value


def resolve_within(root: str, *parts: str) -> str:
    """
    把片段接到 `root` 底下並確認結果沒有跑出去。

    先逐段跑 `safe_component`，再用 `realpath` 解析（跟著符號連結走），
    最後比對共同前綴。回傳解析後的絕對路徑。
    """
    checked = [safe_component(part, label="路徑") for part in parts]

    root_real = os.path.realpath(root)
    target = os.path.realpath(os.path.join(root_real, *checked))

    # commonpath 會正規化兩邊，所以 `/music-evil` 不會被誤判成在 `/music` 底下
    if os.path.commonpath([root_real, target]) != root_real:
        raise UnsafePathError("路徑超出允許的目錄")

    return target
