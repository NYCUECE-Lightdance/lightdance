#!/bin/bash

# =================================================================
#     MongoDB 快速還原腳本 (Lightdance Project)
# =================================================================
# 這是一個簡化的還原腳本，提供快速還原功能
# 
# 使用方法：
#   ./mongo-restore.sh                    # 互動式選擇備份還原
#   ./mongo-restore.sh backup_name        # 直接還原指定備份
#   ./mongo-restore.sh --latest           # 還原最新備份
# =================================================================

# 呼叫主備份腳本的還原功能
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_BACKUP_SCRIPT="${SCRIPT_DIR}/mongo-backup.sh"

if [ ! -f "$MAIN_BACKUP_SCRIPT" ]; then
    echo "錯誤: 找不到主備份腳本 $MAIN_BACKUP_SCRIPT"
    exit 1
fi

case "${1:-}" in
    "--latest")
        # 找到最新的備份並還原
        BACKUP_DIR="${SCRIPT_DIR}/../db/dump_data"
        LATEST_BACKUP=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "mongodb_backup_*" | sort -r | head -1)
        
        if [ -z "$LATEST_BACKUP" ]; then
            echo "錯誤: 找不到任何備份檔案"
            exit 1
        fi
        
        BACKUP_NAME=$(basename "$LATEST_BACKUP")
        echo "準備還原最新備份: $BACKUP_NAME"
        echo -n "確認要繼續嗎？ (y/N): "
        read -r confirm
        
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            "$MAIN_BACKUP_SCRIPT" --restore
        else
            echo "取消還原操作"
        fi
        ;;
    "")
        # 互動式還原
        "$MAIN_BACKUP_SCRIPT" --restore
        ;;
    *)
        # 直接還原指定備份
        echo "直接還原功能需要透過主腳本實現"
        echo "請使用: $MAIN_BACKUP_SCRIPT --restore"
        ;;
esac