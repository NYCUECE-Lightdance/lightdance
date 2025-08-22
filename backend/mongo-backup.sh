#!/bin/bash

# =================================================================
#     MongoDB 自動備份腳本 (Lightdance Project)
# =================================================================
# 功能：
#   - 每兩天凌晨 6 點自動執行備份
#   - 使用 mongodump 建立完整資料庫備份
#   - 保留最近一個月的備份檔案（約 15 個備份）
#   - 詳細的日誌記錄
#   - 自動清理過期備份檔案
# 
# 使用方法：
#   ./mongo-backup.sh                 # 立即執行備份
#   ./mongo-backup.sh --test          # 測試模式（不實際備份）
#   ./mongo-backup.sh --restore       # 互動式還原
# =================================================================

# 配置變數
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../db/dump_data"
LOG_FILE="${BACKUP_DIR}/backup.log"
CONTAINER_NAME_PATTERN="*mongo*"
DATABASE_NAME="test"
MONGO_USERNAME="${MONGO_USERNAME:-root}"
MONGO_PASSWORD="${MONGO_PASSWORD:-nycuee}"
RETENTION_DAYS=30

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日誌函數
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 輸出到終端（帶顏色）
    case $level in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} ${timestamp} - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} ${timestamp} - $message"
            ;;
    esac
    
    # 寫入日誌檔案（無顏色）
    echo "[$level] $timestamp - $message" >> "$LOG_FILE"
}

# 檢查 Docker 容器狀態
check_mongo_container() {
    # 優先搜尋真正的 MongoDB 容器（排除 mongo-express）
    local container_id=$(docker ps --format "table {{.ID}}\t{{.Names}}" | grep -E "(^|\s)mongo-dev(\s|$)" | head -1 | awk '{print $1}')
    
    # 如果沒找到 mongo-dev，則搜尋其他包含 mongo 但非 mongo-express 的容器
    if [ -z "$container_id" ]; then
        container_id=$(docker ps --format "table {{.ID}}\t{{.Names}}" | grep -i mongo | grep -v "mongo-express" | head -1 | awk '{print $1}')
    fi
    
    if [ -z "$container_id" ]; then
        log "ERROR" "找不到運行中的 MongoDB 容器"
        log "INFO" "請確保 MongoDB 容器正在運行: docker compose up -d"
        log "INFO" "可用的容器："
        docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -i mongo
        return 1
    fi
    
    MONGO_CONTAINER_ID=$container_id
    local container_name=$(docker ps --format "table {{.ID}}\t{{.Names}}" | grep "$container_id" | awk '{print $2}')
    
    # 驗證容器是否有 mongodump 命令
    if ! docker exec "$MONGO_CONTAINER_ID" which mongodump > /dev/null 2>&1; then
        log "ERROR" "容器 $container_name 中沒有 mongodump 命令"
        log "INFO" "請確認選擇的是正確的 MongoDB 容器，而非 mongo-express"
        return 1
    fi
    
    log "INFO" "找到 MongoDB 容器: $container_name ($container_id)"
    log "INFO" "驗證 mongodump 命令存在: ✓"
    return 0
}

# 建立備份
create_backup() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_name="mongodb_backup_${timestamp}"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    log "INFO" "開始建立 MongoDB 備份: $backup_name"
    
    # 建立備份目錄
    mkdir -p "$backup_path"
    
    # 執行 mongodump
    local start_time=$(date +%s)
    
    if docker exec "$MONGO_CONTAINER_ID" mongodump \
        --host localhost:27017 \
        --db "$DATABASE_NAME" \
        --username "$MONGO_USERNAME" \
        --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --out /data/db/dump_data/"$backup_name" > /dev/null 2>&1; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        # 計算備份檔案大小
        local backup_size=$(du -sh "$backup_path" 2>/dev/null | cut -f1 || echo "未知")
        
        log "SUCCESS" "備份完成: $backup_name"
        log "INFO" "備份大小: $backup_size, 耗時: ${duration}秒"
        log "INFO" "備份位置: $backup_path"
        
        return 0
    else
        log "ERROR" "備份失敗: $backup_name"
        # 清理失敗的備份目錄
        rm -rf "$backup_path"
        return 1
    fi
}

# 清理過期備份
cleanup_old_backups() {
    log "INFO" "開始清理超過 $RETENTION_DAYS 天的舊備份"
    
    local deleted_count=0
    
    # 找出超過保留期限的備份目錄
    find "$BACKUP_DIR" -maxdepth 1 -type d -name "mongodb_backup_*" -mtime +$RETENTION_DAYS | while read -r backup_dir; do
        if [ -d "$backup_dir" ]; then
            local backup_name=$(basename "$backup_dir")
            log "INFO" "刪除過期備份: $backup_name"
            rm -rf "$backup_dir"
            deleted_count=$((deleted_count + 1))
        fi
    done
    
    # 顯示目前備份狀況
    local current_backups=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "mongodb_backup_*" | wc -l | tr -d ' ')
    log "INFO" "目前保留 $current_backups 個備份檔案"
}

# 列出可用備份
list_backups() {
    echo -e "\n${BLUE}=== 可用備份列表 ===${NC}"
    local count=0
    
    for backup_dir in $(find "$BACKUP_DIR" -maxdepth 1 -type d -name "mongodb_backup_*" | sort -r); do
        if [ -d "$backup_dir" ]; then
            count=$((count + 1))
            local backup_name=$(basename "$backup_dir")
            local backup_date=$(echo "$backup_name" | sed 's/mongodb_backup_\([0-9]\{8\}\)_\([0-9]\{6\}\)/\1 \2/' | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\) \([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
            local backup_size=$(du -sh "$backup_dir" 2>/dev/null | cut -f1 || echo "未知")
            
            echo -e "${count}. ${GREEN}$backup_name${NC}"
            echo -e "   日期: $backup_date"
            echo -e "   大小: $backup_size"
            echo ""
        fi
    done
    
    if [ $count -eq 0 ]; then
        echo -e "${YELLOW}沒有找到任何備份檔案${NC}"
    fi
    
    return $count
}

# 互動式還原
interactive_restore() {
    echo -e "\n${BLUE}=== MongoDB 資料還原 ===${NC}"
    
    list_backups
    local backup_count=$?
    
    if [ $backup_count -eq 0 ]; then
        return 1
    fi
    
    echo -n -e "${YELLOW}請選擇要還原的備份編號 (1-$backup_count), 或按 Enter 取消: ${NC}"
    read -r selection
    
    if [ -z "$selection" ]; then
        echo "取消還原操作"
        return 0
    fi
    
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt $backup_count ]; then
        echo -e "${RED}無效的選擇${NC}"
        return 1
    fi
    
    # 找出對應的備份
    local backup_dir=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "mongodb_backup_*" | sort -r | sed -n "${selection}p")
    local backup_name=$(basename "$backup_dir")
    
    echo -e "\n${YELLOW}警告: 這將會覆蓋目前的資料庫內容！${NC}"
    echo -n -e "確認要還原備份 ${GREEN}$backup_name${NC} 嗎？ (y/N): "
    read -r confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        restore_backup "$backup_name"
    else
        echo "取消還原操作"
    fi
}

# 還原備份
restore_backup() {
    local backup_name=$1
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    if [ ! -d "$backup_path" ]; then
        log "ERROR" "備份不存在: $backup_name"
        return 1
    fi
    
    log "INFO" "開始還原備份: $backup_name"
    
    # 執行 mongorestore
    if docker exec "$MONGO_CONTAINER_ID" mongorestore \
        --host localhost:27017 \
        --db "$DATABASE_NAME" \
        --username "$MONGO_USERNAME" \
        --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --drop \
        /data/db/dump_data/"$backup_name"/"$DATABASE_NAME" > /dev/null 2>&1; then
        
        log "SUCCESS" "備份還原完成: $backup_name"
        return 0
    else
        log "ERROR" "備份還原失敗: $backup_name"
        return 1
    fi
}

# 測試模式
test_mode() {
    log "INFO" "=== 測試模式 ==="
    log "INFO" "備份目錄: $BACKUP_DIR"
    log "INFO" "日誌檔案: $LOG_FILE"
    log "INFO" "資料庫名稱: $DATABASE_NAME"
    log "INFO" "保留天數: $RETENTION_DAYS 天"
    
    if check_mongo_container; then
        log "SUCCESS" "MongoDB 容器連接測試成功"
    else
        log "ERROR" "MongoDB 容器連接測試失敗"
        return 1
    fi
    
    list_backups
    log "INFO" "測試完成"
}

# 主程式
main() {
    # 建立必要目錄
    mkdir -p "$BACKUP_DIR"
    
    # 初始化日誌
    if [ ! -f "$LOG_FILE" ]; then
        echo "=== MongoDB 備份日誌 ===" > "$LOG_FILE"
    fi
    
    log "INFO" "=== MongoDB 備份腳本啟動 ==="
    
    # 解析命令列參數
    case "${1:-}" in
        "--test")
            test_mode
            ;;
        "--restore")
            if check_mongo_container; then
                interactive_restore
            fi
            ;;
        "--list")
            list_backups
            ;;
        *)
            # 正常備份流程
            if check_mongo_container; then
                if create_backup; then
                    cleanup_old_backups
                    log "SUCCESS" "備份流程完成"
                else
                    log "ERROR" "備份流程失敗"
                    exit 1
                fi
            else
                exit 1
            fi
            ;;
    esac
    
    log "INFO" "=== 腳本執行結束 ==="
}

# 執行主程式
main "$@"