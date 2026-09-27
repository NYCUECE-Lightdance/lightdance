/**
 * ESLint 設定（flat config，ESLint 10）。
 *
 * CI 的 `npm run lint` 只在 **error** 時失敗，warning 只是提示。
 * 所以分級的原則是：
 *
 * - **error**：幾乎一定是 bug，而且畫面上不一定看得出來。
 *   例如未定義的變數（執行到那一行才炸）、在條件式裡呼叫 hook
 *   （React 靠呼叫順序認 hook，順序一變 state 就對到別的 hook）。
 * - **warn**：值得看一眼但不一定是錯。例如 effect 的相依陣列少了東西——
 *   有時候是 bug（CLAUDE.md「播放時跟著紅線捲動」那一節就是這樣來的），
 *   有時候是刻意的（用 ref 讀最新值、只想在掛載時跑一次）。
 *
 * 刻意**沒有**用 `react-hooks` 的 recommended 設定：v7 起它包含了一整組
 * React Compiler 的規則（set-state-in-effect、refs、immutability…），
 * 這個專案沒有用 compiler，那些規則會把大量刻意的寫法標成錯誤
 * （例如 Timeline 拖曳期間直接寫 DOM 的零 re-render 路徑）。
 *
 * 也沒有用 eslint-plugin-react：ESLint 10 自己就認得 JSX 裡用到的變數，
 * 不需要那個插件的 `jsx-uses-vars`，而它目前還不支援 ESLint 10。
 */
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

/** vitest 的 globals（component project 開了 `globals: true`） */
const vitestGlobals = Object.fromEntries(
  [
    "describe", "it", "test", "expect", "vi",
    "beforeEach", "afterEach", "beforeAll", "afterAll",
  ].map((name) => [name, "readonly"]),
);

export default [
  {
    ignores: ["dist/**", "coverage/**", "e2e/shots/**", "public/**"],
  },

  js.configs.recommended,

  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
  },

  // 瀏覽器端的 React 程式碼
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // `const { height: _dropped, ...rest } = track` 是「拿掉某個欄位」的慣用寫法
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // 測試
  {
    files: ["src/**/__tests__/**", "src/test/**"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...vitestGlobals },
    },
  },

  // 在 Node 上跑的腳本與設定檔
  {
    files: ["e2e/**", "scripts/**", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
];
