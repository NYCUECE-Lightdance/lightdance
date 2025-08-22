# Shell 腳本邏輯與語法解析

本文檔詳細解釋 MongoDB 備份系統中三個 shell 腳本的邏輯結構、語法運用和程式設計技巧。

## 📋 目錄

1. [mongo-backup.sh - 主要備份腳本](#1-mongo-backupsh---主要備份腳本)
2. [setup-cron.sh - 定時任務設定腳本](#2-setup-cronsh---定時任務設定腳本)
3. [mongo-restore.sh - 快速還原腳本](#3-mongo-restoresh---快速還原腳本)
4. [重要 Shell 語法概念](#4-重要-shell-語法概念)

---

## 1. `mongo-backup.sh` - 主要備份腳本

### 1.1 基礎結構和變數設定

```bash
#!/bin/bash

# 配置變數
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../db/dump_data"
LOG_FILE="${BACKUP_DIR}/backup.log"
MONGO_USERNAME="${MONGO_USERNAME:-root}"
MONGO_PASSWORD="${MONGO_PASSWORD:-nycuee}"
```

**重要概念解析：**

- **Shebang (`#!/bin/bash`)**：告訴系統使用 bash 來執行腳本
- **路徑解析技巧**：`SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` 
  - `${BASH_SOURCE[0]}`：取得腳本的完整路徑
  - `dirname`：取得目錄部分
  - `cd ... && pwd`：切換到該目錄並印出絕對路徑
  - 這確保無論從哪裡執行腳本，都能正確找到相關檔案
- **參數擴展**：`${MONGO_USERNAME:-root}` 表示「如果環境變數存在則使用，否則使用預設值」

### 1.2 顏色輸出系統

```bash
# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
```

**ANSI 轉義序列：**
- `\033[0;31m`：設定文字為紅色
- `\033[0m`：重設為預設顏色
- 提升終端使用者體驗的重要技巧

### 1.3 日誌函數設計

```bash
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
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message"
            ;;
    esac
    
    # 寫入日誌檔案（無顏色）
    echo "[$level] $timestamp - $message" >> "$LOG_FILE"
}
```

**函數參數處理技巧：**

1. `local level=$1`：取得第一個參數並設為區域變數
2. `shift`：移除第一個參數，讓 `$@` 包含剩餘參數
3. `local message="$@"`：將所有剩餘參數作為訊息內容
4. `echo -e`：`-e` 選項讓 echo 能解析轉義字元（顏色碼）

### 1.4 Docker 容器檢測

```bash
check_mongo_container() {
    local container_id=$(docker ps --format "table {{.ID}}\t{{.Names}}" | grep -i mongo | head -1 | awk '{print $1}')
    
    if [ -z "$container_id" ]; then
        log "ERROR" "找不到運行中的 MongoDB 容器"
        return 1
    fi
    
    MONGO_CONTAINER_ID=$container_id
    return 0
}
```

**管道命令鏈解析：**

1. `docker ps --format "table {{.ID}}\t{{.Names}}"`：列出容器 ID 和名稱
2. `grep -i mongo`：不分大小寫搜尋包含 "mongo" 的行
3. `head -1`：只取第一行
4. `awk '{print $1}'`：取得第一欄（容器 ID）

**條件檢查：**
- `[ -z "$container_id" ]`：檢查字串是否為空（zero length）
- `return 0/1`：函數回傳值，0 表示成功，非 0 表示失敗

### 1.5 備份建立邏輯

```bash
create_backup() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_name="mongodb_backup_${timestamp}"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    mkdir -p "$backup_path"
    
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
        
        local backup_size=$(du -sh "$backup_path" 2>/dev/null | cut -f1 || echo "未知")
        
        log "SUCCESS" "備份完成: $backup_name"
        return 0
    else
        log "ERROR" "備份失敗: $backup_name"
        rm -rf "$backup_path"
        return 1
    fi
}
```

**重要語法概念：**

1. **時間戳記**：`date '+%Y%m%d_%H%M%S'` 產生唯一的檔案名稱
2. **多行命令**：使用反斜線 `\` 將長命令分行，提升可讀性
3. **重定向**：`> /dev/null 2>&1` 將輸出和錯誤都丟棄，只關心命令是否成功
4. **算術擴展**：`$((end_time - start_time))` 計算時間差
5. **命令替換與錯誤處理**：`$(du -sh "$backup_path" 2>/dev/null | cut -f1 || echo "未知")`

### 1.6 主程式流程控制

```bash
main() {
    case "${1:-}" in
        "--test")
            test_mode
            ;;
        "--restore")
            if check_mongo_container; then
                interactive_restore
            fi
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
            fi
            ;;
    esac
}
```

**流程控制特點：**
- **case 語句**：類似 switch，處理不同的命令列參數
- **嵌套條件**：多層 if 語句確保每個步驟都成功才繼續
- **錯誤處理**：失敗時適當退出並記錄錯誤

---

## 2. `setup-cron.sh` - 定時任務設定腳本

### 2.1 核心邏輯結構

```bash
# 檢查備份腳本是否存在
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "錯誤: 找不到備份腳本 $BACKUP_SCRIPT"
    exit 1
fi

# 建立 cron job 內容
CRON_JOB="0 6 */2 * * $BACKUP_SCRIPT >> $SCRIPT_DIR/../db/dump_data/cron.log 2>&1"

# 檢查是否已存在相同任務
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo "警告: 已存在相關的備份任務"
    # 互動式確認是否替換
fi
```

**重要概念：**

1. **檔案存在檢查**：`[ ! -f "$BACKUP_SCRIPT" ]`
   - `-f`：檢查是否為一般檔案
   - `!`：邏輯否定
2. **Cron 時間格式**：`0 6 */2 * *`
   - 分鐘(0) 小時(6) 日期(*/2每兩天) 月份(*) 星期(*)
3. **錯誤重定向**：`2>/dev/null` 避免 crontab 不存在時的錯誤訊息

### 2.2 使用者互動機制

```bash
echo -n "是否要移除現有任務並重新設定？ (y/N): "
read -r replace

if [[ "$replace" =~ ^[Yy]$ ]]; then
    # 移除現有任務
    crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
fi

# 加入新任務
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
```

**互動技術：**

1. **echo -n**：不換行輸出，讓游標停在同一行
2. **read -r**：讀取使用者輸入，`-r` 避免反斜線被解譯
3. **正規表達式匹配**：`[[ "$replace" =~ ^[Yy]$ ]]` 檢查輸入是否為 Y 或 y
4. **crontab 操作**：
   - `crontab -l`：列出現有任務
   - `grep -v`：排除包含特定字串的行
   - `(command1; command2) | crontab -`：組合多個命令的輸出

---

## 3. `mongo-restore.sh` - 快速還原腳本

### 3.1 腳本委派設計模式

```bash
# 呼叫主備份腳本的還原功能
MAIN_BACKUP_SCRIPT="${SCRIPT_DIR}/mongo-backup.sh"

case "${1:-}" in
    "--latest")
        # 找到最新備份
        LATEST_BACKUP=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "mongodb_backup_*" | sort -r | head -1)
        ;;
    "")
        # 互動式還原
        "$MAIN_BACKUP_SCRIPT" --restore
        ;;
esac
```

**設計特點：**

1. **Wrapper 模式**：這個腳本是主腳本的簡化介面
2. **參數預設值**：`${1:-}` 安全地取得第一個參數
3. **find 進階用法**：
   - `-maxdepth 1`：只搜尋當前目錄層級
   - `-type d`：只找目錄
   - `sort -r`：反向排序（最新在前）
   - `head -1`：取第一個結果

### 3.2 路徑和檔案名稱處理

```bash
BACKUP_NAME=$(basename "$LATEST_BACKUP")
echo "準備還原最新備份: $BACKUP_NAME"
```

**工具命令：**
- `basename`：從完整路徑提取檔案名稱
- 例：`/path/to/backup_20250822` → `backup_20250822`

---

## 4. 重要 Shell 語法概念

### 4.1 變數和參數擴展

```bash
# 基本變數賦值
VAR="value"
PATH="/usr/bin:$PATH"

# 參數擴展
${VAR}              # 基本替換
${VAR:-default}     # 如果 VAR 未設定則使用 default
${VAR:=default}     # 如果 VAR 未設定則設定為 default
${VAR:+alt_value}   # 如果 VAR 已設定則使用 alt_value

# 位置參數
$0                  # 腳本名稱
$1, $2, $9          # 位置參數
$@                  # 所有參數（作為個別字串）
$*                  # 所有參數（作為單一字串）
$#                  # 參數數量
$$                  # 目前程序 ID
$?                  # 上一個命令的退出狀態
```

### 4.2 條件判斷

```bash
# 檔案和目錄測試
[ -f file ]         # 檔案存在且為一般檔案
[ -d directory ]    # 目錄存在
[ -r file ]         # 檔案可讀
[ -w file ]         # 檔案可寫
[ -x file ]         # 檔案可執行
[ -s file ]         # 檔案存在且非空

# 字串測試
[ -z "$var" ]       # 字串為空
[ -n "$var" ]       # 字串非空
[ "$a" = "$b" ]     # 字串相等
[ "$a" != "$b" ]    # 字串不相等

# 數值比較
[ $a -eq $b ]       # 等於
[ $a -ne $b ]       # 不等於
[ $a -lt $b ]       # 小於
[ $a -le $b ]       # 小於等於
[ $a -gt $b ]       # 大於
[ $a -ge $b ]       # 大於等於

# 進階字串匹配
[[ "$var" =~ pattern ]]     # 正規表達式匹配
[[ "$var" == pattern ]]     # 模式匹配（支援萬用字元）
```

### 4.3 函數設計

```bash
# 函數定義
function_name() {
    local var1=$1           # 區域變數
    local var2="$2"         # 引號保護空格
    local result
    
    # 函數邏輯
    if [ condition ]; then
        result="success"
        return 0            # 成功
    else
        result="failure"
        return 1            # 失敗
    fi
}

# 函數呼叫和結果處理
if function_name "arg1" "arg2"; then
    echo "函數執行成功"
else
    echo "函數執行失敗"
fi
```

### 4.4 流程控制

```bash
# if-elif-else
if [ condition1 ]; then
    command1
elif [ condition2 ]; then
    command2
else
    command3
fi

# case 語句
case $variable in
    "pattern1"|"pattern2")
        command1
        ;;
    "pattern3")
        command2
        ;;
    *)
        default_command
        ;;
esac

# for 迴圈
for file in *.txt; do
    echo "處理檔案: $file"
done

for ((i=1; i<=10; i++)); do
    echo "計數: $i"
done

# while 迴圈
while [ condition ]; do
    command
done
```

### 4.5 重定向和管道

```bash
# 輸出重定向
command > file              # 覆蓋檔案
command >> file             # 附加到檔案
command 2> error.log        # 重定向錯誤輸出
command > output.log 2>&1   # 同時重定向標準輸出和錯誤輸出
command &> all.log          # 簡化語法

# 輸入重定向
command < input.txt
command <<EOF
多行輸入內容
EOF

# 管道
command1 | command2         # 將 command1 的輸出傳給 command2
command1 | tee file.txt     # 同時顯示和儲存輸出
```

### 4.6 錯誤處理最佳實踐

```bash
# 嚴格模式
set -euo pipefail
# -e: 任何命令失敗就退出
# -u: 使用未定義變數就報錯
# -o pipefail: 管道中任何命令失敗都算失敗

# 函數錯誤處理
safe_command() {
    if ! risky_command; then
        log "ERROR" "risky_command 失敗"
        cleanup
        exit 1
    fi
}

# 捕獲信號
trap 'cleanup; exit 1' INT TERM

cleanup() {
    rm -f "$TEMP_FILE"
    log "INFO" "清理完成"
}
```

### 4.7 實用技巧

```bash
# 時間戳記
timestamp=$(date '+%Y%m%d_%H%M%S')
iso_time=$(date '+%Y-%m-%d %H:%M:%S')

# 取得腳本所在目錄
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 檢查命令是否存在
if command -v docker >/dev/null 2>&1; then
    echo "Docker 已安裝"
fi

# 讀取檔案每一行
while IFS= read -r line; do
    echo "處理: $line"
done < file.txt

# 陣列操作
arr=("item1" "item2" "item3")
echo "${arr[0]}"            # 第一個元素
echo "${arr[@]}"            # 所有元素
echo "${#arr[@]}"           # 陣列長度
```

---

## 總結

這三個 shell 腳本展示了完整的系統管理腳本設計原則：

1. **模組化設計**：每個腳本有明確的責任
2. **錯誤處理**：完善的錯誤檢查和處理機制
3. **使用者友善**：彩色輸出、互動式操作、詳細日誌
4. **可維護性**：清晰的結構、充分的註解
5. **系統整合**：與 Docker、cron 等系統服務整合

這些技巧和模式可以應用到其他系統管理任務中，是實用的 shell 程式設計參考。