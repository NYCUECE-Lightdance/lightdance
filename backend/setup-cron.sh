#!/bin/bash

# =================================================================
#     MongoDB 備份定時任務設定腳本
# =================================================================
# 此腳本會將 MongoDB 備份任務加入到 crontab 中
# 設定為每兩天凌晨 6:00 執行一次備份
# =================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/mongo-backup.sh"

echo "設定 MongoDB 自動備份定時任務..."
echo "備份腳本位置: $BACKUP_SCRIPT"

# 檢查備份腳本是否存在
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "錯誤: 找不到備份腳本 $BACKUP_SCRIPT"
    exit 1
fi

# 建立 cron job 內容
# 每兩天凌晨 6:00 執行 (0 6 */2 * *)
CRON_JOB="0 6 */2 * * $BACKUP_SCRIPT >> $SCRIPT_DIR/../db/dump_data/cron.log 2>&1"

echo "準備加入的 cron 任務:"
echo "$CRON_JOB"
echo ""

# 檢查是否已存在相同的 cron 任務
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo "警告: 已存在相關的備份任務"
    echo "目前的 crontab 內容:"
    crontab -l 2>/dev/null | grep "$BACKUP_SCRIPT" || echo "(無相關任務)"
    echo ""
    echo -n "是否要移除現有任務並重新設定？ (y/N): "
    read -r replace
    
    if [[ "$replace" =~ ^[Yy]$ ]]; then
        # 移除現有的備份任務
        crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
        echo "已移除現有的備份任務"
    else
        echo "保持現有設定，結束操作"
        exit 0
    fi
fi

# 加入新的 cron 任務
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

if [ $? -eq 0 ]; then
    echo "✅ 成功設定自動備份任務!"
    echo ""
    echo "備份排程: 每兩天凌晨 6:00"
    echo "下次備份時間將會是:"
    
    # 顯示下次執行時間（簡單計算）
    current_day=$(date +%d)
    current_hour=$(date +%H)
    
    if [ $current_hour -lt 6 ]; then
        # 今天還沒到 6 點，檢查今天是否是備份日
        if [ $((current_day % 2)) -eq 0 ]; then
            echo "  今天 06:00 (如果今天符合每兩天的排程)"
        else
            echo "  明天 06:00 (如果明天符合每兩天的排程)"
        fi
    else
        echo "  接下來符合排程的日期 06:00"
    fi
    
    echo ""
    echo "查看目前的 crontab:"
    crontab -l | grep "$BACKUP_SCRIPT"
    echo ""
    echo "日誌檔案位置: $SCRIPT_DIR/../db/dump_data/cron.log"
    echo ""
    echo "手動執行備份: $BACKUP_SCRIPT"
    echo "測試備份功能: $BACKUP_SCRIPT --test"
    echo "查看備份列表: $BACKUP_SCRIPT --list"
    echo "還原備份: $BACKUP_SCRIPT --restore"
else
    echo "❌ 設定定時任務失敗"
    exit 1
fi