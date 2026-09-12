"""
MongoDB 儲存規則的測試。

用假的 collection 取代 pymongo（和 `test_raw_endpoint.py` 同一套做法）——這裡要
驗的是「我們對資料庫下了什麼指令、失敗時怎麼收拾」，不是 mongo 本身的行為。

真正要靠這些測試守住的，是幾件**壞掉時畫面上看不出來**的事：

- 兩份文件只寫成功一份（版本「跑得動但打不開」）
- 驗證失敗卻回報上傳成功（使用者以為存好了）
- 保留策略在沒有明確設定時就把舊版本刪掉
"""

from datetime import datetime, timezone

import pytest
from pymongo.errors import DuplicateKeyError, OperationFailure

import storage


# ============================================================================
# 假的 collection
# ============================================================================


class FakeCollection:
    """記錄自己被下了哪些指令，並可以指定第 N 次寫入要失敗。"""

    def __init__(self, name="fake", documents=None, fail_insert=None):
        self.name = name
        self.documents = list(documents or [])
        self.fail_insert = fail_insert  # 例外實例，或 None
        self.indexes = []
        self.deleted = []

    # --- 寫入 ---------------------------------------------------------
    def insert_one(self, document):
        if self.fail_insert is not None:
            raise self.fail_insert
        document = dict(document)
        document.setdefault("_id", f"id-{len(self.documents)}")
        self.documents.append(document)
        return type("Result", (), {"inserted_id": document["_id"]})()

    def delete_one(self, query):
        before = len(self.documents)
        self.documents = [d for d in self.documents if d.get("_id") != query.get("_id")]
        self.deleted.append(query)
        return type("Result", (), {"deleted_count": before - len(self.documents)})()

    def delete_many(self, query):
        keep_ids = query.get("_id", {}).get("$nin", [])
        user = query.get("user")
        before = len(self.documents)
        self.documents = [
            d
            for d in self.documents
            if d.get("user") != user or d.get("_id") in keep_ids
        ]
        self.deleted.append(query)
        return type("Result", (), {"deleted_count": before - len(self.documents)})()

    # --- 讀取 ---------------------------------------------------------
    def find(self, query, projection=None):
        matched = [
            d
            for d in self.documents
            if all(d.get(k) == v for k, v in query.items())
        ]
        return FakeCursor(matched)

    # --- 索引 ---------------------------------------------------------
    def create_index(self, keys, unique=False, background=False):
        self.indexes.append((tuple(keys), unique))
        return "_".join(f"{k}_{d}" for k, d in keys)


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, field, direction=1):
        if isinstance(field, list):
            for key, way in reversed(field):
                self.documents.sort(key=lambda d: d.get(key), reverse=way < 0)
        else:
            self.documents.sort(key=lambda d: d.get(field), reverse=direction < 0)
        return self

    def limit(self, n):
        self.documents = self.documents[:n]
        return self

    def __iter__(self):
        return iter(self.documents)


class FailingIndexCollection(FakeCollection):
    """唯一索引一律失敗（模擬既有資料就有重複），一般索引成功。"""

    def create_index(self, keys, unique=False, background=False):
        if unique:
            raise OperationFailure("E11000 duplicate key error")
        return super().create_index(keys, unique=False, background=background)

    def aggregate(self, pipeline):
        return [
            {"_id": {"user": "alice", "update_time": "2026-08-15-12:00:00"}, "count": 2}
        ]


class FakeDB:
    def __init__(self, factory=FakeCollection):
        self.collections = {}
        self.factory = factory

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = self.factory(name)
        return self.collections[name]


# ============================================================================
# 時間戳
# ============================================================================


def test_stamp_keeps_lexicographic_order_with_old_records():
    """
    毫秒接在秒後面，字典序仍然等於時間序。

    這是整個時間戳設計的關鍵：`update_time` 同時是排序鍵，而資料庫裡還有大量
    只到秒的舊紀錄。順序一旦錯了，`LATEST` 會回傳一份舊光表——而畫面上完全
    看不出來（它確實回了一份合法的光表）。
    """
    old = "2026-08-15-12:34:56"
    new = "2026-08-15-12:34:56.789"
    later = "2026-08-15-12:34:57"

    assert old < new < later
    assert sorted([later, old, new]) == [old, new, later]


def test_stamp_has_millisecond_suffix():
    stamp = storage.now_stamp()
    date, _, millis = stamp.rpartition(".")

    assert len(millis) == 3 and millis.isdigit()
    # 前半仍然是舊格式，長度固定（定寬才能靠字典序排序）
    assert len(date) == len("2026-08-15-12:34:56")


def test_now_utc_is_timezone_aware():
    """`update_time` 是本地時間字串，所以真正的時間點要另外有時區。"""
    assert storage.now_utc().tzinfo is not None


# ============================================================================
# 索引
# ============================================================================


def test_ensure_indexes_covers_the_queries_we_actually_make():
    db = FakeDB()
    created, failed = storage.ensure_indexes(db, log=lambda *_: None)

    assert failed == []
    color_indexes = db["color"].indexes
    assert ((("user", 1), ("update_time", -1)), True) in color_indexes
    assert ((("user", 1), ("update_time", -1)), True) in db["raw_json"].indexes
    assert ((("username", 1),), True) in db["users"].indexes
    assert len(created) == 3


def test_unique_index_falls_back_when_existing_data_has_duplicates():
    """
    既有資料就有重複時唯一索引建不起來。那時要退成一般索引——查詢還是快，
    只是擋不住新的重複。**不能因此整個啟動失敗**。
    """
    db = FakeDB(factory=FailingIndexCollection)
    logged = []
    created, failed = storage.ensure_indexes(db, log=logged.append)

    assert failed == []
    assert all(unique is False for _, _, unique in created)
    assert any("退成一般索引" in line for line in logged)
    # 光說「有重複」沒有用，要指出是哪幾筆才清得掉
    assert any("alice" in line for line in logged)


def test_ensure_indexes_never_raises_when_db_is_unreachable():
    """資料庫連不上時服務還是要起得來，讀寫再各自失敗並回報。"""

    class DeadCollection(FakeCollection):
        def create_index(self, keys, unique=False, background=False):
            raise OperationFailure("connection refused")

    db = FakeDB(factory=DeadCollection)
    created, failed = storage.ensure_indexes(db, log=lambda *_: None)

    assert created == []
    assert len(failed) == 3


# ============================================================================
# 文件形狀
# ============================================================================


def test_music_filename_is_always_a_string():
    """
    先前預設值在兩個地方是 `0`（整數），於是同一個欄位在資料庫裡同時存在字串與
    整數兩種型別。前端 `item.music_filename || "未設定"` 對 `0` 也是 falsy，
    所以一直沒有人發現。
    """
    for value in (0, None, "", 123):
        doc = storage.color_document("u", "t", [], value)
        assert isinstance(doc["music_filename"], str)

    assert storage.color_document("u", "t", [], 0)["music_filename"] == ""
    assert storage.color_document("u", "t", [], "a.mp3")["music_filename"] == "a.mp3"


def test_raw_document_copies_music_filename_to_top_level():
    """
    `raw_data` 是前端的黑盒子（一整串 JSON），後端不解析。但「這一版是哪首歌」
    要能不 parse 就查得到，否則清單頁得把每一版的整串 JSON 拉出來。
    """
    doc = storage.raw_document("u", "t", '{"actionTable":[]}', "opening.mp3")

    assert doc["music_filename"] == "opening.mp3"
    assert doc["raw_data"] == '{"actionTable":[]}'


def test_documents_carry_a_real_timestamp():
    doc = storage.color_document("u", "t", [], "a.mp3")
    assert isinstance(doc["created_at"], datetime)
    assert doc["created_at"].tzinfo == timezone.utc


# ============================================================================
# 成對寫入
# ============================================================================


def test_insert_show_writes_both():
    color, raw = FakeCollection("color"), FakeCollection("raw_json")

    storage.insert_show(color, raw, color={"user": "u"}, raw={"user": "u"})

    assert len(color.documents) == 1
    assert len(raw.documents) == 1


def test_insert_show_rolls_back_raw_when_color_fails():
    """
    ⚠️ 這是這個檔案最重要的一則。

    兩份文件必須成對存在：`color` 是韌體要播的、`raw` 是編輯器要載回來的。
    只留下 raw 的話，那個版本在清單上看起來完全正常，載入也打得開，
    但**韌體那邊沒有東西可以播**。
    """
    color = FakeCollection("color", fail_insert=OperationFailure("disk full"))
    raw = FakeCollection("raw_json")

    with pytest.raises(storage.StorageError):
        storage.insert_show(color, raw, color={"user": "u"}, raw={"user": "u"})

    assert raw.documents == [], "color 失敗時 raw 不能留下來"


def test_insert_show_reports_duplicate_version_clearly():
    """同一毫秒重複上傳時，訊息要讓使用者知道可以再試一次。"""
    color = FakeCollection("color", fail_insert=DuplicateKeyError("dup"))
    raw = FakeCollection("raw_json")

    with pytest.raises(storage.StorageError) as excinfo:
        storage.insert_show(color, raw, color={}, raw={})

    assert "重複上傳" in str(excinfo.value)


def test_rollback_failure_is_logged_not_swallowed():
    """回滾也失敗的話，資料庫裡真的留了孤兒——那要留下痕跡。"""

    class UndeletableCollection(FakeCollection):
        def delete_one(self, query):
            raise OperationFailure("no permission")

    color = FakeCollection("color", fail_insert=OperationFailure("boom"))
    raw = UndeletableCollection("raw_json")
    logged = []

    with pytest.raises(storage.StorageError):
        storage.insert_show(color, raw, color={}, raw={}, log=logged.append)

    assert any("孤兒" in line for line in logged)


# ============================================================================
# 保留策略
# ============================================================================


def make_versions(user, count):
    return [
        {"_id": f"v{i}", "user": user, "update_time": f"2026-08-{i + 1:02d}"}
        for i in range(count)
    ]


def test_prune_keeps_everything_by_default():
    """
    ⚠️ 預設**不刪任何東西**。這裡刪的是使用者存過的光表版本，刪掉就沒有了
    （備份是每兩天一次，中間那段沒有）。要刪必須明確設定 HISTORY_LIMIT。
    """
    collection = FakeCollection("color", make_versions("alice", 20))

    assert storage.prune_history(collection, "alice") == 0
    assert len(collection.documents) == 20


def test_prune_keeps_the_newest_n():
    collection = FakeCollection("color", make_versions("alice", 8))

    removed = storage.prune_history(collection, "alice", limit=3, log=lambda *_: None)

    assert removed == 5
    kept = sorted(d["update_time"] for d in collection.documents)
    assert kept == ["2026-08-06", "2026-08-07", "2026-08-08"]


def test_prune_does_nothing_when_under_the_limit():
    collection = FakeCollection("color", make_versions("alice", 2))

    assert storage.prune_history(collection, "alice", limit=5) == 0
    assert len(collection.documents) == 2


def test_prune_only_touches_that_user():
    docs = make_versions("alice", 5) + make_versions("bob", 5)
    for i, doc in enumerate(docs):
        doc["_id"] = f"id{i}"
    collection = FakeCollection("color", docs)

    storage.prune_history(collection, "alice", limit=1, log=lambda *_: None)

    assert sum(1 for d in collection.documents if d["user"] == "bob") == 5
