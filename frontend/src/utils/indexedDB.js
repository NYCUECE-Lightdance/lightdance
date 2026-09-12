import localforage from "localforage";

/**
 * 為「手動備份檔案」建立一個獨立的 localForage 實例
 */
const backupStore = localforage.createInstance({
  name: "LightDanceBackupDB",
  storeName: "backups",
  driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
});

/**
 * 儲存資料
 */
export async function saveLocalBackup(key, data) {
  try {
    console.log(`正在儲存備份到 IndexedDB: ${key}`);
    await backupStore.setItem(key, data);
    return true;
  } catch (error) {
    console.error("localForage Save Error:", error);
    throw error;
  }
}

/**
 * 讀取所有備份
 */
export async function getAllLocalBackups() {
  try {
    const backups = [];
    await backupStore.iterate((value, key) => {
      // 確保 value 是物件，避免舊資料格式導致展開報錯
      if (value && typeof value === "object") {
        backups.push({ key, ...value });
      } else {
        backups.push({ key, data: value });
      }
    });
    console.log(`已從 IndexedDB 讀取 ${backups.length} 筆備份`);
    return backups;
  } catch (error) {
    console.error("localForage Get Error:", error);
    return [];
  }
}

/**
 * 刪除指定備份
 */
export async function deleteLocalBackup(key) {
  try {
    await backupStore.removeItem(key);
    return true;
  } catch (error) {
    console.error("localForage Delete Error:", error);
    return false;
  }
}

/**
 * 清理過期備份
 */
export async function cleanExpiredBackups(days = 30) {
  const THIRTY_DAYS = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const backups = await getAllLocalBackups();

  for (const backup of backups) {
    if (backup.timestamp && now - backup.timestamp > THIRTY_DAYS) {
      await deleteLocalBackup(backup.key);
      console.log(`已清理過期備份: ${backup.key}`);
    }
  }
}
