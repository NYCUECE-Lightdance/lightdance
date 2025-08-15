#!/bin/bash

# 這個腳本會停止由 docker-compose.prod.yml 定義的部署環境。
# 它會停止容器並移除資料卷，但會保留 Docker 映像檔以加快下次啟動速度。

echo "Stopping deployment containers and removing associated volumes..."
# -v 旗標會移除服務建立的命名資料卷。
# Docker 映像檔將被保留，以便在下次部署時可以更快地重建。
docker-compose -f docker-compose.prod.yml down -v

echo "Deployment environment has been disabled."
