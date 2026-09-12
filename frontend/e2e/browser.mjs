/**
 * 找出可用的 Chromium 執行檔。
 *
 * Playwright 預設會去自己的快取目錄找瀏覽器，但版本編號是寫死在套件裡的
 * （例如 `chromium_headless_shell-1234`）。只要環境裡預先裝好的是別的版本，
 * `chromium.launch()` 就會直接炸掉並叫你 `npx playwright install`——在沒有
 * 外網或瀏覽器已經裝好的機器上，那個建議沒有意義。
 *
 * 所以這裡自己找一次：
 *   1. `CHROMIUM_PATH` 環境變數（最優先，要指定特定版本時用）
 *   2. `PLAYWRIGHT_BROWSERS_PATH` 或 `/opt/pw-browsers` 底下任何一版 chromium
 *   3. 都找不到 → 回 undefined，交還給 Playwright 的預設解析
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** 各平台在 chromium 資料夾裡的執行檔相對路徑 */
const CANDIDATES = [
  "chrome-linux/chrome",
  "chrome-linux/headless_shell",
  "chrome-headless-shell-linux64/chrome-headless-shell",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
];

const findIn = (root) => {
  if (!existsSync(root)) return undefined;
  // 先試 chromium-*，再試 chromium_headless_shell-*：完整版功能較齊
  const dirs = readdirSync(root)
    .filter((name) => name.startsWith("chromium"))
    .sort((a, b) => a.startsWith("chromium-") - b.startsWith("chromium-"))
    .reverse();

  for (const dir of dirs) {
    for (const rel of CANDIDATES) {
      const exe = join(root, dir, rel);
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
};

export const resolveChromiumPath = () => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return findIn(process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers");
};

/** 兩支腳本共用的啟動參數（容器裡沒有 sandbox / /dev/shm 很小） */
export const launchOptions = () => ({
  executablePath: resolveChromiumPath(),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

/**
 * 暖機：先讓 vite 把 /home 的模組圖轉譯過一次。
 *
 * 開發伺服器剛啟動時，第一次載入 /home 要現場轉譯幾百個模組，很容易超過
 * 腳本裡等待選擇器的時限——結果就是「編輯器載入不了」，但那是建置慢，
 * 不是程式壞掉（同一份程式碼第二次跑就全過）。
 *
 * ⚠️ 一定要開**獨立的 context**，不能借用等一下要驗的那個。
 * 暖機時還沒登入，`/home` 會把使用者踢回首頁，而那個過程會把「沒有 token」
 * 的狀態寫進 redux-persist（IndexedDB 是跟著 context 走的）。借用同一個
 * context 的話，後面登入完再開 /home 會讀到那份殘留而被彈回首頁——
 * 本來要繞過的問題反而被暖機自己製造出來。
 *
 * @param {import("playwright").Browser} browser 用它另開一個乾淨的 context
 */
export const warmUp = async (browser, base) => {
  const context = await browser.newContext();
  try {
    // 一定要攔掉 API。暖機時沒有攔的話，app 會去打 /api/get_music/...，
    // vite 把它轉給 `backend` 這個在開發機上不存在的主機，請求就一直掛著——
    // 開發伺服器接著會變得很慢，後面真正要驗的流程反而全部載入不了。
    await context.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      }),
    );
    const page = await context.newPage();
    await page.goto(`${base}/home`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(2000);
  } catch {
    /* 暖機失敗不影響後續判斷，真正的檢查會自己重試 */
  } finally {
    await context.close(); // 連同 IndexedDB / localStorage 一起丟掉
  }
};
