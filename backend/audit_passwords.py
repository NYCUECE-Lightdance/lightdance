#!/usr/bin/env python3
"""
檢查還有多少帳號的密碼是明文。**唯讀，不會動到任何資料。**

## 為什麼需要這支

密碼的遷移是**懶惰的**（見 `auth.py`）：`verify_password` 明文與 bcrypt 兩種都
認得，登入成功的當下才把明文就地換成雜湊。好處是不必停機、不必寫遷移腳本、
也不會有人被鎖在外面——但代價是**你不知道什麼時候遷移完**。一個從修好之後就
沒登入過的帳號，密碼欄位到今天仍然是明文。

從雜湊反推不出明文，所以「寫一支腳本把全部轉成雜湊」是做不到的：那只能把所有人
的密碼重設掉。真正能做的就是這支——告訴你還剩誰，然後請那幾個人登入一次。

## 用法

```bash
cd backend
uv run python audit_passwords.py              # 只看統計
uv run python audit_passwords.py --list       # 列出還沒遷移的帳號名稱
```

⚠️ **不會印出密碼**，只印帳號名稱。這支腳本的輸出可能被貼進聊天室或截圖，
把密碼印出來等於自己製造一次外洩。
"""

import argparse
import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

from auth import is_hashed


def classify(users):
    """把使用者分成「已雜湊」「還是明文」「沒有密碼欄位」三堆。"""
    hashed, plaintext, missing = [], [], []

    for user in users:
        name = user.get("username", "(沒有 username)")
        password = user.get("password")

        if not isinstance(password, str) or not password:
            missing.append(name)
        elif is_hashed(password):
            hashed.append(name)
        else:
            plaintext.append(name)

    return hashed, plaintext, missing


def main():
    parser = argparse.ArgumentParser(description="檢查密碼雜湊的遷移進度（唯讀）")
    parser.add_argument(
        "--list", action="store_true", help="列出還沒遷移的帳號名稱（不含密碼）"
    )
    args = parser.parse_args()

    load_dotenv()
    uri = os.getenv("MONGO_CONNECT_URI")
    if not uri:
        print("MONGO_CONNECT_URI 沒有設定", file=sys.stderr)
        return 2

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    # 只取這兩欄。整份使用者文件不需要，而且少搬一點就少一點外洩面
    users = list(client["test"]["users"].find({}, {"username": 1, "password": 1}))

    hashed, plaintext, missing = classify(users)
    total = len(users)

    print(f"帳號總數      {total}")
    print(f"已雜湊        {len(hashed)}")
    print(f"還是明文      {len(plaintext)}")
    if missing:
        print(f"沒有密碼欄位  {len(missing)}")

    if not plaintext:
        print("\n=== 全部遷移完成 ===")
        return 0

    print(
        f"\n=== 還有 {len(plaintext)} 個帳號是明文 ===\n"
        "請這幾位各登入一次，登入成功的當下就會就地換成 bcrypt（見 auth.py）。"
    )
    if args.list:
        for name in sorted(plaintext):
            print(f"  {name}")
    else:
        print("加 --list 可以列出是哪幾個帳號。")

    # 刻意回 1：放進 CI 或定期檢查時，「還沒遷移完」應該是個看得見的狀態
    return 1


if __name__ == "__main__":
    sys.exit(main())
