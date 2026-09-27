/**
 * ESLint 設定（flat config，ESLint 10）。
 *
 * CI 的 `npm run lint` 只在 **error** 時失敗，warning 只是提示。
 *
 * ⚠️ **error 只留給「不管功能怎麼改都一定是錯」的東西。** CI 會擋合併，
 * 而大改版時一定會經過「東西拆到一半、有些變數暫時沒用到」的階段——
 * 那種狀態不該讓 CI 變紅，否則大家很快就學會無視紅叉。所以：
 *
 * - **error**：執行到就會出事，或幾乎不可能是刻意的。
 *   未定義的變數（執行到那一行才炸）、在條件式裡呼叫 hook（React 靠呼叫順序
 *   認 hook，順序一變 state 就對到別的 hook）、物件裡重複的 key、對常數賦值…
 *   這些是 `js.configs.recommended` 的大部分規則。
 * - **warn**：清理類。沒用到的變數、空的 catch、不會執行到的程式碼、
 *   effect 相依陣列少了東西（有時候是 bug，有時候是刻意用 ref 讀最新值）。
 *   值得看一眼，但不代表程式是錯的。
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

/**
 * recommended 裡屬於「清理類」的規則，降成 warning。
 * 判斷標準：這條規則報出來的東西，放著不管程式照樣正確。
 */
const CLEANUP_RULES = {
  // `const { height: _dropped, ...rest } = track` 是「拿掉某個欄位」的慣用寫法
  "no-unused-vars": ["warn", { ignoreRestSiblings: true }],
  "no-useless-assignment": "warn",
  "no-unused-labels": "warn",
  "no-unused-private-class-members": "warn",
  "no-unreachable": "warn",
  "no-empty": "warn",
  "no-empty-pattern": "warn",
  "no-useless-catch": "warn",
  "no-useless-escape": "warn",
  "no-extra-boolean-cast": "warn",
  "no-irregular-whitespace": "warn",
  "no-case-declarations": "warn",
  "no-prototype-builtins": "warn",
  "no-regex-spaces": "warn",
};

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
    rules: CLEANUP_RULES,
  },

  // 瀏覽器端的 React 程式碼
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
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
