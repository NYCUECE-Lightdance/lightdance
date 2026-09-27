"""
`/api/upload_full` 的行為。

這支端點原本有兩個「回報成功但其實沒存好」的路徑：

1. Pydantic 驗證失敗時，`except` 裡改用**未驗證的原始格式**再插入一次。驗證
   存在的唯一理由就是擋掉那種資料，那段等於把它繞過去。
2. 兩份文件分別 try/except、各自印一行錯誤，然後**不管結果一律回 success**。
   寫壞一份會留下「跑得動但打不開」或「打得開但跑不動」的版本。

兩個都不會讓使用者看到任何異常——上傳按鈕變綠、訊息說成功，下次載入才發現。
"""

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import OperationFailure

import main
from tests.test_storage import FakeCollection


def player_row(time=0):
    """一列合法的韌體資料（22 個部位 + time）。欄位順序就是韌體的 ABI。"""
    parts = [
        "hat", "face", "chestL", "chestR", "armL", "armR", "tie", "belt",
        "gloveL", "gloveR", "legL", "legR", "shoeL", "shoeR",
        "acc0", "acc1", "acc2", "acc3", "acc4", "acc5", "acc6", "acc7",
    ]
    return {"time": time, **{part: 0 for part in parts}}


VALID_PAYLOAD = {
    "raw_data": '{"schemaVersion":2,"actionTable":[]}',
    "players": [[player_row(0), player_row(50)]],
    "music_filename": "opening.mp3",
}


@pytest.fixture
def collections(monkeypatch):
    color = FakeCollection("color")
    raw = FakeCollection("raw_json")
    monkeypatch.setattr(main, "collection_color", color)
    monkeypatch.setattr(main, "collection_raw", raw)
    # 驗證與授權不是這個檔案要測的東西
    monkeypatch.setattr(
        main.app,
        "dependency_overrides",
        {main.get_current_active_user: lambda: main.User(username="alice")},
    )
    return color, raw


@pytest.fixture
def client():
    return TestClient(main.app)


def test_valid_upload_writes_both_collections(client, collections):
    color, raw = collections

    response = client.post("/api/upload_full", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert len(color.documents) == 1
    assert len(raw.documents) == 1
    # 兩份共用同一個版本編號，否則「載入這一版」對不起來
    assert color.documents[0]["update_time"] == raw.documents[0]["update_time"]
    assert response.json()["update_time"] == color.documents[0]["update_time"]


def test_music_filename_is_stored_on_both(client, collections):
    color, raw = collections

    client.post("/api/upload_full", json=VALID_PAYLOAD)

    assert color.documents[0]["music_filename"] == "opening.mp3"
    # raw 也要有，否則清單頁得把整串 JSON parse 開才知道是哪首歌
    assert raw.documents[0]["music_filename"] == "opening.mp3"


def test_invalid_players_are_rejected_and_nothing_is_stored(client, collections):
    """
    ⚠️ 驗不過就不要存。

    舊版在這裡會走「保底方案」——把驗不過的資料原樣塞進 color collection，
    然後回 200。韌體之後讀到缺欄位的那一列會是什麼行為，沒有人知道。
    """
    color, raw = collections
    broken = {**VALID_PAYLOAD, "players": [[{"time": 0, "hat": 1}]]}  # 少 21 個部位

    response = client.post("/api/upload_full", json=broken)

    assert response.status_code == 422
    assert color.documents == []
    assert raw.documents == []


def test_storage_failure_is_reported_not_swallowed(client, collections):
    """寫入失敗要回錯誤，而不是回一句「upload success」。"""
    color, raw = collections
    color.fail_insert = OperationFailure("disk full")

    response = client.post("/api/upload_full", json=VALID_PAYLOAD)

    assert response.status_code == 503
    assert "success" not in response.text.lower()
    # 而且不能只留下 raw 那一份
    assert raw.documents == []


def test_two_uploads_in_the_same_second_get_different_versions(client, collections):
    """
    連按兩下 Output 要產生兩個不同的版本編號。

    先前時間戳只到秒，兩次上傳會產生 `(user, update_time)` 完全相同的兩份文件
    ——之後 `find_one` 回哪一份是沒有定義的，「載入某個版本」變成擲骰子。

    ⚠️ 毫秒只是把碰撞機率壓低，**不保證唯一**。真正的保證是
    `(user, update_time)` 的唯一索引，碰到時 `insert_show` 會回一個看得懂的
    錯誤（見 test_storage 的 test_insert_show_reports_duplicate_version_clearly）。
    """
    color, _ = collections

    client.post("/api/upload_full", json=VALID_PAYLOAD)
    client.post("/api/upload_full", json=VALID_PAYLOAD)

    stamps = [doc["update_time"] for doc in color.documents]
    # 兩次都在同一秒內完成，秒級時間戳會讓這一行失敗
    assert len(set(stamps)) == 2
    assert stamps[0][:19] == stamps[1][:19], "測試前提：兩次上傳落在同一秒"
