/**
 * 從 mongodump 備份匯入測試 fixtures。
 *
 * 用途：把 production 光表（raw_json）與當時實際餵給韌體的輸出（color）轉成
 * golden 測試用的 fixture JSON。真實資料能涵蓋合成案例想不到的形狀
 * （缺 linear 欄位、非整數時間、舊版部位 schema 等）。
 *
 * 🔒 安全限制：
 *   1. 只讀取 raw_json.bson 與 color.bson。users.bson 含明文密碼，由
 *      ALLOWED_COLLECTIONS 白名單硬性排除，不可繞過。
 *   2. 匯出的 fixture **預設把帳號名稱匿名化**成 userA / userB / ...
 *      （fixture 會進公開 repo，帳號名稱是登入識別碼）。
 *      確定不需要時才加 --keep-usernames。
 *
 * 用法：
 *   # 列出備份中所有光表（含形狀統計，用來挑選）
 *   node scripts/import-mongo-fixtures.mjs --dump <mongodump目錄> --list
 *
 *   # 匯出指定光表成 fixture（可重複 --pick，key 用 --list 印出的值）
 *   node scripts/import-mongo-fixtures.mjs --dump <目錄> \
 *     --pick "<帳號>@<時間戳>" --name real-dirty-times
 *
 *   # 一併匯出當時的韌體輸出，供端到端測試比對
 *   node scripts/import-mongo-fixtures.mjs --dump <目錄> \
 *     --pick "<帳號>@<時間戳>" --name real-rich-show --with-color
 *
 * 匯出後記得跑：npm run test:update-golden && npm test
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { readDocuments } from "./lib/bson.mjs";

/** 🔒 只允許讀這兩個 collection——users.bson 含明文密碼，絕不可匯入 */
const ALLOWED_COLLECTIONS = ["raw_json", "color"];

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(
  here,
  "../src/utils/export/__tests__/fixtures/real",
);

function parseArgs(argv) {
  const args = { picks: [], names: [], withColor: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dump") args.dump = argv[++i];
    else if (flag === "--pick") args.picks.push(argv[++i]);
    else if (flag === "--name") args.names.push(argv[++i]);
    else if (flag === "--with-color") args.withColor = true;
    else if (flag === "--keep-usernames") args.keepUsernames = true;
    else if (flag === "--list") args.list = true;
  }
  return args;
}

/** 讀取指定 collection 的所有文件（經白名單檢查） */
function readCollection(dumpDir, collection) {
  if (!ALLOWED_COLLECTIONS.includes(collection)) {
    throw new Error(
      `拒絕讀取 ${collection}：只允許 ${ALLOWED_COLLECTIONS.join(" / ")}`,
    );
  }
  const path = join(dumpDir, `${collection}.bson`);
  if (!existsSync(path)) throw new Error(`找不到 ${path}`);

  const docs = [];
  readDocuments(readFileSync(path), { onDoc: (doc) => docs.push(doc) });
  return docs;
}

const docKey = (doc) => `${doc.user}@${doc.update_time}`;

/** 取出 actionTable：raw_data 的頂層可能直接就是 actionTable（舊格式無外殼） */
function extractActionTable(rawData) {
  const parsed = JSON.parse(rawData);
  return parsed.actionTable ?? parsed;
}

/** 統計 actionTable 的形狀，用來判斷這份資料值不值得收進 fixture */
function describeShape(actionTable) {
  const stats = {
    armors: Object.keys(actionTable).length,
    parts: 0,
    keyframes: 0,
    gradients: 0,
    missingLinear: 0,
    offGridBlacks: 0,
    fractionalTimes: 0,
  };

  for (const armor of Object.values(actionTable)) {
    stats.parts = Math.max(stats.parts, Object.keys(armor).length);
    for (const timeline of Object.values(armor)) {
      if (!Array.isArray(timeline)) continue;
      for (const keyframe of timeline) {
        if (!keyframe?.color) continue;
        stats.keyframes++;
        if (keyframe.linear === 1) stats.gradients++;
        if (!("linear" in keyframe)) stats.missingLinear++;
        if (!Number.isInteger(keyframe.time)) stats.fractionalTimes++;
        const isBlack =
          keyframe.color.R === 0 &&
          keyframe.color.G === 0 &&
          keyframe.color.B === 0;
        if (isBlack && keyframe.time % 50 !== 0) stats.offGridBlacks++;
      }
    }
  }

  return stats;
}

function listDocuments(dumpDir) {
  const rawDocs = readCollection(dumpDir, "raw_json");
  const colorKeys = new Set(readCollection(dumpDir, "color").map(docKey));

  console.log(
    "key".padEnd(38) +
      "KB".padStart(6) +
      "舞者".padStart(5) +
      "部位".padStart(5) +
      "關鍵格".padStart(8) +
      "漸變".padStart(6) +
      "缺linear".padStart(9) +
      "離網格黑".padStart(9) +
      "非整數".padStart(7) +
      "  配對",
  );

  for (const doc of rawDocs) {
    if (!doc.raw_data) continue;
    let shape;
    try {
      shape = describeShape(extractActionTable(doc.raw_data));
    } catch {
      continue;
    }
    console.log(
      docKey(doc).padEnd(38) +
        (doc.raw_data.length / 1024).toFixed(0).padStart(6) +
        String(shape.armors).padStart(5) +
        String(shape.parts).padStart(5) +
        String(shape.keyframes).padStart(8) +
        String(shape.gradients).padStart(6) +
        String(shape.missingLinear).padStart(9) +
        String(shape.offGridBlacks).padStart(9) +
        String(shape.fractionalTimes).padStart(7) +
        (colorKeys.has(docKey(doc)) ? "  ✓" : "  －"),
    );
  }
}

/**
 * 帳號匿名化：fixture 會進入公開 repo，而帳號名稱是登入識別碼；
 * 本專案目前又是密碼明文儲存（見 CLAUDE.md 安全章節），公開有效帳號等於
 * 替攻擊者省去猜帳號的步驟。時間戳保留（可追溯來源且不敏感）。
 */
function anonymizeKey(pick, anonymousUsers) {
  const [user, time] = pick.split("@");
  if (!anonymousUsers.has(user)) {
    anonymousUsers.set(
      user,
      `user${String.fromCharCode(65 + anonymousUsers.size)}`,
    );
  }
  return `${anonymousUsers.get(user)}@${time}`;
}

function exportFixtures({ dump, picks, names, withColor, keepUsernames }) {
  const rawDocs = new Map(
    readCollection(dump, "raw_json")
      .filter((doc) => doc.raw_data)
      .map((doc) => [docKey(doc), doc]),
  );
  const colorDocs = withColor
    ? new Map(readCollection(dump, "color").map((doc) => [docKey(doc), doc]))
    : new Map();

  const anonymousUsers = new Map();

  picks.forEach((pick, index) => {
    const doc = rawDocs.get(pick);
    if (!doc) throw new Error(`備份中找不到 ${pick}（可用 --list 查看）`);

    const name = names[index] ?? `real-${pick.replace(/[@:]/g, "-")}`;
    const sourceKey = keepUsernames ? pick : anonymizeKey(pick, anonymousUsers);
    const actionTable = extractActionTable(doc.raw_data);
    const shape = describeShape(actionTable);

    const fixture = {
      name,
      description:
        `真實 production 光表（${sourceKey}）：${shape.armors} 位舞者、${shape.parts} 部位、` +
        `${shape.keyframes} 關鍵格、${shape.gradients} 漸變、` +
        `${shape.missingLinear} 個缺 linear 欄位、${shape.offGridBlacks} 個離網格黑點、` +
        `${shape.fractionalTimes} 個非整數時間`,
      source: { collection: "raw_json", key: sourceKey },
      actionTable,
    };

    const target = join(fixturesDir, `${name}.json`);
    writeFileSync(target, JSON.stringify(fixture, null, 2) + "\n", "utf-8");
    console.log(`✅ ${name}.json  (${JSON.stringify(fixture).length} bytes)`);

    if (withColor) {
      const colorDoc = colorDocs.get(pick);
      if (!colorDoc) {
        console.log(`   ⚠️  ${pick} 在 color collection 中沒有對應文件，略過`);
        return;
      }
      const expected = {
        name,
        source: { collection: "color", key: sourceKey },
        note: "當時實際存進 mongo、餵給韌體的 players 輸出，供端到端測試比對",
        players: colorDoc.players,
      };
      const colorTarget = join(fixturesDir, `${name}.color.json`);
      writeFileSync(
        colorTarget,
        JSON.stringify(expected, null, 2) + "\n",
        "utf-8",
      );
      console.log(
        `✅ ${name}.color.json  (${JSON.stringify(expected).length} bytes)`,
      );
    }
  });
}

const args = parseArgs(process.argv.slice(2));

if (!args.dump) {
  console.error(
    "用法：node scripts/import-mongo-fixtures.mjs --dump <mongodump目錄> [--list | --pick user@time --name 名稱 [--with-color]]",
  );
  process.exit(1);
}

if (args.list) listDocuments(args.dump);
else if (args.picks.length) exportFixtures(args);
else {
  console.error("請指定 --list 或至少一個 --pick");
  process.exit(1);
}
