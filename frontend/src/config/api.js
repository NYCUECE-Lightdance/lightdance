// API configuration with smart detection
const getApiBaseUrl = () => {
  // 如果有環境變量設定，優先使用
  if (process.env.REACT_APP_API_BASE_URL) {
    console.log('🔧 使用環境變量 API URL:', process.env.REACT_APP_API_BASE_URL);
    return process.env.REACT_APP_API_BASE_URL;
  }
  
  // 自動檢測開發模式
  if (process.env.NODE_ENV === 'development') {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    console.log('🔍 檢測到開發模式');
    console.log('📍 當前頁面 hostname:', hostname);
    console.log('📍 當前頁面 port:', port);
    
    // 如果是在 npm start (通常是 localhost:3000)
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
      console.log('🏠 檢測到 npm start 開發模式，連接到 localhost:8000');
      return 'http://localhost:8000/api';
    }
    
    // 如果是其他IP (例如: 192.168.x.x 或你的實際IP)
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const apiUrl = `http://${hostname}:8000/api`;
      console.log('🌐 檢測到外部IP，使用:', apiUrl);
      return apiUrl;
    }
    
    // 預設開發模式
    console.log('🔄 使用預設開發API: localhost:8000');
    return 'http://localhost:8000/api';
  }
  
  // 生產模式使用相對路徑
  console.log('🏭 生產模式，使用相對路徑');
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

// API endpoints
export const API_ENDPOINTS = {
  BASE: API_BASE_URL,
  LOGIN: `${API_BASE_URL}/token`,
  USERS_ME: `${API_BASE_URL}/users/me`,
  TIMELIST: `${API_BASE_URL}/timelist`,
  ITEMS: `${API_BASE_URL}/items`,
  UPLOAD_ITEMS: `${API_BASE_URL}/upload_items`,
  UPLOAD_RAW: `${API_BASE_URL}/upload_raw`,
  UPLOAD_MUSIC: `${API_BASE_URL}/upload_music`,
  GET_MUSIC_LIST: `${API_BASE_URL}/get_music_list`,
  GET_MUSIC: `${API_BASE_URL}/get_music`,
  GET_RAND_LIGHTLIST: `${API_BASE_URL}/get_rand_lightlist`,
  GET_TEST_LIGHTLIST: `${API_BASE_URL}/get_test_lightlist`,
};

// 顯示當前配置
console.group('🔗 API 配置資訊');
console.log('Base URL:', API_BASE_URL);
console.log('環境:', process.env.NODE_ENV);
console.log('頁面位置:', window.location.href);
console.groupEnd();

export default API_ENDPOINTS;
