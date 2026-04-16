const DB_NAME = "LightDanceBackupDB";
const STORE_NAME = "backups";
const DB_VERSION = 1;

/**
 * 開啟並初始化 IndexedDB
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * 儲存資料
 */
export async function saveLocalBackup(key, data) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("IndexedDB Save Error:", error);
    throw error;
  }
}

/**
 * 讀取所有備份
 */
export async function getAllLocalBackups() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      const backups = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          backups.push({ key: cursor.key, ...cursor.value });
          cursor.continue();
        } else {
          resolve(backups);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("IndexedDB Get Error:", error);
    return [];
  }
}

/**
 * 刪除指定備份
 */
export async function deleteLocalBackup(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("IndexedDB Delete Error:", error);
  }
}

/**
 * 清理過期備份 (預設 30 天)
 */
export async function cleanExpiredBackups(days = 30) {
  const THIRTY_DAYS = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const backups = await getAllLocalBackups();

  for (const backup of backups) {
    if (backup.timestamp && now - backup.timestamp > THIRTY_DAYS) {
      await deleteLocalBackup(backup.key);
      console.log(`已清理 IndexedDB 過期備份: ${backup.key}`);
    }
  }
}
