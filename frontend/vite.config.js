import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  // 告訴 Vite 將 .glb 檔案視為靜態資產
  assetsInclude: ["**/*.glb"],
  plugins: [react()],
  server: {
    // 讓 Vite 監聽所有網路介面，以便在 Docker 容器中被外部訪問
    host: true,
    // 指定開發伺服器運行的端口，與 docker-compose.dev.yml 保持一致
    port: 3000,
    proxy: {
      // 將 /api 的請求代理到後端 Docker 服務
      "/api": {
        target: "http://backend:8000", // 使用 Docker 的服務名稱，而非 localhost
        changeOrigin: true,
      },
    },
  },
});