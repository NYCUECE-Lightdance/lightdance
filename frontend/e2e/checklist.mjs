/**
 * 手動驗收清單的瀏覽器版本。
 *
 * `todo.md` 文末那份 checklist 一直只能靠人手動點，這支腳本把其中
 * **不需要人眼判斷手感**的項目自動化：放色 / 選取 / 剪下 / 刪除 /
 * undo-redo / 快捷鍵 / 重新整理後的持久化 / 刻度尺跳時間 / Output 觸發上傳。
 *
 * ## 為什麼要有這個（元件測試不是已經很多了嗎）
 *
 * jsdom 測不到真實瀏覽器的鍵盤事件序列。實測抓到的第一個 bug 就是這類：
 * 按 Ctrl+3 會先送一個 `Control` keydown，它會吃掉快捷鍵的防彈跳名額，
 * 導致緊接著的 `3` 被丟棄——**所有 Ctrl+數字與 Shift+數字在瀏覽器上完全
 * 按不動**，但 jsdom 測試全綠（因為測試直接送最終那一下按鍵）。
 *
 * ## 執行
 *
 * ```bash
 * npm run dev          # 另一個終端機
 * npm run e2e
 * ```
 *
 * 後端不需要跑：所有 /api/** 都被攔截回假資料，音檔用臨時產生的 30 秒 WAV。
 * 因此「真的寫進 mongo」那一段測不到，其餘前端行為都會走過一次。
 * 截圖放在 `e2e/shots/`。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchOptions, warmUp } from "./browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

mkdirSync(OUT, { recursive: true });

/** 產生一段可辨識的 30 秒 WAV，讓 waveform decode 得出 duration */
const makeWav = (seconds = 30, sampleRate = 8000) => {
  const n = sampleRate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(
      Math.round(8000 * Math.sin(i / 20) * Math.sin(i / 9000)),
      44 + i * 2,
    );
  }
  return buf;
};

const WAV = makeWav();
const results = [];
let shotIndex = 0;

const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`,
  );
};

const shot = async (page, label) => {
  await page.screenshot({
    path: join(OUT, `${String(++shotIndex).padStart(2, "0")}-${label}.png`),
  });
};

/** 第 track 條時間軸上的所有 block（含空隙） */
const blocksOf = (page, track = 0) =>
  page.evaluate((t) => {
    const groups = new Map();
    for (const el of document.querySelectorAll(".timeline-block")) {
      const parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    }
    const els = [...groups.values()][t] ?? [];
    return els.map((el) => ({
      background: el.style.background || el.style.backgroundColor,
      width: el.style.width,
      // 選取框改成白色雙層 ring（box-shadow），不再是 border——
      // 舊版靠顏色分三種狀態，撞到同色系的色塊時會整個消失
      selected: /inset|0 0 0/.test(el.style.boxShadow || ""),
    }));
  }, track);

/** 空隙在畫面上是純黑（segment 模型：沒有段就是沒有光） */
const isGap = (bg) => !bg || /rgba?\(\s*0,\s*0,\s*0/.test(bg);

const coloredBlocks = async (page, track = 0) =>
  (await blocksOf(page, track)).filter((b) => !isGap(b.background));

const findBlockIndex = (page, wantGap) =>
  page.evaluate((gap) => {
    const els = [...document.querySelectorAll(".timeline-block")];
    return els.findIndex((el) => {
      const bg = el.style.background || el.style.backgroundColor;
      const black = !bg || /rgba?\(\s*0,\s*0,\s*0/.test(bg);
      return gap ? black : !black;
    });
  }, wantGap);

const stubApi = (context) =>
  context.route("**/api/**", (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.includes("/api/register"))
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "tester", username: "newcomer" }),
      });
    if (url.includes("/api/token")) return json({ access_token: "tester" });
    if (url.includes("/api/users/me"))
      return json({ username: "tester", disabled: false });
    // 真實 API 回的是 music_list（不是 list）——播放清單的「加入」要靠它
    if (url.includes("/api/get_music_list"))
      return json({ music_list: ["test.wav", "encore.wav"] });
    if (url.includes("/api/get_music/"))
      return route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: WAV,
      });
    if (url.includes("/api/timelist")) return json({ list: [] });
    if (url.includes("/api/raw/")) return json({ message: "not found" });
    if (url.includes("/api/upload")) return json({ status: "ok" });
    return json({});
  });

/*
 * ⚠️ 用 `data-part` 指名，不要用「第 N 個有 fill 的元素」。
 *
 * 一個部位可以由多個形狀組成（帽子 = 帽冠 + 帽簷，領帶 = 長方形 + 三角形），
 * 所以攤平之後的第 N 個元素和第 N 個**部位**不是同一件事——`.nth(1)` 拿到的
 * 是帽簷（還是部位 0），不是臉。先前六個呼叫端剛好全部傳 0 所以沒有中，
 * 而第一個寫 `clickArmorPart(page, 0, 1)` 以為在點臉的人就會踩到，
 * 且不會有任何錯誤。單元測試早就改用 data-part 了，這裡漏掉。
 *
 * `.first()` 是因為同一個部位的每個形狀都帶著相同的 data-part。
 */
const clickArmorPart = (page, armor, part) =>
  page
    .locator(".personBackGround")
    .nth(armor)
    .locator(`svg [data-part="${part}"]`)
    .first()
    .click();

/**
 * 開啟編輯器，必要時重試。
 *
 * /home 掛載時會檢查 redux 裡的 token，但 redux-persist 的 rehydrate 是
 * 非同步的——整頁載入後若 rehydrate 還沒完成會被判定成未登入而彈回 "/"。
 * 這是 app 既有的競態，這裡用重試繞過（不是這支腳本要驗的東西）。
 */
const openEditor = async (page, attempts = 4) => {
  for (let i = 0; i < attempts; i++) {
    await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
    try {
      await page.waitForSelector(".timeline-container", { timeout: 12000 });
      await page.waitForTimeout(3000); // 等音檔 decode 出 duration
      return i + 1; // 試了幾次才成功
    } catch {
      /* 被彈回 "/"，再試一次 */
    }
  }
  return 0;
};

const run = async () => {
  // 先暖機：開發伺服器剛啟動時第一次載入 /home 要現場轉譯幾百個模組，
  // 會超過 openEditor 等待選擇器的時限。用獨立 browser 跑完就關掉——
  // 同一個 browser 裡開第二個 context 會載入不了（各自解碼 30 秒 WAV、
  // 各開一個 AudioContext，容器的記憶體吃不消）。
  {
    const warmBrowser = await chromium.launch(launchOptions());
    await warmUp(warmBrowser, BASE);
    await warmBrowser.close();
  }

  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({
    viewport: { width: 1600, height: 950 },
  });
  await stubApi(context);
  const page = await context.newPage();

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  /*
   * 對話框一律接受。
   *
   * ⚠️ `dialog.accept()` **不帶參數時，prompt 回傳的是空字串，不是預設值**——
   * 這跟畫面上看到的行為（輸入框裡明明填著 100，按確定就送出 100）相反，
   * 而且不會有任何錯誤，只會讓被測的程式收到 ""。所以要答什麼得明講：
   * 呼叫端在觸發之前設 `promptAnswer`，用完歸還空字串。
   */
  let promptAnswer = "";
  page.on("dialog", (d) => d.accept(promptAnswer));

  /*
   * 音檔的抓取次數 —— 用來驗「解碼後的音訊有沒有被回收」。
   *
   * 解碼結果是這個編輯器最大的記憶體項目（立體聲每分鐘約 17MB），舊版只有
   * 離開編輯器才清，試聽過的每一首都一直留著。回收本身在記憶體裡看不到，
   * 但有一個乾淨的觀察點：**被丟掉的檔案下次要用會重新抓一次**。
   */
  const musicFetches = [];
  page.on(
    "request",
    (r) => r.url().includes("/api/get_music/") && musicFetches.push(r.url()),
  );

  const uploads = [];
  page.on(
    "request",
    (r) => r.url().includes("/api/upload") && uploads.push(r.url()),
  );

  /*
   * ── 建立帳號 ────────────────────────────────────────
   *
   * 登入頁多了一個註冊模式。要驗的是「切過去、填完、送出之後真的進得了 app」
   * ——後端建完會直接回權杖，所以不必再打一次登入表單。
   *
   * 順帶擋住一個回歸：標題與送出鈕的文字都是「登入」，用 `text=登入` 選會同時
   * 對到兩個（Playwright 的 strict mode 直接失敗）。實測就是這樣紅的。
   */
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.click("[data-testid='auth-switch']");
  await page.waitForTimeout(200);

  const registerFields = await page.locator("form input").count();
  record(
    "登入頁切得到建立帳號（多出確認密碼與邀請碼）",
    registerFields === 4,
    `${registerFields} 個欄位（帳號 / 密碼 / 確認 / 邀請碼）`,
  );

  await page.fill('input[type="text"] >> nth=0', "newcomer");
  await page.fill('input[type="password"] >> nth=0', "password123");
  await page.fill('input[type="password"] >> nth=1', "不一樣的密碼");
  await page.click("[data-testid='auth-submit']");
  await page.waitForTimeout(300);

  record(
    "兩次密碼不同時擋在前端，不會送出去",
    (await page.locator(".alert-danger").count()) === 1 &&
      page.url().includes("/login"),
    (await page.locator(".alert-danger").innerText().catch(() => "")).trim(),
  );

  await page.fill('input[type="password"] >> nth=1', "password123");
  await page.click("[data-testid='auth-submit']");
  await page.waitForTimeout(300);

  /*
   * 邀請碼是必填的。這裡驗的是「空的時候擋在前端」——後端一樣會擋（回 403
   * 邀請碼不正確），但那要繞一趟網路才換到一句說錯方向的話：使用者其實是
   * 根本沒填。stub 的 /api/register 一律回 201，所以如果沒擋住就會直接進
   * dashboard，這則就抓得到。
   */
  record(
    "沒填邀請碼時擋在前端，不會送出去",
    page.url().includes("/login") &&
      (await page.locator(".alert-danger").innerText().catch(() => "")).includes(
        "邀請碼",
      ),
    (await page.locator(".alert-danger").innerText().catch(() => "")).trim(),
  );

  await page.fill('input[type="text"] >> nth=1', "test-invite-code");
  await shot(page, "register-form");

  await page.click("[data-testid='auth-submit']");
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  // 名字是從伺服器的回應來的，不是前端自己填的——這一行同時驗到那條路
  const welcome = await page.locator(".welcome-message").innerText();
  record(
    "建立帳號後直接進到 dashboard（不必再登入一次）",
    welcome.includes("newcomer"),
    welcome.trim(),
  );

  // ── 登入 ──────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="text"]', "tester");
  await page.fill('input[type="password"]', "pw");
  // 標題與送出鈕的文字都是「登入」，所以指名那顆按鈕而不是用文字比對
  await page.click("[data-testid='auth-submit']");
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  record("登入", true);

  // /home 掛載時會檢查 redux 裡的 token，而 redux-persist 的寫入是非同步的。
  // 程式裡用 flushPersist() 把窗口縮到很小，但沒有完全消除，所以先讓它落地。
  // （版面稽核也是這樣處理的。）
  await page.waitForTimeout(2500);

  // 一次就要成功。登入後 token 有沒有立刻落地就看這條——persist 有 2 秒
  // debounce，沒有 flushPersist() 的話整頁載入 /home 會讀不到 token 而彈回首頁。
  const tries = await openEditor(page);
  record(
    "登入後直接開 /home 一次就進得去",
    tries === 1,
    tries === 0 ? "一直被彈回首頁" : `試了 ${tries} 次`,
  );
  if (!tries) throw new Error("編輯器一直載入不了");

  const header = await page.locator(".controls").first().innerText();
  record("音檔載入出 duration", /0:30|0:29/.test(header));
  await shot(page, "editor-loaded");

  /*
   * 波形真的畫出來了。
   *
   * 這一項在改繪圖程式碼時才發現是個缺口：波形整片空白的話，上面每一項都還是
   * 會過（duration 是從解碼結果來的，跟畫不畫得出來無關）。而波形的繪圖路徑
   * 有好幾個分母會在容器還沒量到寬度時變成 0，`NaN` 傳進 `fillRect`
   * **不會報錯，只是什麼都不畫**——安靜到 console 一片乾淨。
   *
   * 直接數畫布上有多少個不透明的像素，這是唯一問得到「有沒有畫東西」的方式。
   */
  const wavePixels = await page.evaluate(() => {
    const canvas = document.querySelector(".waveform-container canvas");
    if (!canvas || !canvas.width || !canvas.height) return -1;
    const { data } = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
    return painted;
  });
  record(
    "波形真的畫出來（不是一片空白）",
    wavePixels > 1000,
    wavePixels < 0 ? "找不到畫布" : `${wavePixels} 個像素`,
  );

  // 換一個亮色，截圖才看得出東西（預設 chosenColor 是接近全黑的 rgb(5,5,5)）
  await page.evaluate(() => {
    const well = document.querySelector("#colorWell");
    if (!well) return;
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set.call(well, "#ff3b30");
    well.dispatchEvent(new Event("input", { bubbles: true }));
    well.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(500);

  // ── 放色 ──────────────────────────────────────────────
  const before = (await coloredBlocks(page, 0)).length;
  await clickArmorPart(page, 0, 0);
  await page.waitForTimeout(500);
  const after = await coloredBlocks(page, 0);
  record(
    "點光衣放色 → 時間軸出現色塊",
    after.length === before + 1,
    `${before} → ${after.length} 塊`,
  );

  // 預設 1 秒 / 30 秒總長 ≈ 3.33%
  const widthPct = parseFloat(after[0]?.width ?? "0");
  record(
    "新色塊是預設 1 秒（Phase 5 語意）",
    Math.abs(widthPct - 100 / 30) < 0.6,
    `寬度 ${after[0]?.width}`,
  );
  await shot(page, "place-color");

  const blockEls = page.locator(".timeline-block");

  // ── 選取 ──────────────────────────────────────────────
  await blockEls.nth(await findBlockIndex(page, false)).click();
  await page.waitForTimeout(300);
  const selected = (await blocksOf(page, 0)).filter((b) => b.selected).length;
  record("點色塊 → 出現選取框", selected === 1, `${selected} 塊被選`);
  await shot(page, "select-block");

  // ── 亮度快捷鍵（就是這條抓到 modifier 吃掉防彈跳的 bug）──
  await page.keyboard.press("Control+3");
  await page.waitForTimeout(600);
  const dimmed = await coloredBlocks(page, 0);
  record(
    "Ctrl+3 設透明度 30%",
    /0\.3/.test(dimmed[0]?.background ?? ""),
    dimmed[0]?.background,
  );
  await shot(page, "brightness");

  // ── 剪下 ──────────────────────────────────────────────
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const beforeCut = (await coloredBlocks(page, 0)).length;
  await page.keyboard.press("c");
  await page.waitForTimeout(500);
  const afterCut = (await coloredBlocks(page, 0)).length;
  record(
    "C 鍵剪下 → 一塊變兩塊",
    afterCut === beforeCut + 1,
    `${beforeCut} → ${afterCut}`,
  );
  await shot(page, "cut");

  // ── Undo / Redo ───────────────────────────────────────
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  record(
    "Ctrl+Z 復原剪下",
    (await coloredBlocks(page, 0)).length === beforeCut,
  );

  await page.keyboard.press("Control+y");
  await page.waitForTimeout(500);
  record("Ctrl+Y 重做", (await coloredBlocks(page, 0)).length === afterCut);
  await shot(page, "undo-redo");

  // ── 刪除 ──────────────────────────────────────────────
  await blockEls.nth(await findBlockIndex(page, false)).click();
  await page.waitForTimeout(300);
  const beforeDel = (await coloredBlocks(page, 0)).length;
  await page.click(".delete-button");
  await page.waitForTimeout(500);
  const afterDel = (await coloredBlocks(page, 0)).length;
  record(
    "刪除鍵移除色塊",
    afterDel === beforeDel - 1,
    `${beforeDel} → ${afterDel}`,
  );
  await shot(page, "delete");

  // ── 點空隙取消選取（segment 模型的新語意）──────────────
  await blockEls.nth(await findBlockIndex(page, false)).click();
  await page.waitForTimeout(200);
  await blockEls.nth(await findBlockIndex(page, true)).click();
  await page.waitForTimeout(300);
  record(
    "點空隙 → 取消選取",
    (await blocksOf(page, 0)).filter((b) => b.selected).length === 0,
  );

  // ── Effect 選單 ───────────────────────────────────────
  const effectBtn = page.locator("button.effect-button");
  if (await effectBtn.count()) {
    await effectBtn.first().click();
    await page.waitForTimeout(400);
    const options = await page.locator(".effect-menu-item").count();
    record("Effect 選單展開", options >= 3, `${options} 個選項`);
    await shot(page, "effect-menu");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // ── 頻閃是 metadata，不切色塊 ──────────────────────────
  //
  // 舊版套下去之後那個色塊就被換成 N 個小色塊，想整段挪半拍得把 N 個全部選
  // 起來（而且它們之間有空隙，Shift 連選會斷）。現在畫面上還是一個色塊，
  // 只多一個角標；展開只發生在壓平輸出與播放預覽。
  //
  {
    const blockBefore = await coloredBlocks(page, 0);
    await page.locator(".timeline-block[data-selected='true']").first().click().catch(() => {});
    await page.waitForTimeout(200);

    // 選起第一個有顏色的色塊
    const lit = page.locator(".timeline-block:not([data-gap])").first();
    await lit.click();
    await page.waitForTimeout(300);

    // Escape 不會關掉這個選單（它只清選取），所以先問狀態再決定要不要點——
    // 無條件點一下有可能是把已經開著的選單關掉
    if (!(await page.locator(".effect-menu").count())) {
      await effectBtn.first().click();
      await page.waitForTimeout(300);
    }
    promptAnswer = "250"; // 1 秒的色塊 → 四個週期
    await page.locator(".effect-menu-item", { hasText: "頻閃" }).first().click();
    await page.waitForTimeout(600);
    promptAnswer = "";

    const blockAfter = await coloredBlocks(page, 0);
    const marks = await page.locator(".block-blink-mark").count();

    record(
      "套頻閃之後色塊沒有被切開",
      blockAfter.length === blockBefore.length,
      `${blockBefore.length} → ${blockAfter.length} 塊`,
    );
    record("頻閃的色塊看得到角標", marks >= 1, `${marks} 個角標`);
    await shot(page, "blink");
  }

  // ── 重新整理後 persist 復原（風險最高的一項）────────────
  const beforeReload = await coloredBlocks(page, 0);
  await page.waitForTimeout(3000); // redux-persist 有 2 秒 debounce
  const reloadTries = await openEditor(page);
  record("重新整理後仍在編輯器裡（沒被彈回首頁）", reloadTries === 1);
  const afterReload = await coloredBlocks(page, 0);
  record(
    "重新整理後光表復原（serialize:false 路徑）",
    afterReload.length === beforeReload.length && afterReload.length > 0,
    `${beforeReload.length} → ${afterReload.length} 塊`,
  );
  await shot(page, "after-reload");

  // ── 拖曳邊緣調整長度 ──────────────────────────────────
  //
  // 這條路徑 jsdom 測不到（沒有版面，getBoundingClientRect 全回 0），
  // 而它同時牽涉像素換算、邊界夾緊與網格對齊——只有真瀏覽器驗得了。
  const coloredBlockHandle = await page.evaluateHandle(() => {
    return [...document.querySelectorAll(".timeline-block")].find((el) =>
      /rgba?\((?!\s*0,\s*0,\s*0)/.test(el.style.background || ""),
    );
  });
  const beforeResize = await coloredBlockHandle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  if (beforeResize && beforeResize.w > 4) {
    // 邊緣偵測只對**已選取**的色塊生效（handleBlockMouseMove 的守衛），
    // 所以要先點一下讓它進入選取狀態，否則 hoverEdge 永遠是 null。
    await page.mouse.click(
      beforeResize.x + beforeResize.w / 2,
      beforeResize.y + beforeResize.h / 2,
    );
    await page.waitForTimeout(300);

    // 再把游標移到右緣（8px 內）讓 hoverEdge 亮起來，然後按住往右拖
    const edgeX = beforeResize.x + beforeResize.w - 3;
    const midY = beforeResize.y + beforeResize.h / 2;
    await page.mouse.move(edgeX, midY);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.move(edgeX + 120, midY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const afterResize = await coloredBlockHandle.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    record(
      "拖曳右緣可以把色塊拉長",
      afterResize > beforeResize.w + 20,
      `${Math.round(beforeResize.w)}px → ${Math.round(afterResize)}px`,
    );
  } else {
    record("拖曳右緣可以把色塊拉長", false, "找不到有色色塊");
  }

  // ── 刻度尺跳時間 ──────────────────────────────────────
  //
  // 播放中的那一項特別容易壞：停掉音源之後，waveform 有兩處「把播放位置寫回
  // Redux」的邏輯會蓋掉剛指定的時間，看起來就像「點了沒反應」。
  const readTimeMs = () =>
    page.evaluate(() => {
      const txt = document.querySelector(".controls").textContent.replace(/\s+/g, " ");
      const m = txt.match(/(\d+):(\d\d):(\d\d\d)\s*\/\s*\d+:\d\d:\d\d\d/);
      return m ? (+m[1] * 60 + +m[2]) * 1000 + +m[3] : null;
    });

  const clickRulerAt = async (fraction) => {
    const box = await page.locator(".time-ruler").boundingBox();
    await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
    await page.waitForTimeout(700);
  };

  const rulerBox = await page.locator(".time-ruler").boundingBox();
  if (rulerBox) {
    await clickRulerAt(0.5);
    const pausedSeek = await readTimeMs();
    record(
      "暫停中點刻度尺會跳時間",
      Math.abs(pausedSeek - 15000) <= 100,
      `${pausedSeek}ms（期望 15000）`,
    );

    /*
     * 播放中點刻度尺 → **跳過去而且繼續播**。
     *
     * 這是引擎化之後的行為改變：舊版的 seek 會把音源停掉（於是變成暫停），
     * 因為當時位置分散在三個地方，seek 必須手動打斷播放的連鎖才不會被覆寫。
     * 現在引擎直接整批重排，播放不中斷——和一般 DAW 一致。
     *
     * 所以不能斷言「正好等於 22500」，音樂已經往前走了一段。
     * 驗的是「跳到那裡而且沒有往回」。
     */
    await page.locator(".play-button").click();
    await page.waitForTimeout(1200);
    await clickRulerAt(0.75);
    await page.waitForTimeout(200);
    const playingSeek = await readTimeMs();
    record(
      "播放中點刻度尺會跳過去並繼續播",
      playingSeek >= 22400 && playingSeek < 25000,
      `${playingSeek}ms（期望 22500 起、繼續前進）`,
    );

    // 後面幾項假設是暫停狀態
    await page.locator(".play-button").click();
    await page.waitForTimeout(300);
    /*
     * 倍速播放時的位置。
     *
     * 這一項守的是一個真的算錯的公式。舊版開播時的錨點是 `now - offset`
     * （少除了一個 rate），代進 `(t - anchor) × rate` 得到
     * `(Δt + offset) × rate` 而不是 `offset + Δt × rate`——兩者只有在
     * **rate = 1 或 offset = 0** 時才相等。
     *
     * 也就是說「從中間某處用非 1 倍速播」位置就是錯的，而 `currentTime`
     * 是光衣預覽取色的依據，所以變速對拍時看到的燈跟聽到的音樂對不上。
     *
     * 這裡從第 15 秒用 2 倍速播約 1 秒：正確答案在 17000 附近，
     * 舊公式會給 32000 上下（(1 + 15) × 2），差距大到不必抓得很準。
     */
    await page.selectOption("#speed-select", "2");
    await page.waitForTimeout(300);
    await clickRulerAt(0.5); // 回到 15000ms
    const before = await readTimeMs();

    await page.locator(".play-button").click();
    await page.waitForTimeout(1000);
    await page.locator(".play-button").click(); // 暫停，讓位置寫回 redux
    await page.waitForTimeout(600);
    const after = await readTimeMs();
    await page.selectOption("#speed-select", "1");
    await page.waitForTimeout(300);

    const advanced = after - before;
    record(
      "2 倍速從第 15 秒播，位置照 2 倍速前進",
      before === 15000 && advanced > 1200 && advanced < 4000,
      `${before} → ${after}（前進 ${advanced}ms，舊公式會直接跳到 32000 附近）`,
    );
  } else {
    record("刻度尺存在", false, "找不到 .time-ruler");
  }

  // ── Move Mode：多個色塊一起搬 ──────────────────────────
  //
  // 這一項要同時對三件事：拖曳過程的像素邊界、放開後 moveSegments 算出來的
  // 落點、以及「整批共用同一個位移量」。相對位置只要差一格，樂句的節奏就變了。
  // jsdom 連色塊有多寬都不知道，只有真瀏覽器驗得到。
  const litBoxes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".timeline-block")]
        .filter((el) =>
          /rgba?\((?!\s*0,\s*0,\s*0)/.test(el.style.background || ""),
        )
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .sort((a, b) => a.x - b.x),
    );

  // 再放一個色塊，讓這條時間軸上有兩個可以一起搬的東西
  await clickRulerAt(0.35);
  await clickArmorPart(page, 0, 0);
  await page.waitForTimeout(600);

  const dragBefore = await litBoxes();
  if (dragBefore.length >= 2) {
    const centerOf = (b) => [b.x + b.w / 2, b.y + b.h / 2];

    // 選起兩個色塊：點第一個、Shift 點第二個
    await page.mouse.click(...centerOf(dragBefore[0]));
    await page.waitForTimeout(200);
    await page.keyboard.down("Shift");
    await page.mouse.click(...centerOf(dragBefore[1]));
    await page.keyboard.up("Shift");
    await page.waitForTimeout(300);

    const selected = await page.evaluate(
      () => document.querySelectorAll(".timeline-block[data-selected='true']").length,
    );

    // 進 Move Mode → 點色塊開始追蹤 → 移動滑鼠 → 再點一下提交
    await page.keyboard.press("m");
    await page.waitForTimeout(200);
    const [gx, gy] = centerOf(dragBefore[0]);
    await page.mouse.click(gx, gy);
    await page.waitForTimeout(150);
    await page.mouse.move(gx + 100, gy, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.click(gx + 100, gy);
    await page.waitForTimeout(600);

    const after = await litBoxes();
    const moved = after.length === dragBefore.length;
    const shifts = moved ? after.map((b, i) => b.x - dragBefore[i].x) : [];
    const sameShift =
      shifts.length >= 2 && shifts.every((d) => Math.abs(d - shifts[0]) <= 2);

    record("Shift 多選兩個色塊", selected === 2, `${selected} 塊被選`);
    record(
      "Move Mode 整批一起搬，位移量相同",
      moved && shifts[0] > 20 && sameShift,
      `位移 ${shifts.map(Math.round).join(" / ")} px`,
    );
    await shot(page, "multi-drag");
  } else {
    record("Move Mode 整批一起搬", false, `只有 ${dragBefore.length} 個色塊`);
  }

  // ── 框選（marquee）─────────────────────────────────────
  //
  // 框選的重點是**跨軌**：Shift+click 只能在同一條時間軸上加選，而同一個樂句
  // 在七位舞者身上各有一段時，一次要點十幾下。
  //
  // 這一項只有真瀏覽器驗得到：jsdom 量不到色塊的位置，也沒有 elementFromPoint，
  // 而框選整件事就是「矩形碰到誰」。
  //
  // 先在第二條時間軸上也放一個色塊，才有跨軌的東西可以框。
  const selectedCount = () =>
    page.evaluate(
      () => document.querySelectorAll(".timeline-block[data-selected='true']").length,
    );

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll(".timeline")].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width) };
    }),
  );

  if (rows.length >= 2) {
    /*
     * 預設的三條軌是舞者 1/2/3 的同一個部位，所以「在第二軌放色塊」＝
     * 點第二位舞者身上的同一個部位。這比去改軌道的下拉選單可靠——
     * 選單的選項順序不是這支腳本該綁的東西。
     */
    await clickRulerAt(0.2);
    await page.waitForTimeout(200);
    await clickArmorPart(page, 1, 0);
    await page.waitForTimeout(600);
    const beforeCross = (await coloredBlocks(page, 1)).length;

    // 先清掉選取，框選才驗得出「框到幾個」
    await page.mouse.click(rows[0].left + rows[0].width * 0.9, rows[0].top + 20);
    await page.waitForTimeout(300);

    /*
     * 從第一軌的空白處往下拉到第二軌。起點刻意選在時間軸最右邊（那裡一定是
     * 空隙），往左下拉回來——框可以往任何方向拉，順便驗到這件事。
     */
    const x2 = rows[0].left + rows[0].width * 0.05;
    await page.mouse.move(rows[0].left + rows[0].width * 0.95, rows[0].top + 20);
    await page.mouse.down();
    await page.mouse.move(x2, rows[1].bottom - 20, { steps: 12 });
    await page.waitForTimeout(150);

    const boxVisible = await page.evaluate(() => {
      const box = document.querySelector(".marquee-box");
      if (!box) return null;
      const r = box.getBoundingClientRect();
      return getComputedStyle(box).display !== "none" && r.width > 10 && r.height > 10;
    });

    await page.mouse.up();
    await page.waitForTimeout(400);

    const framed = await selectedCount();
    record("拖曳時看得到框選的矩形", boxVisible === true, String(boxVisible));
    record(
      "框選一次選到跨軌的多個色塊",
      framed >= 2,
      `${framed} 塊被選（第二軌有 ${beforeCross} 個色塊）`,
    );
    await shot(page, "marquee");

    /*
     * Shift 框選是加選。
     *
     * 這裡有一個很容易漏的順序問題：Timeline 自己的 handler 會在**同一次
     * mousedown** 把選取清空（點空隙 = 取消選取），所以「原本選了什麼」必須在
     * 按下的那一刻就存起來，等到 mouseup 再去讀就只剩空的了——那會讓 Shift
     * 框選退化成「每次都從頭選」，而畫面上看起來只是「怎麼沒加進去」。
     */
    // 先只框第二軌（1 塊）
    await page.mouse.move(rows[1].left + rows[1].width * 0.95, rows[1].top + 20);
    await page.mouse.down();
    await page.mouse.move(x2, rows[1].bottom - 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const firstPass = await selectedCount();

    // 再按住 Shift 框第一軌，兩次的結果要疊起來
    await page.keyboard.down("Shift");
    await page.mouse.move(rows[0].left + rows[0].width * 0.95, rows[0].top + 20);
    await page.mouse.down();
    await page.mouse.move(x2, rows[0].bottom - 20, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.waitForTimeout(400);
    const added = await selectedCount();

    record(
      "Shift 框選是加選，不是重新選",
      added > firstPass,
      `${firstPass} → ${added} 塊`,
    );

    // 單純點一下空隙仍然是取消選取，不能被框選吃掉
    await page.mouse.click(rows[0].left + rows[0].width * 0.9, rows[0].top + 20);
    await page.waitForTimeout(400);
    record("點一下空隙仍然是取消選取", (await selectedCount()) === 0, "");

    /*
     * ── 跨軌拖曳 ────────────────────────────────────────
     *
     * 框選早就能一次選到好幾條軌，但拖曳原本只動點到的那一條——選了三條只有
     * 一條會走，而且不報錯。這兩項驗的是：
     *
     * ① 水平：整批共用同一個位移量（樂句在幾條軌上搬完仍然對得齊）
     * ② 垂直：拖到別的列上就是換軌，色塊真的換到那一條時間軸底下
     *
     * 兩項都只有真瀏覽器驗得到——jsdom 沒有 `elementFromPoint`，
     * 而「游標停在哪一列」整件事就是問它。
     */

    /** 每個亮著的色塊在第幾列（用 .timeline 的 data-row-index） */
    const litByRow = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".timeline-block[data-segment-id]")]
          .filter((el) =>
            /rgba?\((?!\s*0,\s*0,\s*0)/.test(el.style.background || ""),
          )
          .map((el) => {
            const r = el.getBoundingClientRect();
            const row = el.closest(".timeline[data-row-index]");
            return {
              row: Number(row?.dataset.rowIndex ?? -1),
              x: Math.round(r.x),
              cx: Math.round(r.x + r.width / 2),
              cy: Math.round(r.y + r.height / 2),
            };
          })
          .sort((a, b) => a.row - b.row || a.x - b.x),
      );

    // ① 水平：框選兩軌之後整批一起搬
    await page.mouse.move(rows[0].left + rows[0].width * 0.95, rows[0].top + 20);
    await page.mouse.down();
    await page.mouse.move(x2, rows[1].bottom - 20, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const beforeCrossDrag = await litByRow();
    const rowsInSelection = new Set(beforeCrossDrag.map((b) => b.row)).size;

    if (rowsInSelection >= 2) {
      const grab = beforeCrossDrag[0];
      await page.keyboard.press("m");
      await page.waitForTimeout(200);
      await page.mouse.click(grab.cx, grab.cy);
      await page.waitForTimeout(150);
      await page.mouse.move(grab.cx + 80, grab.cy, { steps: 10 });
      await page.waitForTimeout(150);
      await page.mouse.click(grab.cx + 80, grab.cy);
      await page.waitForTimeout(600);

      const afterCrossDrag = await litByRow();
      const perRow = new Map();
      for (const b of afterCrossDrag) {
        if (!perRow.has(b.row)) perRow.set(b.row, []);
        perRow.get(b.row).push(b);
      }
      const shifts = beforeCrossDrag.map((b, i) => afterCrossDrag[i]?.x - b.x);
      const movedRows = new Set(
        beforeCrossDrag.filter((b, i) => shifts[i] > 20).map((b) => b.row),
      );

      record(
        "跨軌選取一起搬：兩條軌都動了，而且位移量相同",
        movedRows.size >= 2 &&
          shifts.every((d) => Number.isFinite(d) && Math.abs(d - shifts[0]) <= 2),
        `${movedRows.size} 條軌移動，位移 ${shifts.map(Math.round).join(" / ")} px`,
      );
      await shot(page, "cross-track-drag");
    } else {
      record(
        "跨軌選取一起搬：兩條軌都動了，而且位移量相同",
        false,
        `框到的色塊只落在 ${rowsInSelection} 條軌上`,
      );
    }

    // ② 垂直：把一個色塊拖到下一列
    await page.mouse.click(rows[0].left + rows[0].width * 0.9, rows[0].top + 20);
    await page.waitForTimeout(300);

    const beforeVertical = await litByRow();
    const onRow0 = beforeVertical.filter((b) => b.row === 0);
    const countOn = (list, row) => list.filter((b) => b.row === row).length;

    if (onRow0.length > 0 && rows.length >= 3) {
      const victim = onRow0[0];
      await page.mouse.click(victim.cx, victim.cy);
      await page.waitForTimeout(250);
      await page.keyboard.press("m");
      await page.waitForTimeout(200);
      await page.mouse.click(victim.cx, victim.cy);
      await page.waitForTimeout(150);
      // 往下拖到第三列（第二列上已經有東西，換到空的那條比較好判讀）
      const dropY = rows[2].top + (rows[2].bottom - rows[2].top) / 2;
      await page.mouse.move(victim.cx, dropY, { steps: 12 });
      await page.waitForTimeout(200);
      await page.mouse.click(victim.cx, dropY);
      await page.waitForTimeout(600);

      const afterVertical = await litByRow();
      record(
        "把色塊拖到別條軌上，它就換到那條軌了",
        countOn(afterVertical, 2) === countOn(beforeVertical, 2) + 1 &&
          countOn(afterVertical, 0) === onRow0.length - 1,
        `第 1 軌 ${onRow0.length} → ${countOn(afterVertical, 0)}，` +
          `第 3 軌 ${countOn(beforeVertical, 2)} → ${countOn(afterVertical, 2)}`,
      );
      await shot(page, "vertical-drag");
    } else {
      record(
        "把色塊拖到別條軌上，它就換到那條軌了",
        false,
        `第 1 軌 ${onRow0.length} 個色塊 / ${rows.length} 條軌`,
      );
    }
    /*
     * ── 貼上的滑鼠預覽 ──────────────────────────────────
     *
     * 舊流程是「先點一個目標色塊選起來，再按 Ctrl+V」——想貼到空白處沒有東西
     * 可以點，而且按下去之前完全看不到會貼到哪。現在游標移到哪，落點的框就
     * 跟到哪，按左鍵就貼在框的位置。
     *
     * jsdom 驗不到這一段：框的位置是量出來的（列的實際上下緣 × 時間換算成的
     * 像素），而「游標停在哪一列」靠的是 `elementFromPoint`。
     */
    await page.mouse.click(rows[0].left + rows[0].width * 0.9, rows[0].top + 20);
    await page.waitForTimeout(300);

    const litOnRow = async (row) =>
      (await litByRow()).filter((b) => b.row === row).length;

    const sourceBlock = (await litByRow()).find((b) => b.row === 0);
    if (sourceBlock) {
      await page.mouse.click(sourceBlock.cx, sourceBlock.cy);
      await page.waitForTimeout(250);
      await page.keyboard.press("Control+c");
      await page.waitForTimeout(300);

      // 移到第三軌的空白處，落點的框應該出現在那裡
      const dropX = rows[2].left + rows[2].width * 0.7;
      const dropY = rows[2].top + (rows[2].bottom - rows[2].top) / 2;
      await page.mouse.move(dropX, dropY, { steps: 6 });
      await page.waitForTimeout(200);

      const ghost = await page.evaluate(() => {
        const el = document.querySelector("[data-testid='paste-ghost']");
        if (!el || getComputedStyle(el).display === "none") return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });

      const onTargetRow =
        ghost &&
        ghost.y >= rows[2].top - 2 &&
        ghost.y + ghost.h <= rows[2].bottom + 2;

      record(
        "複製模式下滑鼠移到哪，落點的框就畫在哪",
        !!ghost && ghost.w > 5 && onTargetRow,
        ghost
          ? `框在 (${ghost.x}, ${ghost.y}) ${ghost.w}×${ghost.h}，` +
            `第 3 軌是 ${rows[2].top}~${rows[2].bottom}`
          : "沒有框",
      );
      await shot(page, "paste-preview");

      // 按下去就貼在框的位置
      const beforePaste = await litOnRow(2);
      await page.mouse.click(dropX, dropY);
      await page.waitForTimeout(600);
      const afterPaste = await litOnRow(2);

      const pastedNearGhost = ghost
        ? (await litByRow()).some(
            (b) => b.row === 2 && Math.abs(b.x - ghost.x) <= 4,
          )
        : false;

      record(
        "按左鍵就貼在框的位置（不必先選目標再按 Ctrl+V）",
        afterPaste === beforePaste + 1 && pastedNearGhost,
        `第 3 軌 ${beforePaste} → ${afterPaste} 個色塊，落點對得上框：${pastedNearGhost}`,
      );

      /*
       * ── 相位偏移（跑馬燈）────────────────────────────
       *
       * 一個色塊貼到好幾條軌上、每一條往後推一個固定間隔，就是一道光波沿著
       * 隊形跑過去。在這之前要做只能複製 N 次再一條一條推。
       *
       * 這裡驗的是「預覽真的變成階梯」——落點運算有單元測試，但「改了欄位
       * 之後畫面上跟著變」只有真瀏覽器看得到（而且第一版是 phaseMs 進了
       * listener effect 的 deps，改完間隔框會整組消失）。
       */
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      /*
       * 素材要自己擺：前面那些色塊落在不同時間，而這一項要驗的是「本來對齊的
       * 東西被錯開」——來源如果一開始就沒對齊，就分不出錯開是相位造成的還是
       * 本來就這樣。所以在同一個播放位置上，於第 1、2 軌各放一個色塊。
       */
      await clickRulerAt(0.62);
      await page.waitForTimeout(200);
      await clickArmorPart(page, 0, 0);
      await page.waitForTimeout(300);
      await clickArmorPart(page, 1, 0);
      await page.waitForTimeout(500);

      // 只框那個時間附近的兩塊，不要把別的時間的東西也框進來
      await page.mouse.move(rows[0].left + rows[0].width * 0.58, rows[0].top + 8);
      await page.mouse.down();
      await page.mouse.move(
        rows[0].left + rows[0].width * 0.78,
        rows[1].bottom - 8,
        { steps: 10 },
      );
      await page.mouse.up();
      await page.waitForTimeout(400);
      await page.keyboard.press("Control+c");
      await page.waitForTimeout(300);

      const phaseField = page.locator("[data-testid='paste-phase']");
      const hasPhaseField = (await phaseField.count()) === 1;

      const ghostBoxes = async () =>
        page.evaluate(() =>
          [...document.querySelectorAll("[data-testid='paste-ghost']")]
            .filter((el) => getComputedStyle(el).display !== "none")
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { x: Math.round(r.x), y: Math.round(r.y) };
            })
            .sort((a, b) => a.y - b.y),
        );

      if (hasPhaseField) {
        const mid = [
          rows[0].left + rows[0].width * 0.25,
          rows[0].top + (rows[0].bottom - rows[0].top) / 2,
        ];
        await page.mouse.move(...mid, { steps: 4 });
        await page.waitForTimeout(200);
        const flat = await ghostBoxes();

        await phaseField.fill("500");
        await page.waitForTimeout(300);
        const staggered = await ghostBoxes();

        // 來源是對齊的，所以間隔 0 時兩個框的左緣一樣；設了間隔之後第二條往右
        const flatSame =
          flat.length === 2 && Math.abs(flat[1].x - flat[0].x) <= 2;
        const firstStays =
          staggered.length === 2 && Math.abs(staggered[0].x - flat[0].x) <= 2;
        const secondMoves =
          staggered.length === 2 && staggered[1].x > staggered[0].x + 5;

        record(
          "設了跑馬燈間隔之後，預覽的框逐條錯開",
          flatSame && firstStays && secondMoves,
          `間隔 0：${flat.map((g) => g.x).join("/")} → ` +
            `間隔 500：${staggered.map((g) => g.x).join("/")}`,
        );
        await shot(page, "paste-chase");

        /*
         * 貼下去的位置要和框一致。
         *
         * 這一則**只**驗一致性（兩邊走同一份 `planPaste`），不驗「錯開得對不對」
         * ——相位算錯的話兩邊會一起錯，這則照樣會過。絕對值由上面那則與
         * `clipboard.test.js` 守著。名字要講清楚它驗的是什麼，否則之後有人
         * 會以為相位有兩層保護。
         */
        await page.mouse.click(...mid);
        await page.waitForTimeout(600);
        const landed = await litByRow();
        const near = (row, x) =>
          landed.some((b) => b.row === row && Math.abs(b.x - x) <= 4);

        record(
          "貼下去的位置和預覽的框一致（含相位）",
          staggered.length === 2 &&
            near(0, staggered[0].x) &&
            near(1, staggered[1].x),
          `預覽 ${staggered.map((g) => g.x).join("/")}，` +
            `實際 ${landed.filter((b) => b.row <= 1).map((b) => `${b.row}:${b.x}`).join(" ")}`,
        );
      } else {
        record("設了跑馬燈間隔之後，預覽的框逐條錯開", false, "找不到間隔欄位");
      }
    } else {
      record("複製模式下滑鼠移到哪，落點的框就畫在哪", false, "第 1 軌沒有色塊");
    }
  } else {
    record("框選一次選到跨軌的多個色塊", false, `只有 ${rows.length} 條軌`);
  }

  /*
   * ── 對齊與分佈 ──────────────────────────────────────
   *
   * 用拖曳做得到但**做不準**：拖曳吃 50ms 網格，肉眼對齊三條軌的起點要一條
   * 一條放大再微調。這裡驗的是「選單接上去了、而且真的把起點對齊」。
   *
   * 幾何運算有單元測試（`utils/segments/__tests__/arrange.test.js`），
   * 所以這裡只要一條端到端的路徑。
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /*
   * 前面的項目已經在時間軸上留了一堆色塊，所以先把要用的那段清空——不然
   * 「框到三塊」這個前提根本不成立（實測框到 7 塊）。
   */
  const clearFrom = rows[0].left + rows[0].width * 0.72;
  const clearTo = rows[0].left + rows[0].width * 0.98;
  await page.mouse.move(clearFrom, rows[0].top + 8);
  await page.mouse.down();
  await page.mouse.move(clearTo, rows[2].bottom - 8, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(400);

  // 三條軌上各放一個色塊，刻意放在**不同**的時間
  for (const [dancer, at] of [
    [0, 0.78],
    [1, 0.82],
    [2, 0.86],
  ]) {
    await clickRulerAt(at);
    await page.waitForTimeout(150);
    await clickArmorPart(page, dancer, 0);
    await page.waitForTimeout(350);
  }

  // 框住那三塊
  await page.mouse.move(clearFrom + 4, rows[0].top + 8);
  await page.mouse.down();
  await page.mouse.move(clearTo - 4, rows[2].bottom - 8, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  // `litByRow` 住在框選那一段的 if 區塊裡，這裡自己量一份（同一個查法）
  const litIn = async (from, to) =>
    (
      await page.evaluate(() =>
        [...document.querySelectorAll(".timeline-block[data-segment-id]")]
          .filter((el) =>
            /rgba?\((?!\s*0,\s*0,\s*0)/.test(el.style.background || ""),
          )
          .map((el) => {
            const r = el.getBoundingClientRect();
            const row = el.closest(".timeline[data-row-index]");
            return {
              row: Number(row?.dataset.rowIndex ?? -1),
              x: Math.round(r.x),
            };
          }),
      )
    )
      .filter((b) => b.x >= from && b.x <= to)
      .sort((a, b) => a.row - b.row);

  const window0 = clearFrom;
  const window1 = clearTo;
  const beforeAlign = await litIn(window0, window1);
  const spread = (list) =>
    list.length ? Math.max(...list.map((b) => b.x)) - Math.min(...list.map((b) => b.x)) : -1;

  if (beforeAlign.length === 3 && spread(beforeAlign) > 5) {
    await page.locator(".effect-button").click();
    await page.waitForTimeout(200);
    await page.locator("[data-testid='arrange-align']").click();
    await page.waitForTimeout(500);

    const after = await litIn(window0, window1);
    record(
      "起點對齊：三條軌上參差的色塊被拉到同一個起點",
      after.length === 3 && spread(after) <= 2,
      `對齊前 x = ${beforeAlign.map((b) => b.x).join("/")}（差 ${spread(beforeAlign)}px）→ ` +
        `對齊後 ${after.map((b) => b.x).join("/")}（差 ${spread(after)}px）`,
    );
    await shot(page, "arrange-align");
  } else {
    record(
      "起點對齊：三條軌上參差的色塊被拉到同一個起點",
      false,
      `框到 ${beforeAlign.length} 塊、原本相差 ${spread(beforeAlign)}px`,
    );
  }

  /*
   * ── 縮放的手感 ──────────────────────────────────────
   *
   * 兩個症狀同一個根因：控制項是線性的，而縮放是幾何的。
   *
   * 舊版 `+` 每次加 0.05，從 1 倍走到 100 倍要按 1980 次；滑桿是線性
   * 1..100 再套一個 `Math.floor`，低倍率那一端一個像素就從 1 倍跳到 2 倍。
   * 換算本身有單元測試（`utils/__tests__/zoom.test.js`），這裡驗的是
   * 「接上去的按鈕與滑桿真的走那套換算」。
   */
  const zoomText = () =>
    page.locator(".zoom-value").innerText().then((t) => t.trim());

  const zoomSlider = page.locator(".zoom-slider");
  const plus = page.locator(".zoom-controls button", { hasText: "+" });

  const zoomStart = await zoomText();
  await plus.click();
  await page.waitForTimeout(150);
  const zoomAfterOne = await zoomText();

  record(
    "按一次放大就看得出變化（不是 +0.05）",
    zoomStart === "1.0×" && zoomAfterOne === "1.3×",
    `${zoomStart} → ${zoomAfterOne}`,
  );

  // 連按到底要幾次——舊版是 1980 次
  let clicks = 1;
  while (clicks < 40 && (await zoomText()) !== "100×") {
    await plus.click();
    clicks++;
  }
  record(
    "連按 + 在 25 次以內到達上限",
    (await zoomText()) === "100×" && clicks <= 25,
    `${clicks} 次到 ${await zoomText()}`,
  );

  // 滑桿：拖到中間應該是幾何中點（10 倍），不是算術中點（50 倍）
  await zoomSlider.fill("0.5");
  await page.waitForTimeout(150);
  record(
    "滑桿拖到一半是 10 倍（幾何中點），不是 50 倍",
    (await zoomText()) === "10×",
    await zoomText(),
  );

  // 低倍率那一端拖得動：舊版在這裡是 1 倍直接跳 2 倍
  await zoomSlider.fill("0.02");
  await page.waitForTimeout(150);
  const lowEnd = await zoomText();
  record(
    "低倍率那一端拖得到中間值（不是 1 倍直接跳 2 倍）",
    lowEnd !== "1.0×" && lowEnd !== "2.0×",
    lowEnd,
  );

  /*
   * ── 播放時跟著紅線捲動 ──────────────────────────────
   *
   * 舊版的捲動 effect 讀了 currentTime，但相依陣列裡沒有它，所以只在縮放的
   * 那一瞬間置中一次。1 倍率下看不出來（整場都在畫面上），放大之後紅線幾秒
   * 就跑出視窗——而那正是使用者在對拍的時候。
   *
   * 換算本身有單元測試（utils/audio/__tests__/follow.test.js），這裡驗的是
   * 接線：rAF 迴圈真的有捲、而且使用者自己捲走之後真的會放手。
   */
  const scroller = page.locator(".scroll-container");
  const scrollLeft = () => scroller.evaluate((el) => el.scrollLeft);

  /*
   * ⚠️ **先把播放頭放好，再放大。**
   *
   * `clickRulerAt` 是按「刻度尺這個元素的寬度乘上比例」算座標的，而
   * `page.mouse.click` 收的是**視窗座標**——放大之後刻度尺比視窗寬得多，
   * 那個座標早就不在畫面上了，點下去會落在完全不相干的時間（實測會把播放頭
   * 丟到歌尾，於是後面「點道具燈放色」那一項在歌曲長度外面插色塊，燈是黑的
   * 而看起來像放色壞了）。
   */
  await zoomSlider.fill("0");
  await page.waitForTimeout(200);
  await clickRulerAt(0.1); // 1 倍率下才對得準，約第 3 秒
  await zoomSlider.fill("0.5"); // 再放大到 10 倍，整場放不進一個畫面
  await page.waitForTimeout(200);

  const beforePlay = await scrollLeft();
  await page.locator(".play-button").click();
  await page.waitForTimeout(2500);
  const whilePlaying = await scrollLeft();

  record(
    "播放時時間軸會跟著紅線捲動",
    whilePlaying > beforePlay,
    `scrollLeft ${beforePlay} → ${whilePlaying}`,
  );

  /*
   * 使用者自己捲走之後就不要再跟。
   *
   * 這一項和上一項是**互相對立**的：一直置中的實作會通過上面那一項卻在這裡
   * 失敗，而完全不跟的實作反過來。兩項一起才描述得出正確行為。
   */
  await scroller.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(1200);
  const afterUserScroll = await scrollLeft();

  record(
    "使用者自己捲走之後不會被扯回去",
    afterUserScroll < 400,
    `scrollLeft ${afterUserScroll}（期望停在 0 附近）`,
  );

  // 再按一次播放要恢復跟隨
  await page.locator(".play-button").click(); // 暫停
  await page.waitForTimeout(200);
  await page.locator(".play-button").click(); // 再播
  await page.waitForTimeout(2000);
  const afterReplay = await scrollLeft();

  record(
    "重新按播放會恢復跟隨",
    afterReplay > afterUserScroll,
    `scrollLeft ${afterUserScroll} → ${afterReplay}`,
  );

  await page.locator(".play-button").click(); // 收尾：停下來
  await page.waitForTimeout(200);
  await zoomSlider.fill("0");
  await page.waitForTimeout(200);
  // 播放頭留在歌曲前段，後面的項目才有地方放色塊
  await clickRulerAt(0.1);

  /*
   * ── 舞者的隱藏與恢復 ────────────────────────────────
   *
   * 舊版是光衣下面另一整列 50px 的開關，佔掉約 66px 而且平常不會用到。
   * 現在「隱藏」在卡片自己的標題列上，「叫回來」只在真的有人被隱藏時才出現。
   *
   * ⚠️ 恢復的入口一定要在卡片外面——放在卡片上的話，卡片一隱藏那個按鈕就
   * 跟著消失，使用者再也叫不回來（軌道的眼睛按鈕當初就是這樣被移除的）。
   */
  const armorCount = () =>
    page.locator(".armor-container").count();

  const beforeHide = await armorCount();
  record(
    "全部顯示時不佔任何空間（沒有那條提示列）",
    (await page.locator("[data-testid='hidden-dancers']").count()) === 0,
    `${beforeHide} 位舞者`,
  );

  /*
   * 不加 `force`：這裡要驗的正是「它真的點得到」。
   *
   * 父層 `.dancer-label` 是 `pointer-events: none`（讓點擊穿過去選這位舞者），
   * 那會一併關掉裡面所有東西的命中判定——按鈕畫得出來、hover 也看得到，
   * 就是點不到。第一版就是這樣紅的，`elementFromPoint` 在按鈕正中央回傳的是
   * `.armor-container`。
   */
  await page.locator(".armor-container").first().hover(); // × 平常是透明的
  await page.waitForTimeout(200);
  await page.locator("[data-testid='dancer-hide-0']").click();
  await page.waitForTimeout(400);

  record(
    "點卡片上的 × 就收起那位舞者",
    (await armorCount()) === beforeHide - 1,
    `${beforeHide} → ${await armorCount()}`,
  );

  const restore = page.locator("[data-testid='hidden-dancers'] .hidden-dancers__chip");
  record(
    "有人被隱藏時才出現恢復的入口，而且在卡片外面",
    (await restore.count()) === 1,
    `${await restore.count()} 個恢復按鈕`,
  );

  await restore.first().click();
  await page.waitForTimeout(400);
  record(
    "按編號就把那位叫回來",
    (await armorCount()) === beforeHide &&
      (await page.locator("[data-testid='hidden-dancers']").count()) === 0,
    `${await armorCount()} 位舞者`,
  );
  await shot(page, "dancer-hide");

  // ── 道具就掛在人旁邊 ──────────────────────────────────
  //
  // 飾品燈原本在右側一個獨立側欄裡，離所屬的舞者好幾百像素遠——播放時看不出
  // 「這位舞者的刀亮了」。現在它們和光衣同卡片並排，顏色一樣跟著播放頭走。
  //
  // 舞者 2（index 1）帶雨傘，舞者 1 沒有配件。
  const propCounts = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".armor-container")].map(
        (el) => el.querySelectorAll(".armor-props__led").length,
      ),
    );

  const props = await propCounts();
  record(
    "只有帶道具的舞者旁邊才有道具燈",
    props[0] === 0 && props[1] === 2 && props[3] === 8,
    props.join(" / "),
  );

  const propLed = page.locator(".armor-container").nth(1).locator(".armor-props__led").first();
  if (await propLed.count()) {
    await propLed.click();
    await page.waitForTimeout(500);

    const lit = await propLed.evaluate((el) => el.style.background);
    record(
      "點道具燈就能放色，顏色跟著亮",
      !/rgba?\(\s*0,\s*0,\s*0/.test(lit) && lit !== "",
      lit || "沒有顏色",
    );
    await shot(page, "props");
  } else {
    record("點道具燈就能放色，顏色跟著亮", false, "找不到道具燈");
  }

  // ── 調色盤 ────────────────────────────────────────────
  //
  // 三件事在 jsdom 上驗不到又特別容易壞：
  //
  //   1. 點最愛色的**預設行為**。舊版預設是「覆蓋」——點一格存好的顏色會把它
  //      蓋成目前的顏色，而切換開關長得像一支連續值的滑桿，沒人會發現。
  //      這一項是回歸測試：預設必須是「拿出來用」。
  //   2. 空格能不能一點就存。空的格子沒有東西可以拿出來用，所以不管在哪個
  //      模式都是存——這是新使用者第一次存色的路徑。
  //   3. 最近使用有沒有自動記。它由 reducer 在 UPDATECHOSENCOLOR 裡維護，
  //      而選色的入口有五個（調色器 / HEX / 最愛 / 時間軸取色 / 亮度滑桿），
  //      改壞的話畫面上只是「那一排一直是空的」，不會有錯誤。
  const swatchColors = (section) =>
    page.evaluate((index) => {
      const row = document.querySelectorAll(".palette-section")[index];
      return [...(row?.querySelectorAll(".swatch") ?? [])].map(
        (el) => getComputedStyle(el).backgroundColor,
      );
    }, section);

  const RECENT = 0;
  const FAVORITE = 1;

  // 前面已經放過幾次色（放色、道具燈），最近使用應該記下來了
  const recents = await swatchColors(RECENT);
  record(
    "最近使用會自動記下用過的顏色",
    recents.some((bg) => !isGap(bg)),
    `${recents.filter((bg) => !isGap(bg)).length} / ${recents.length} 格有顏色`,
  );

  // 空格點一下就存進目前的顏色
  const favSlot = page.locator(".palette-section").nth(FAVORITE).locator(".swatch");
  await favSlot.first().click();
  await page.waitForTimeout(300);
  const saved = (await swatchColors(FAVORITE))[0];
  record("點空的最愛格就存入目前顏色", !isGap(saved), saved || "還是空的");

  /*
   * 存好之後再點一次：預設模式下必須是「拿出來用」，不能把它蓋掉。
   * 先把目前顏色換成別的（拉亮度滑桿到 50%），再點那一格——
   * 若行為錯誤變成覆蓋，色票會變成 50% 亮度的那個顏色。
   */
  await page.locator(".alpha-slider").fill("0.5");
  await page.waitForTimeout(300);
  await favSlot.first().click();
  await page.waitForTimeout(300);
  const afterUse = (await swatchColors(FAVORITE))[0];
  record(
    "預設點最愛色是拿出來用，不會蓋掉它",
    afterUse === saved,
    `${saved} → ${afterUse}`,
  );

  /*
   * 切到「存色」之後才會覆蓋。
   *
   * 上一步點過「使用」，所以目前顏色已經**等於**那一格存的顏色（連亮度一起
   * 拿出來——存起來的是完整的顏色，不是只有色相）。這時直接存回去看不出差別，
   * 得先把顏色換掉。
   */
  await page.locator(".alpha-slider").fill("0.9");
  await page.waitForTimeout(300);
  await page.locator(".mode-switch__option").nth(1).click();
  await page.waitForTimeout(200);
  await favSlot.first().click();
  await page.waitForTimeout(300);
  const afterSave = (await swatchColors(FAVORITE))[0];
  record("切到存色模式才會覆蓋", afterSave !== saved, `${saved} → ${afterSave}`);
  await shot(page, "palette");

  // 切回「使用」，免得影響後面的檢查
  await page.locator(".mode-switch__option").first().click();
  await page.waitForTimeout(200);

  // ── 工作集 ────────────────────────────────────────────
  //
  // 切換工作集要真的換掉軌道清單，而且**存得住**——這一項最容易壞的地方是
  // 遷移：舊的 persist 資料裡只有 showPart，載入時要收成「未命名」那一組。
  const trackCount = () =>
    page.evaluate(
      () => document.querySelectorAll(".timeline-settings-block").length,
    );
  const chipNames = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".workset-chip")].map((el) =>
        el.textContent.replace(/\d+$/, "").trim(),
      ),
    );

  const beforeChips = await chipNames();
  record(
    "工作集列出現，舊資料收成一組",
    beforeChips.length >= 1,
    beforeChips.join(" / ") || "沒有任何工作集",
  );

  const tracksBefore = await trackCount();

  // 新增一組（會複製目前這一組），然後從新的那組刪掉一條軌。
  // 命名的 prompt 由檔案開頭的全域 dialog handler 接受（回傳空字串），
  // 所以新組會拿到自動產生的名字——這裡不驗名字，驗的是切換行為。
  await page.click(".workset-bar__action");
  await page.waitForTimeout(500);

  const afterAdd = await chipNames();
  const activeName = await page.evaluate(
    () => document.querySelector(".workset-chip.is-current")?.textContent ?? "",
  );
  record(
    "新增工作集並自動切換過去",
    afterAdd.length === beforeChips.length + 1 &&
      !activeName.includes(beforeChips[0]),
    `${afterAdd.join(" / ")}（目前：${activeName.trim()}）`,
  );

  await page.click(".timeline-settings-block .delete-timeline-button");
  await page.waitForTimeout(400);
  const tracksInNew = await trackCount();

  // 切回原本那一組，軌道數要回到原本的
  await page.click(".workset-chip");
  await page.waitForTimeout(400);
  const tracksBack = await trackCount();

  record(
    "切換工作集會換掉軌道清單",
    tracksInNew === tracksBefore - 1 && tracksBack === tracksBefore,
    `原本 ${tracksBefore} → 新組 ${tracksInNew} → 切回 ${tracksBack}`,
  );
  await shot(page, "worksets");

  // ── 行高 ──────────────────────────────────────────────
  //
  // 左邊的軌名欄與右邊的時間軸吃同一個數字，所以**兩邊要一起變**。
  // 舊版兩欄各自算自己的百分比，容器高度只要有一點差就會逐漸對不齊——
  // 捲到下面時軌名對到的是隔壁那條軌，而畫面上看起來完全正常。
  const rowHeights = () =>
    page.evaluate(() => {
      const label = document.querySelector(".timeline-settings-block");
      const track = document.querySelector(".timeline");
      return {
        label: label ? Math.round(label.getBoundingClientRect().height) : 0,
        track: track ? Math.round(track.getBoundingClientRect().height) : 0,
      };
    });

  const tall = await rowHeights();
  await page.fill("#row-height", "40");
  await page.dispatchEvent("#row-height", "input");
  await page.waitForTimeout(500);
  const short = await rowHeights();

  record(
    "行高滑桿讓兩欄一起變矮",
    short.label < tall.label && short.track < tall.track,
    `${tall.label}px → ${short.label}px`,
  );
  record(
    "軌名欄與時間軸的行高一致",
    Math.abs(short.label - short.track) <= 2,
    `軌名 ${short.label}px vs 時間軸 ${short.track}px`,
  );

  // 矮到放不下時次要按鈕要收起來，否則會變成畫得出來但點不到的裝飾
  const compactHidden = await page.evaluate(() => {
    const stack = document.querySelector(
      ".timeline-settings-block .move-timeline-buttons",
    );
    return !stack || getComputedStyle(stack).display === "none";
  });
  record("行高過矮時收起上下移按鈕", compactHidden);

  await shot(page, "row-height");
  await page.fill("#row-height", "120");
  await page.dispatchEvent("#row-height", "input");
  await page.waitForTimeout(400);

  // 逐軌把手：拖曳過程只改自己的 DOM、放開才進 redux，所以只有真瀏覽器驗得到
  const gripBox = await page.locator(".track-height-grip").first().boundingBox();
  if (gripBox) {
    const heightsOf = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".timeline-settings-block")].map((el) =>
          Math.round(el.getBoundingClientRect().height),
        ),
      );

    const beforeGrip = await heightsOf();
    await page.mouse.move(gripBox.x + 4, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gripBox.x + 4, gripBox.y + gripBox.height / 2 + 60, {
      steps: 6,
    });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const afterGrip = await heightsOf();

    record(
      "拖把手只調整那一條軌道的高度",
      afterGrip[0] > beforeGrip[0] + 20 &&
        afterGrip.slice(1).every((h, i) => h === beforeGrip[i + 1]),
      `${beforeGrip.join("/")} → ${afterGrip.join("/")}`,
    );
  } else {
    record("拖把手只調整那一條軌道的高度", false, "找不到把手");
  }

  // ── 播放清單（多曲銜接）────────────────────────────────
  // 一場表演是五、六首歌接續播放。這一段驗的是「加一首歌，整場真的變長」——
  // duration 是波形、刻度尺、色塊位置換算的共同分母，它沒跟著長的話畫面上
  // 每一項都會安靜地錯位。
  {
    /*
     * 從畫面上的 `m:ss:mmm` 讀總長，不去翻 redux。
     *
     * 使用者看到的就是這個數字，而它同時是波形與刻度尺的分母——讀它等於一次
     * 驗到「資料對了」與「畫面上真的更新了」兩件事。
     */
    const durationOf = async () => {
      const text = await page.locator(".duration-box").first().innerText();
      const [m, s, ms] = text.trim().split(":").map(Number);
      return m * 60000 + s * 1000 + ms;
    };

    const toggle = page.locator("[data-testid='playlist-toggle']");
    const panelBefore = await page.locator("[data-testid='playlist-panel']").count();
    await toggle.click();
    await page.waitForTimeout(300);
    const panelAfter = await page.locator("[data-testid='playlist-panel']").count();

    record(
      "播放清單收起時不佔版面，展開才是完整歌單",
      panelBefore === 0 && panelAfter === 1,
      `收起 ${panelBefore} / 展開 ${panelAfter}`,
    );

    const oneSong = await durationOf();

    // 加第二首（stub 回同一個音檔，所以總長應該剛好變兩倍）
    await page.selectOption("[data-testid='playlist-panel'] select", {
      index: 1,
    });
    await page.click("[data-testid='playlist-panel'] .playlist-add button");
    await page.waitForTimeout(1500);

    const twoSongs = await durationOf();
    const rows = await page.locator(".playlist-item").count();

    record(
      "加一首歌之後整場變長",
      rows === 2 && twoSongs > oneSong * 1.8,
      `${rows} 首・${Math.round(oneSong)}ms → ${Math.round(twoSongs)}ms`,
    );

    const markers = await page.locator(".clip-marker").count();
    record(
      "時間軸上看得到接縫在哪",
      markers === 1, // 第一首的起點是 0，和刻度尺重疊，所以只畫第二首起
      `${markers} 個標記`,
    );

    // 接縫重疊：往前疊之後整場會變短，而且短掉的正好是重疊那一段
    /*
     * ⚠️ 這裡一定要用 `fill()`。直接寫 `el.value = ...` 再補一個 change 事件
     * 是**沒有用的**——React 會攔截 value 的 setter 來追蹤受控元件，繞過它設值
     * 之後 React 認為值沒變，onChange 不會跑。而畫面上滑桿的把手確實移動了，
     * 所以這種寫法會變成「看起來有動、其實什麼都沒發生」的假測試。
     */
    const seam = page.locator("#playlist-overlap");
    await seam.fill("2000");
    await page.waitForTimeout(1200);
    const overlapped = await durationOf();

    record(
      "調接縫重疊之後整場跟著變短",
      Math.abs(twoSongs - overlapped - 2000) < 200,
      `${Math.round(twoSongs)}ms → ${Math.round(overlapped)}ms（少了 ${Math.round(twoSongs - overlapped)}ms）`,
    );

    await shot(page, "playlist");

    // 移除第二首，回到單曲——後面的 Output 與 /edit 兩項不受影響
    await page.click(".playlist-item:nth-child(2) .ld-btn--danger");
    await page.waitForTimeout(1200);
    const backToOne = await durationOf();

    record(
      "移除之後整場長度縮回去",
      (await page.locator(".playlist-item").count()) === 1 &&
        Math.abs(backToOne - oneSong) < 200,
      `${Math.round(overlapped)}ms → ${Math.round(backToOne)}ms`,
    );

    /*
     * 移除**最後一首**是自己的一個邊界，不是「再移除一次」而已。
     *
     * `music_filename` 是清單的投影，而空清單的投影是空字串。先前那裡保留了
     * 舊檔名，於是讀取端把「沒有 clip 但有 music_filename」判定成還沒遷移的
     * 舊單曲專案，幫忙生一個 clip 回來——**按下移除，那首歌自己長回來**。
     * 只移除到剩一首的測試完全看不到這件事。
     */
    await page.click(".playlist-item:nth-child(1) .ld-btn--danger");
    await page.waitForTimeout(1200);

    record(
      "移除最後一首之後它不會自己長回來",
      (await page.locator(".playlist-item").count()) === 0 &&
        (await durationOf()) === 0,
      `${await page.locator(".playlist-item").count()} 首・${await durationOf()}ms`,
    );

    // 加回來，後面的 Output 與 /edit 兩項才有音樂可用
    const fetchesBeforeReadd = musicFetches.length;
    await page.selectOption("[data-testid='playlist-panel'] select", { index: 0 });
    await page.click("[data-testid='playlist-panel'] .playlist-add button");
    await page.waitForTimeout(1500);

    record(
      "加回來之後時間軸恢復",
      Math.abs((await durationOf()) - oneSong) < 200,
      `${Math.round(await durationOf())}ms`,
    );

    /*
     * 移除之後解碼結果要被丟掉，所以加回來時**必須重新抓一次**。
     *
     * 這是「有沒有回收」唯一乾淨的觀察點：記憶體本身在測試裡量不準，但
     * 「還在快取裡就不會重抓」是確定的行為。沒回收的話這裡是 0 次。
     */
    /*
     * 移除之後解碼結果要被丟掉，所以**同一首歌**加回來時必須重新抓一次。
     *
     * ⚠️ 這裡一定要比對**同一個檔案**。第一版是拿「重新加入時有沒有抓」當
     * 判準，但那次加回來的是 `test.wav`，而先前載入的是 `2026_show.mp3`
     * ——它本來就沒被快取過，所以不管有沒有回收都會抓，那則測試等於沒驗到。
     * 破壞驗證（把 keepOnly 拿掉）照樣全綠才發現的。
     */
    const readded = musicFetches.at(-1);
    await page.click(".playlist-item:nth-child(1) .ld-btn--danger");
    await page.waitForTimeout(1000);

    const beforeSecondAdd = musicFetches.filter((u) => u === readded).length;
    await page.selectOption("[data-testid='playlist-panel'] select", { index: 0 });
    await page.click("[data-testid='playlist-panel'] .playlist-add button");
    await page.waitForTimeout(1500);
    const afterSecondAdd = musicFetches.filter((u) => u === readded).length;

    record(
      "移除的歌會連解碼結果一起丟掉（同一首加回來要重抓）",
      afterSecondAdd > beforeSecondAdd,
      `同一個檔案抓取次數 ${beforeSecondAdd} → ${afterSecondAdd}`,
    );

    /*
     * 節拍格線。30 秒、120 BPM、四拍一小節 → 每 2 秒一條小節線。
     *
     * 格線是墊在色塊底下的參考線，所以要驗三件事：畫得出來、小節線的數量對得上
     * 速度、而且**不吃滑鼠事件**（攔到的話色塊就拖不動了）。
     */
    const bars = await page.locator(".beat-line.is-bar").count();
    const lines = await page.locator(".beat-line").count();

    /*
     * 30 秒、120 BPM、四拍一小節 → 每 2 秒一條小節線，含頭尾共 16 條；
     * 這個縮放程度畫得到半拍，所以總共 30000/250 + 1 = 121 條。
     *
     * 數量寫死是刻意的：先前 `beatLines` 的 key 沒帶 clipId，兩首歌在接縫
     * 同一毫秒各有一條線時 React 會**留下上一個狀態的節點**（實測多出 5 條、
     * 小節線多 2 條）。只檢查「有沒有線」的話這種錯誤完全看不出來。
     */
    record(
      "節拍格線畫得出來，小節線數量對得上速度",
      bars === 16 && lines === 121,
      `${lines} 條（期望 121），其中小節線 ${bars} 條（期望 16）`,
    );

    const gridEatsClicks = await page.evaluate(() => {
      const line = document.querySelector(".beat-line");
      if (!line) return true;
      const r = line.getBoundingClientRect();
      const top = document.elementFromPoint(r.left, r.top + r.height / 2);
      return top?.classList.contains("beat-line") ?? false;
    });
    record("格線不吃滑鼠事件（色塊還拖得動）", gridEatsClicks === false);

    await shot(page, "beat-grid");

    // 點面板外面要收起來：它蓋住前兩條軌道，忘記它開著的話那幾條點不到
    await page.mouse.click(900, 700);
    await page.waitForTimeout(300);
    record(
      "點面板外面就收起播放清單",
      (await page.locator("[data-testid='playlist-panel']").count()) === 0,
    );
  }

  // ── Output ────────────────────────────────────────────
  const outputBtn = page.locator("button.output-button");
  if (await outputBtn.count()) {
    await outputBtn.first().click();
    await page.waitForTimeout(2000);
    record("Output 觸發上傳", uploads.length > 0, `${uploads.length} 次請求`);
    await shot(page, "output");
  }

  // ── 原始表格編輯器（/edit）─────────────────────────────
  // 這頁在 Phase 5g 從 keyframe 整個改寫成 segment，而它沒有元件測試
  // （唯一的路由入口是網址列）。至少要確認它打得開、看得到資料、改得動。
  await page.goto(`${BASE}/edit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const rowCount = await page.locator(".edit-container tbody tr").count();
  record("/edit 列出目前部位的色塊", rowCount > 0, `${rowCount} 列`);

  if (rowCount > 0) {
    const startInput = page
      .locator(".edit-container tbody tr input[type='number']")
      .first();
    const before = Number(await startInput.inputValue());
    await startInput.fill(String(before + 500));
    await startInput.blur();
    await page.waitForTimeout(400);

    const after = Number(
      await page
        .locator(".edit-container tbody tr input[type='number']")
        .first()
        .inputValue(),
    );
    record(
      "/edit 改起始時間會寫回 store",
      after === before + 500,
      `${before} → ${after}`,
    );
    await shot(page, "edit-table");
  }

  /*
   * 每一條 lazy 路由都要真的打得開。
   *
   * `App.jsx` 把 `/`、`/dashboard`、`/model` 切成獨立 chunk 之後，載入失敗
   * （chunk 抓不到、模組沒有 default export）**不會在建置時被發現**——畫面
   * 只是一片空白加一則 console 錯誤。這幾頁先前沒有任何測試走過。
   */
  for (const [path, label] of [
    ["/", "Welcome"],
    ["/dashboard", "Dashboard"],
    ["/model", "3D 模型"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const rendered = await page.evaluate(
      () => document.getElementById("root")?.childElementCount ?? 0,
    );
    record(`lazy 路由 ${path} 打得開（${label}）`, rendered > 0, `${rendered} 個節點`);
  }

  writeFileSync(join(OUT, "console-errors.txt"), errors.join("\n") || "(無)");
  const unexpected = errors.filter(
    // Dashboard 那則是導航中斷造成的，音訊相關的是 headless 環境限制
    (e) =>
      !/音樂|Failed to load resource|autoplay|AudioContext|Fetch initial data/.test(
        e,
      ),
  );
  record(
    "沒有未預期的 console 錯誤",
    unexpected.length === 0,
    `${errors.length} 則`,
  );

  await browser.close();
  return results;
};

run()
  .then((r) => {
    const failed = r.filter((x) => !x.ok);
    console.log(`\n=== ${r.length - failed.length}/${r.length} 通過 ===`);
    if (failed.length)
      console.log("失敗：", failed.map((f) => f.name).join(" / "));
    process.exit(failed.length ? 1 : 0);
  })
  .catch((err) => {
    console.error("HARNESS ERROR:", err);
    process.exit(2);
  });
