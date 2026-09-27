import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * 測試分成兩個 project：
 *
 * - **unit**：純函式（轉換器、輸出壓平、segment 核心）。跑 node 環境，最快，
 *   不需要 React 也不需要 DOM。
 * - **component**：元件層冒煙測試。跑 jsdom + React plugin，用來在 Phase 3
 *   把 audioplayer 拆件時擋住行為漂移——那些互動沒有任何純函式測試涵蓋得到。
 *
 * 兩者都只收 __tests__ 目錄下的檔案，避開 CRA 時期遺留的 src/App.test.js。
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/__tests__/**/*.test.{js,jsx}"],
          exclude: ["**/node_modules/**", "src/**/__tests__/**/*.dom.test.jsx"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "component",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/test/setup.js"],
          include: ["src/**/__tests__/**/*.dom.test.jsx"],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
  },
});
