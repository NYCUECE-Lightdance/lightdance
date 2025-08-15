#!/bin/bash

# 這個腳本會停止 docker-compose.dev.yml 定義的開發環境，
# 並清除產生的 Python 快取檔案。

echo "Stopping development containers and removing associated volumes..."
# -v 旗標會移除與容器關聯的匿名資料卷。
docker-compose -f docker-compose.dev.yml down -v

echo "Cleaning up Python cache files..."
find . -type d -name "__pycache__" -exec rm -r {} +

echo "Development environment stopped and cleaned."
