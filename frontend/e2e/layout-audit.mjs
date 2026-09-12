/**
 * 版面稽核：找出「點不到的控制項」與「溢出容器的元素」。
 *
 * 不靠肉眼看截圖，直接問瀏覽器兩個問題：
 *
 *   1. 每個可互動元素的中心點，`document.elementFromPoint()` 回傳的是不是它自己？
 *      不是 → 被別的東西蓋住了，使用者點不到。
 *   2. 每個元素的 bounding box 有沒有超出容器？超出 → 跑到別人的地盤上。
 *   3. 每則提示有沒有被祖先的 overflow 裁掉？被裁 → hover 之後什麼都不會出現。
 *   4. 該對齊的成對元素有沒有對上？（舞者開關 ↔ 光衣的中心、
 *      軌名列 ↔ 時間軸的每一列）
 *   5. 各塊的左右邊緣、以及下半部各排的內容左緣，在不在同一條線上？
 *
 * ## 為什麼需要這個
 *
 * 這個編輯器的版面大量使用 `position: absolute` + 寫死的像素座標
 * （`left: 370px` / `left: 584px` / `bottom: 20px`…）。那些數字是照著某一個
 * 視窗尺寸量出來的，換一個尺寸就開始互相重疊，而且**畫面上看起來還好好的**
 * ——被蓋住的按鈕仍然畫得出來，只是點下去沒反應。
 *
 * 第一次跑就抓到 9 處：Edit / Logout 被「尚未儲存」橫幅整個蓋住、音樂選單
 * 被擠到畫面外 x=-16 蓋住左側工具列、舞者開關浮在光衣上蓋掉 12 個部位…
 *
 * ## 執行
 *
 * ```bash
 * npm run dev              # 另一個終端機
 * npm run audit:layout
 * ```
 *
 * 兩種視窗尺寸各跑一次。有任何一項不通過就 exit 1。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchOptions, warmUp } from "./browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

/** 產生一段 30 秒 WAV，讓 waveform decode 得出 duration */
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
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), 44 + i * 2);
  return buf;
};
const WAV = makeWav();

const VIEWPORTS = [
  { name: "1600x950", width: 1600, height: 950 },
  { name: "1280x800", width: 1280, height: 800 },
];

/** 頁面內執行：回傳被蓋住的控制項與溢出容器的元素 */
const collectProblems = () => {
  const label = (el) => {
    if (!el) return "null";
    const cls = el.getAttribute?.("class");
    const id = el.id ? `#${el.id}` : "";
    const text = (el.textContent || "").trim().slice(0, 18);
    return `${el.tagName.toLowerCase()}${id}${cls ? "." + cls.split(" ")[0] : ""}${
      text ? `「${text}」` : ""
    }`;
  };

  /** 落在可捲動祖先的可視範圍外 → 捲一下就到得了，不算被蓋住 */
  const isScrolledOut = (el, rect) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) {
        const pr = p.getBoundingClientRect();
        return rect.bottom > pr.bottom + 1 || rect.top < pr.top - 1;
      }
    }
    return false;
  };

  // ── 1. 點不到的控制項 ──────────────────────────────
  const SELECTOR = [
    "button",
    "select",
    "input",
    "[role=button]",
    ".timeline-block",
    ".sidebar-dot",
    ".favorite_color_sample",
    // 光衣的部位也是可點的——放色就是點它們
    ".armor-container svg [fill]:not([fill='none'])",
  ].join(", ");

  const unclickable = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (parseFloat(cs.opacity) === 0) continue;
    if (
      r.bottom < 0 ||
      r.top > innerHeight ||
      r.right < 0 ||
      r.left > innerWidth
    )
      continue;
    if (isScrolledOut(el, r)) continue;

    const top = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    if (top && top !== el && !el.contains(top) && !top.contains(el)) {
      unclickable.push({ el: label(el), blocker: label(top) });
    }
  }

  // ── 2. 溢出容器 ────────────────────────────────────
  const CONTAINERS = [
    ".panel",
    ".people-container",
    ".control-panel",
    ".audio-player-container",
    ".palette",
  ];
  const overflow = [];
  for (const sel of CONTAINERS) {
    const box = document.querySelector(sel);
    if (!box) continue;
    if (getComputedStyle(box).overflow !== "visible") continue; // 有裁切就不會漏出去

    const br = box.getBoundingClientRect();
    for (const child of box.querySelectorAll("*")) {
      const cr = child.getBoundingClientRect();
      if (cr.width < 2 || cr.height < 2) continue;
      // hover 才顯示的提示（含它裡面的 <kbd>）浮在按鈕上方，溢出是設計上的
      if (child.closest(".tooltip")) continue;

      // 在可捲動容器裡的內容，超出是設計上的
      let inScroller = false;
      for (
        let p = child.parentElement;
        p && p !== box.parentElement;
        p = p.parentElement
      ) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) {
          inScroller = true;
          break;
        }
      }
      if (inScroller) continue;

      const over = {
        top: Math.round(br.top - cr.top),
        bottom: Math.round(cr.bottom - br.bottom),
        left: Math.round(br.left - cr.left),
        right: Math.round(cr.right - br.right),
      };
      if (Math.max(...Object.values(over)) > 2) {
        overflow.push({ container: sel, child: label(child), over });
      }
    }
  }

  // ── 3. 被裁掉的提示 ──────────────────────────────
  //
  // 提示浮在按鈕正上方，只要任何一層祖先有 overflow 就會被切掉——而且**畫面上
  // 完全看不出來**：hover 之後就是沒東西跑出來，不會有錯誤。實測抓到過 17 則
  // 提示有 12 則被 .controls 的 overflow 裁掉，剛好是最需要提示的工具列那批。
  const clippedTips = [];
  for (const tip of document.querySelectorAll(".tooltip")) {
    const host = tip.parentElement;
    if (!host) continue;
    const tr = tip.getBoundingClientRect();
    if (tr.width < 2 || tr.height < 2) continue;

    let reason = null;
    for (let a = host; a; a = a.parentElement) {
      if (getComputedStyle(a).overflow === "visible") continue;
      const ar = a.getBoundingClientRect();
      if (tr.top < ar.top - 0.5 || tr.bottom > ar.bottom + 0.5) {
        reason = `被 ${label(a)} 裁切`;
        break;
      }
    }
    if (!reason && (tr.left < 0 || tr.right > innerWidth || tr.top < 0)) {
      reason = "跑出畫面";
    }

    /*
     * 被折成多行也算壞掉。
     *
     * 提示的寬度應該由內容決定（`white-space: nowrap`），但 `.tooltip` 這個
     * 類別名稱 Bootstrap 也在用，而它比較晚載入——撞名的話 `white-space` 會被
     * 蓋成 `normal`，提示就照宿主的寬度折行：34px 的按鈕配 8 個字實測折成
     * 48×96 的一長條。它「有出現」，所以純粹的裁切檢查抓不到。
     *
     * 判斷方式是拿實際高度跟「一行該有多高」比，不寫死像素——字級或 padding
     * 之後改了這條檢查仍然成立。
     */
    if (!reason) {
      const cs = getComputedStyle(tip);
      const lineHeight =
        parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const chrome =
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth);
      if (tr.height > lineHeight + chrome + 2) {
        reason = `被折成多行（高 ${Math.round(tr.height)}px，一行應該是 ${Math.round(lineHeight + chrome)}px）`;
      }
    }
    if (reason) {
      clippedTips.push({ text: (tip.textContent || "").trim().slice(0, 20), reason });
    }
  }

  /*
   * 控制項的文字標籤被折行也算壞掉。
   *
   * 和提示的折行檢查同一個病因與同一套量法：一個兩三個字的標籤被擠成一個字
   * 一行（實測「每小節」在播放清單裡折成三行），畫面上它「有出現」，所以純粹
   * 看有沒有被裁切是抓不到的。
   *
   * 只看**短標籤**（不到 12 個字），長文字本來就該折行。
   */
  for (const label of document.querySelectorAll("label")) {
    const text = (label.textContent || "").trim();
    if (!text || text.length > 12) continue;

    const r = label.getBoundingClientRect();
    if (r.height < 2) continue;

    const cs = getComputedStyle(label);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    // 標籤裡常常包著輸入框，用它自己的內容高度當基準會誤判，
    // 所以拿「最高的子元素」與行高取大值
    const tallestChild = [...label.children].reduce(
      (max, el) => Math.max(max, el.getBoundingClientRect().height),
      0,
    );
    const oneLine = Math.max(lineHeight, tallestChild) + 4;

    if (r.height > oneLine) {
      clippedTips.push({
        text: text.slice(0, 20),
        reason: `標籤被折成多行（高 ${Math.round(r.height)}px，一行應該是 ${Math.round(oneLine)}px）`,
      });
    }
  }

  // ── 4. 該對齊卻沒對齊的成對元素 ────────────────────
  //
  // 「隱藏這位舞者」的按鈕必須**長在那位舞者的卡片裡**。
  //
  // 舊版是光衣下面另一整列的方形開關，靠位置對應「第 i 個開關 = 第 i 位舞者」
  // ——那條對應很脆弱，實測抓到過七個開關全擠在左側 40..462 而光衣攤在
  // 28..1222，舞者 7 的開關在 x=400、光衣在 x=1080，畫面上兩排都畫得好好的，
  // 只是對不起來。收進卡片之後對應是結構上保證的，這裡改成守「它真的在裡面」
  // ——有人把它改成 `position: absolute` 加寫死座標時就會被抓到（這個專案
  // 已經因為那個寫法修過好幾次版面）。
  const misaligned = [];
  const armorBoxes = [...document.querySelectorAll(".armor-container")];

  armorBoxes.forEach((armor, i) => {
    const hide = armor.querySelector(".dancer-hide");
    if (!hide) {
      misaligned.push({ pair: `舞者 ${i + 1} 的隱藏鈕`, delta: "找不到" });
      return;
    }
    const a = armor.getBoundingClientRect();
    const h = hide.getBoundingClientRect();
    if (
      h.left < a.left - 1 ||
      h.right > a.right + 1 ||
      h.top < a.top - 1 ||
      h.bottom > a.bottom + 1
    ) {
      misaligned.push({
        pair: `舞者 ${i + 1} 的隱藏鈕跑出卡片`,
        delta: `鈕 ${Math.round(h.left)}..${Math.round(h.right)} vs 卡片 ${Math.round(a.left)}..${Math.round(a.right)}`,
      });
    }
  });

  /*
   * 左側軌名列 ↔ 右側時間軸：**每一列都要落在同一條水平線上**。
   *
   * 這是這份稽核裡最難用肉眼確定的一項：兩邊各自看起來都很整齊，分隔線也
   * 都等距，但整欄可能一起偏移。實測左欄比右欄高 25px——右半邊上方有時間
   * 刻度尺佔掉一段高度，左欄沒有讓。捲到下面時軌名就對到隔壁那條軌，
   * 而使用者會以為自己在編第 5 軌，其實在編第 6 軌。
   *
   * 容許 2px：兩欄的容器各自帶邊框，整數像素捨入會差一格。
   */
  const labelRows = [...document.querySelectorAll(".timeline-settings-block")];
  const trackRows = [...document.querySelectorAll(".timeline")];

  if (labelRows.length && labelRows.length === trackRows.length) {
    labelRows.forEach((label, i) => {
      const delta = Math.round(
        label.getBoundingClientRect().top - trackRows[i].getBoundingClientRect().top,
      );
      if (Math.abs(delta) > 2) {
        misaligned.push({ pair: `第 ${i + 1} 軌的軌名列與時間軸`, delta });
      }
    });
  } else if (labelRows.length !== trackRows.length) {
    misaligned.push({
      pair: "軌名列數量與時間軸數量",
      delta: `${labelRows.length} vs ${trackRows.length}`,
    });
  }

  // ── 5. 上下兩塊的左右邊緣要在同一條線上 ────────────────
  //
  // 編輯器分成上下兩塊：上面是光表區（七套光衣 + 飾品 + 調色盤），下面是
  // 工具列 / 時間軸 / 波形。兩塊各自把欄寬寫在自己的 CSS 裡，於是右緣一個
  // 停在 1427、一個停在 1595——中間空出 168px 沒有東西的區域，看起來就是
  // 「上面那塊短了一截」。
  //
  // 這種問題肉眼很難確定（一邊是深灰面板、一邊是深灰畫布），但量起來一翻兩瞪眼。
  const edges = [];
  const edgeOf = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { sel, left: Math.round(r.left), right: Math.round(r.right) };
  };

  const bands = [
    edgeOf(".people-container"),
    edgeOf(".workset-bar"),
    edgeOf(".controls"),
    edgeOf(".scroll-container"),
    edgeOf(".waveform-container"),
  ].filter(Boolean);

  if (bands.length >= 2) {
    const reference = bands[0];
    for (const band of bands.slice(1)) {
      const delta = band.right - reference.right;
      if (Math.abs(delta) > 2) {
        edges.push({
          pair: `${band.sel} 的右緣 vs ${reference.sel}`,
          delta,
        });
      }
    }
  }

  /*
   * 下半部各排的**內容**左緣也要在同一條線上。
   *
   * 上面第 5 項比的是容器的右緣，抓不到這個：三排的容器都從 0 開始，
   * 但各自的內縮不同（實測工作集列 12、工具列 6、軌名列 1），於是畫面上
   * 三排的東西起頭處各差幾像素——窄視窗下特別明顯。
   */
  const rowStarts = [".workset-bar", ".leftupcorner"]
    .map((sel) => {
      const el = document.querySelector(sel)?.firstElementChild;
      if (!el) return null;
      return { sel, left: Math.round(el.getBoundingClientRect().left) };
    })
    .filter(Boolean);

  if (rowStarts.length >= 2) {
    const reference = rowStarts[0];
    for (const row of rowStarts.slice(1)) {
      const delta = row.left - reference.left;
      if (Math.abs(delta) > 2) {
        edges.push({
          pair: `${row.sel} 的內容左緣 vs ${reference.sel}`,
          delta,
        });
      }
    }
  }

  return { unclickable, overflow, clippedTips, misaligned, edges };
};

const stubApi = (context) =>
  context.route("**/api/**", (route) => {
    const url = route.request().url();
    const json = (b) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(b),
      });
    if (url.includes("/api/token")) return json({ access_token: "tester" });
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
    return json({});
  });

const run = async () => {
  // 先暖機：開發伺服器剛啟動時第一次載入 /home 要現場轉譯幾百個模組，
  // 會超過下面等待選擇器的時限。用獨立 browser 跑，不留任何狀態。
  {
    const warmBrowser = await chromium.launch(launchOptions());
    await warmUp(warmBrowser, BASE);
    await warmBrowser.close();
  }

  let failed = 0;

  // 每個視窗尺寸開一個全新的 browser。共用同一個 browser 時第二個 context
  // 會載入不了——兩個 context 各自解碼 30 秒 WAV、各開一個 AudioContext，
  // 在容器的記憶體限制下第二個就卡住。這跟版面無關，純粹是量測環境的問題。
  for (const vp of VIEWPORTS) {
    const browser = await chromium.launch(launchOptions());
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    await stubApi(context);
    const page = await context.newPage();
    const diag = [];
    page.on("pageerror", (e) => diag.push("PAGEERROR " + String(e).slice(0, 200)));
    page.on("console", (m) => m.type() === "error" && diag.push(m.text().slice(0, 200)));

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="text"]', "tester");
    await page.fill('input[type="password"]', "pw");
    // 標題與送出鈕的文字都是「登入」，指名按鈕而不是用文字比對
    await page.click("[data-testid='auth-submit']");
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    // /home 掛載時會檢查 redux 裡的 token，而 redux-persist 的寫入是非同步的。
    // 登入完立刻整頁載入 /home 有機會讀不到 token 而被彈回首頁——這是 app
    // 既有的競態（程式裡用 flushPersist 縮小了窗口，但沒有完全消除）。
    // 這裡先等一下再開，並保留重試。
    await page.waitForTimeout(2500);

    let opened = false;
    for (let i = 0; i < 8 && !opened; i++) {
      await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
      try {
        await page.waitForSelector(".timeline-container", { timeout: 25000 });
        opened = true;
      } catch {
        await page.waitForTimeout(1000); // 喘口氣再試
      }
    }
    if (!opened) {
      // 載入失敗時把當下的網址與 console 錯誤一起印出來——沒有這些資訊
      // 只會看到「載入不了」，分不出是程式壞了還是量測環境的問題
      console.log(`[${vp.name}] 編輯器載入不了 url=${page.url()}`);
      console.log("  診斷：", diag.slice(0, 5));
      failed++;
      await browser.close();
      continue;
    }
    await page.waitForTimeout(2500);

    /*
     * 把播放清單展開再量。
     *
     * 收合的東西不量等於沒量——它展開之後是一塊 320px 寬、貼在工具列下方的
     * 面板，正下方就是時間刻度尺與軌道。會不會蓋住下面的控制項、會不會被
     * `overflow` 裁掉，只有在展開的狀態下看得出來。
     */
    await page
      .locator("[data-testid='playlist-toggle']")
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    const { unclickable, overflow, clippedTips, misaligned, edges } =
      await page.evaluate(collectProblems);

    console.log(`\n===== ${vp.name} =====`);
    console.log(`點不到的控制項：${unclickable.length}`);
    unclickable.forEach((u) =>
      console.log(`  ✗ ${u.el}\n      ← 被 ${u.blocker} 蓋住`),
    );
    console.log(`溢出容器的元素：${overflow.length}`);
    overflow
      .slice(0, 8)
      .forEach((o) =>
        console.log(
          `  ✗ ${o.container} 內 ${o.child} 溢出 ${JSON.stringify(o.over)}`,
        ),
      );

    console.log(`被裁掉的提示：${clippedTips.length}`);
    clippedTips.forEach((t) => console.log(`  ✗ 「${t.text}」 ${t.reason}`));

    console.log(`沒對齊的成對元素：${misaligned.length}`);
    misaligned.forEach((m) => console.log(`  ✗ ${m.pair} 差 ${m.delta}px`));

    console.log(`沒對齊的邊緣：${edges.length}`);
    edges.forEach((e) => console.log(`  ✗ ${e.pair} 差 ${e.delta}px`));

    failed +=
      unclickable.length +
      overflow.length +
      clippedTips.length +
      misaligned.length +
      edges.length;

    await page.screenshot({ path: join(OUT, `layout-${vp.name}.png`) });
    await browser.close();
  }

  return failed;
};

run()
  .then((failed) => {
    console.log(
      failed === 0 ? "\n=== 版面稽核通過 ===" : `\n=== 共 ${failed} 個問題 ===`,
    );
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("AUDIT ERROR:", err);
    process.exit(2);
  });
