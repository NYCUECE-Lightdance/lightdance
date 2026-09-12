"""
`/api/raw/{username}/{query_time}` 的回歸測試。

這支端點有兩條分支（指定 timestamp / LATEST），原本 **LATEST 那條查錯 collection**：
查了 `color`（播放用的 32-bit 打包資料）而不是 `raw_json`（編輯器原始 JSON）。
前端 `Dashboard.jsx` 與 `LoadData.jsx` 都打這支，載入最新版本時會拿到錯的東西。

測試用假的 collection 取代 pymongo，不需要真的 MongoDB —— 重點是驗證
「這支端點去問了哪一個 collection」，而不是 mongo 本身的行為。
"""

import pytest
from fastapi.testclient import TestClient

import main


class FakeCollection:
    """只實作 find_one 的假 collection，並記錄自己被查過幾次。"""

    def __init__(self, name, documents):
        self.name = name
        self.documents = documents
        self.queries = []

    def find_one(self, query, sort=None):
        self.queries.append(query)

        matched = [
            doc
            for doc in self.documents
            if all(doc.get(key) == value for key, value in query.items())
        ]
        if not matched:
            return None

        if sort:
            field, direction = sort[0]
            matched.sort(key=lambda doc: doc[field], reverse=direction < 0)
        return matched[0]


RAW_DOCS = [
    {"user": "alice", "update_time": "2026-01-01_00-00-00", "raw_data": "raw-舊"},
    {"user": "alice", "update_time": "2026-08-01_00-00-00", "raw_data": "raw-新"},
]

COLOR_DOCS = [
    {"user": "alice", "update_time": "2026-08-01_00-00-00", "players": [[1, 2, 3]]},
]


@pytest.fixture
def collections(monkeypatch):
    raw = FakeCollection("raw_json", RAW_DOCS)
    color = FakeCollection("color", COLOR_DOCS)
    monkeypatch.setattr(main, "collection_raw", raw)
    monkeypatch.setattr(main, "collection_color", color)
    return raw, color


@pytest.fixture
def client():
    return TestClient(main.app)


def test_latest_reads_raw_collection(client, collections):
    """LATEST 必須查 raw_json，而且拿到的是最新那一筆。"""
    raw, color = collections

    response = client.get("/api/raw/alice/LATEST")

    assert response.status_code == 200
    assert response.json()["raw_data"] == "raw-新"
    assert len(raw.queries) == 1, "應該查 raw_json"
    assert color.queries == [], "不該碰 color collection"


def test_explicit_timestamp_reads_raw_collection(client, collections):
    """指定 timestamp 的那條分支本來就是對的，一併鎖住避免改壞。"""
    raw, color = collections

    response = client.get("/api/raw/alice/2026-01-01_00-00-00")

    assert response.status_code == 200
    assert response.json()["raw_data"] == "raw-舊"
    assert color.queries == []


def test_unknown_user_returns_message(client, collections):
    response = client.get("/api/raw/nobody/LATEST")

    assert response.status_code == 200
    assert "not found" in response.json()["message"]


def test_items_endpoint_still_reads_color(client, collections):
    """對照組：/api/items 是播放資料，兩條分支都該查 color。"""
    raw, color = collections

    response = client.get("/api/items/alice/LATEST")

    assert response.status_code == 200
    assert response.json()["players"] == [[1, 2, 3]]
    assert len(color.queries) == 1
    assert raw.queries == [], "播放資料不該查 raw_json"
