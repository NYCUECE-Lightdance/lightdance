// 在開發模式下，Vite 的代理伺服器 (在 vite.config.js 中設定) 會將 /api 的請求轉發到後端。
// 在生產模式下，Nginx 或其他反向代理會處理這個轉發。
// 因此，我們只需要使用相對路徑即可，這樣最為簡潔且可靠。
const API_BASE_URL = "/api";

// API endpoints
export const API_ENDPOINTS = {
  BASE: API_BASE_URL,
  LOGIN: `${API_BASE_URL}/token`,
  USERS_ME: `${API_BASE_URL}/users/me`,
  TIMELIST: `${API_BASE_URL}/timelist`,
  ITEMS: `${API_BASE_URL}/items`,
  UPLOAD_ITEMS: `${API_BASE_URL}/upload_items/`,
  UPLOAD_RAW: `${API_BASE_URL}/upload_raw/`,
  UPLOAD_MUSIC: `${API_BASE_URL}/upload_music`,
  GET_MUSIC_LIST: `${API_BASE_URL}/get_music_list`,
  GET_MUSIC: `${API_BASE_URL}/get_music`,
  GET_RAND_LIGHTLIST: `${API_BASE_URL}/get_rand_lightlist`,
  GET_TEST_LIGHTLIST: `${API_BASE_URL}/get_test_lightlist`,
};

// 顯示當前配置
console.group("🔗 API 配置資訊");
console.log("Base URL:", API_BASE_URL);
// 在 Vite 中，使用 import.meta.env.MODE 來獲取環境模式
console.log("環境:", import.meta.env.MODE);
console.log("頁面位置:", window.location.href);
console.groupEnd();

export default API_ENDPOINTS;
