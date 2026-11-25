"""
演出年份：年份怎麼算、請求落在哪一年的資料庫、舊資料怎麼搬。

最容易出錯而且看不出來的是「存到了別的年份」：上傳成功、清單正常，只是
清單是另一年的。所以端點的測試都直接檢查**被打開的是哪一年的集合**。
"""

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

import main
import migrate_to_seasons
import seasons
from tests.test_storage import FakeCollection, FakeDB
from tests.test_upload_full import VALID_PAYLOAD

CURRENT = 2027


# ============================================================================
# 年份怎麼算
# ============================================================================


@pytest.mark.parametrize(
    "day, season",
    [
        (date(2026, 1, 1), 2026),
        (date(2026, 6, 30), 2026),  # 電機營 6 月開始做……
        (date(2026, 7, 4), 2026),   # ……7 月初演出，同一個活動要在同一年
        (date(2026, 12, 31), 2026),
        (date(2027, 1, 1), 2027),
        (datetime(2026, 7, 1, 0, 0, 1), 2026),
    ],
)
def test_season_is_calendar_year_by_default(day, season):
    assert seasons.season_of(day) == season


def test_start_month_can_still_be_shifted(monkeypatch):
    # SEASON_START_MONTH=7：7 月到隔年 6 月算隔年
    monkeypatch.setattr(seasons, "SEASON_START_MONTH", 7)
    assert seasons.season_of(date(2026, 6, 30)) == 2026
    assert seasons.season_of(date(2026, 7, 1)) == 2027


@pytest.mark.parametrize(
    "stamp, season",
    [
        ("2026-08-15-12:00:00.123", 2026),  # 現在的格式（含毫秒）
        ("2026-03-01-09:30:00", 2026),      # 只到秒的舊格式
        ("2026-01-01_00-00-00", 2026),      # 更早期的底線格式
        ("LATEST", None),
        ("", None),
        ("not-a-date", None),
    ],
)
def test_season_from_version_stamp(stamp, season):
    assert seasons.season_of_stamp(stamp) == season


@pytest.mark.parametrize("value", [1999, 2101, "abc", None, 226])
def test_unreasonable_years_are_rejected(value):
    # 打錯字（?year=226）不該默默造出一個新資料庫
    with pytest.raises(ValueError):
        seasons.validate_season(value)


def test_database_names():
    assert seasons.database_name(2026) == "lightdance_2026"
    names = ["admin", "test", "lightdance_2026", "lightdance_2025", "lightdance_x", "other_2024"]
    assert seasons.seasons_from_database_names(names) == [2026, 2025]


# ============================================================================
# 請求落在哪一年
# ============================================================================


class SeasonStore:
    """每一年一組假的 (color, raw)，並記錄被打開過哪幾年。"""

    def __init__(self, documents=None):
        self.collections = {}
        self.opened = []
        for season, docs in (documents or {}).items():
            color, raw = self(season)
            color.documents.extend(docs)
            raw.documents.extend(docs)
        self.opened = []

    def __call__(self, season):
        self.opened.append(season)
        if season not in self.collections:
            self.collections[season] = (FindOneCollection("color"), FindOneCollection("raw_json"))
        return self.collections[season]


class FindOneCollection(FakeCollection):
    """test_storage 的假集合沒有 find_one，這裡補上（含 sort）。"""

    def find_one(self, query, projection=None, sort=None):
        matched = list(self.find(query))
        if sort:
            field, direction = sort[0]
            matched.sort(key=lambda doc: doc[field], reverse=direction < 0)
        return matched[0] if matched else None


DOC_2026 = {"user": "alice", "update_time": "2026-03-01-09:30:00", "raw_data": "去年的", "players": [[1]]}
DOC_2027 = {"user": "alice", "update_time": "2027-03-01-09:30:00", "raw_data": "今年的", "players": [[2]]}


@pytest.fixture
def store(monkeypatch):
    store = SeasonStore({2026: [DOC_2026], CURRENT: [DOC_2027]})
    monkeypatch.setattr(main, "show_collections", store)
    monkeypatch.setattr(main, "current_season", lambda: CURRENT)
    monkeypatch.setattr(
        main.app,
        "dependency_overrides",
        {main.get_current_active_user: lambda: main.User(username="alice")},
    )
    return store


@pytest.fixture
def client():
    return TestClient(main.app)


def test_without_year_lists_current_season(client, store):
    response = client.get("/api/timelist/alice")

    assert response.json()["year"] == CURRENT
    assert [e["update_time"] for e in response.json()["list"]] == [DOC_2027["update_time"]]
    assert store.opened == [CURRENT]


def test_year_parameter_selects_that_season(client, store):
    response = client.get("/api/timelist/alice?year=2026")

    assert [e["update_time"] for e in response.json()["list"]] == [DOC_2026["update_time"]]
    assert store.opened == [2026]


def test_old_links_find_their_season_from_the_stamp(client, store):
    """分年之前存下來的網址沒有 ?year=，版本編號本身就帶著年份。"""
    response = client.get(f"/api/raw/alice/{DOC_2026['update_time']}")

    assert response.json()["raw_data"] == "去年的"
    assert store.opened == [2026]


def test_latest_means_latest_of_current_season(client, store):
    response = client.get("/api/raw/alice/LATEST")

    assert response.json()["raw_data"] == "今年的"
    assert store.opened == [CURRENT]


def test_firmware_chunk_endpoint_follows_year(client, store):
    response = client.get("/api/items/alice/LATEST/player=0/chunk=0?year=2026")

    assert response.json()["player_data"] == [1]
    assert store.opened == [2026]


@pytest.mark.parametrize("year, status", [(1999, 400), ("abc", 422)])
def test_bad_year_is_an_error_not_a_new_database(client, store, year, status):
    response = client.get(f"/api/timelist/alice?year={year}")

    assert response.status_code == status
    assert store.opened == []


def test_upload_goes_to_requested_season(client, store):
    """打開去年的光表修改後存檔，那一版要留在去年。"""
    response = client.post("/api/upload_full?year=2026", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert response.json()["year"] == 2026
    color, raw = store.collections[2026]
    assert len(color.documents) == 2 and len(raw.documents) == 2
    assert len(store.collections[CURRENT][0].documents) == 1, "今年的不該被動到"


def test_upload_without_year_goes_to_current_season(client, store):
    response = client.post("/api/upload_full", json=VALID_PAYLOAD)

    assert response.json()["year"] == CURRENT
    assert len(store.collections[CURRENT][0].documents) == 2


def test_seasons_endpoint_always_includes_current(client, store, monkeypatch):
    fake_client = type(
        "Client", (), {"list_database_names": lambda self: ["admin", "test", "lightdance_2025"]}
    )()
    monkeypatch.setattr(main, "client", fake_client)

    response = client.get("/api/seasons")

    assert response.json() == {"current": CURRENT, "seasons": [CURRENT, 2025]}


# ============================================================================
# 音樂
# ============================================================================


@pytest.fixture
def music_root(tmp_path, monkeypatch, store):
    monkeypatch.setattr(main, "MUSIC_FILE_PATH", str(tmp_path))
    legacy = tmp_path / "alice"
    legacy.mkdir()
    (legacy / "old.mp3").write_bytes(b"legacy")
    return tmp_path


def test_music_upload_goes_to_season_folder(client, music_root):
    response = client.post(
        "/api/upload_music?year=2026",
        files={"file": ("new.mp3", b"ID3", "audio/mpeg")},
    )

    assert response.status_code == 200
    assert (music_root / "_years" / "2026" / "alice" / "new.mp3").read_bytes() == b"ID3"
    # 回應不帶伺服器上的路徑
    assert str(music_root) not in response.text


def test_music_list_includes_shared_legacy_files(client, music_root):
    """分年之前上傳的歌每一年都看得到——舊光表引用的是檔名。"""
    season_dir = music_root / "_years" / str(CURRENT) / "alice"
    season_dir.mkdir(parents=True)
    (season_dir / "new.mp3").write_bytes(b"new")

    assert client.get("/api/get_music_list/alice").json()["music_list"] == ["new.mp3", "old.mp3"]
    assert client.get("/api/get_music_list/alice?year=2026").json()["music_list"] == ["old.mp3"]


def test_music_download_prefers_season_then_legacy(client, music_root):
    season_dir = music_root / "_years" / str(CURRENT) / "alice"
    season_dir.mkdir(parents=True)
    (season_dir / "old.mp3").write_bytes(b"season")

    assert client.get("/api/get_music/alice/old.mp3").content == b"season"
    assert client.get("/api/get_music/alice/old.mp3?year=2026").content == b"legacy"
    assert client.get("/api/get_music/alice/missing.mp3").status_code == 404


def test_all_music_lists_hide_the_seasons_folder(client, music_root):
    lists = client.get("/api/get_music_list").json()["music_lists"]

    assert lists == {"alice": ["old.mp3"]}


def test_music_paths_still_reject_traversal(client, music_root):
    assert client.get("/api/get_music/%2e%2e/secret.txt").status_code == 400


# ============================================================================
# 舊資料搬遷
# ============================================================================


class UniqueCollection(FindOneCollection):
    """(user, update_time) 唯一，模擬目標資料庫的唯一索引。"""

    def insert_one(self, document):
        key = (document.get("user"), document.get("update_time"))
        if any((d.get("user"), d.get("update_time")) == key for d in self.documents):
            raise DuplicateKeyError("E11000")
        return super().insert_one(document)

    def count_documents(self, query):
        return len(list(self.find(query)))


class FakeClient:
    def __init__(self):
        self.dbs = {}

    def __getitem__(self, name):
        if name not in self.dbs:
            self.dbs[name] = FakeDB(UniqueCollection)
        return self.dbs[name]


@pytest.fixture
def legacy_client():
    client = FakeClient()
    docs = [
        {"_id": 1, "user": "alice", "update_time": "2025-12-01-10:00:00"},
        {"_id": 2, "user": "alice", "update_time": "2026-06-30-23:59:59"},
        {"_id": 3, "user": "bob", "update_time": "2026-07-01-00:00:00.001"},
        {"_id": 4, "user": "bob", "update_time": "壞掉的", "created_at": datetime(2026, 8, 1)},
        {"_id": 5, "user": "carol", "update_time": "壞掉的"},
    ]
    for name in ("color", "raw_json"):
        client["test"][name].documents.extend(dict(d) for d in docs)
    return client


def test_migration_preview_writes_nothing(legacy_client):
    results, _ = migrate_to_seasons.migrate(legacy_client, apply=False, log=lambda *_: None)

    assert results[("color", 2026)]["copied"] == 3
    for name, db in legacy_client.dbs.items():
        if name != "test":
            assert all(not collection.documents for collection in db.collections.values())


def test_migration_splits_by_season_and_keeps_source(legacy_client):
    results, unknown = migrate_to_seasons.migrate(legacy_client, apply=True, log=lambda *_: None)

    by_season = lambda season: sorted(d["_id"] for d in legacy_client[f"lightdance_{season}"]["color"].documents)
    assert by_season(2025) == [1]
    assert by_season(2026) == [2, 3, 4]  # 4 號的版本編號壞了，退而用 created_at
    assert [entry[1] for entry in unknown] == [5, 5]  # color 與 raw_json 各一次，沒有複製
    # 只複製不刪除
    assert len(legacy_client["test"]["color"].documents) == 5
    assert legacy_client["lightdance_2026"]["raw_json"].documents, "raw_json 也要搬"


def test_migration_can_run_twice(legacy_client):
    migrate_to_seasons.migrate(legacy_client, apply=True, log=lambda *_: None)
    results, _ = migrate_to_seasons.migrate(legacy_client, apply=True, log=lambda *_: None)

    assert results[("color", 2026)] == {"existing": 3}
    assert len(legacy_client["lightdance_2026"]["color"].documents) == 3


def test_migration_reports_source_duplicates_instead_of_guessing(legacy_client):
    """唯一索引之前留下的重複版本：只複製第一份，另一份要講出來，不能算成「已存在」。"""
    legacy_client["test"]["color"].documents.append(
        {"_id": 9, "user": "alice", "update_time": "2025-12-01-10:00:00"}
    )
    logged = []

    results, _ = migrate_to_seasons.migrate(legacy_client, apply=True, log=logged.append)

    assert results[("color", 2025)] == {"copied": 1, "duplicate": 1}
    assert any("_id=9" in line for line in logged)
    target = legacy_client["lightdance_2025"]["color"]
    assert sorted(d["_id"] for d in target.documents) == [1]

    # 重跑時兩份都已經處理過：第一份是已存在，第二份仍然回報為重複
    results, _ = migrate_to_seasons.migrate(legacy_client, apply=True, log=lambda *_: None)
    assert results[("color", 2025)] == {"existing": 1, "duplicate": 1}


def test_migration_reports_concurrent_writes(legacy_client):
    # 讓「查有沒有」那一步看不到：模擬查完之後、寫入之前，後端剛好存了同一個版本
    target = legacy_client["lightdance_2025"]["color"]
    target.documents.append({"_id": 99, "user": "alice", "update_time": "2025-12-01-10:00:00"})
    target.find_one = lambda *args, **kwargs: None

    results, _ = migrate_to_seasons.migrate(legacy_client, apply=True, log=lambda *_: None)

    assert results[("color", 2025)]["duplicate"] == 1
