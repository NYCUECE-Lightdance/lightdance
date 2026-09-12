/**
 * 合成邊界案例 fixtures — 用來鎖定 buildPlayers 的輸出行為。
 *
 * 每個 fixture 都針對一個已知的資料形狀陷阱。真實 production 資料的 fixture
 * 由隊員依 real/README.md 的步驟匯出後放進 real/ 目錄，兩者互補：
 * 合成案例保證邊界覆蓋，真實案例保證沒有漏掉現場才會出現的資料形狀。
 */

const PLAYER_COUNT = 7;
const PART_COUNT = 22;

const black = (time) => ({
  time,
  color: { R: 0, G: 0, B: 0, A: 1 },
  linear: 0,
});
const color = (time, R, G, B, A = 1, linear = 0) => ({
  time,
  color: { R, G, B, A },
  linear,
});

/** 產生 7×22 的空表（每個部位只有 time 0 的黑點），再套用 parts 覆寫 */
function makeTable(overrides = {}) {
  const table = Array.from({ length: PLAYER_COUNT }, () =>
    Array.from({ length: PART_COUNT }, () => [black(0)]),
  );
  for (const [armorIdx, parts] of Object.entries(overrides)) {
    for (const [partIdx, timeline] of Object.entries(parts)) {
      table[Number(armorIdx)][Number(partIdx)] = timeline;
    }
  }
  return table;
}

/** 把巢狀 array 轉成 object 容器（key "0".."21"），複製現況中 LoadData/sanitize 的寫法 */
function toObjectContainer(table) {
  const obj = {};
  table.forEach((parts, armorIdx) => {
    const partObj = {};
    parts.forEach((timeline, partIdx) => {
      partObj[String(partIdx)] = timeline;
    });
    obj[String(armorIdx)] = partObj;
  });
  return obj;
}

export const fixtures = [
  {
    name: "empty-table",
    description: "7×22 全空（只有 time 0 黑點）",
    actionTable: makeTable(),
  },
  {
    name: "single-color-block",
    description: "單一色塊：色 @1000 + 黑哨兵 @1990（離網格 10ms）",
    actionTable: makeTable({
      0: { 0: [black(0), color(1000, 255, 0, 0), black(1990)] },
    }),
  },
  {
    name: "fade-to-black-with-witness",
    description:
      "關鍵案例：漸變 @1000 → 黑哨兵 @1990，另一部位在 1500 貢獻中間取樣點，" +
      "使漸變內插分母 (990 vs 1000) 的差異在輸出中可見",
    actionTable: makeTable({
      0: {
        0: [black(0), color(1000, 255, 0, 0, 1, 1), black(1990)],
        1: [black(0), color(1500, 0, 255, 0)],
      },
    }),
  },
  {
    name: "short-fade-to-black",
    description:
      "短漸變（100ms）接離網格黑點：分母差異比例最大的情況，用來量測誤差上界",
    actionTable: makeTable({
      0: {
        0: [black(0), color(1000, 255, 255, 255, 1, 1), black(1090)],
        1: [black(0), color(1050, 0, 0, 255)],
      },
    }),
  },
  {
    name: "chained-linear",
    description: "鏈式漸變：連續三個 linear===1 的彩色關鍵格（色→色→色）",
    actionTable: makeTable({
      0: {
        0: [
          black(0),
          color(500, 255, 0, 0, 1, 1),
          color(1000, 0, 255, 0, 1, 1),
          color(1500, 0, 0, 255, 1, 1),
          black(1990),
        ],
      },
    }),
  },
  {
    name: "consecutive-blacks",
    description: "連續多個黑點（removeDuplicateBlackBlocks 想清掉的形狀）",
    actionTable: makeTable({
      0: {
        0: [
          black(0),
          black(500),
          black(1000),
          color(1500, 255, 0, 0),
          black(1990),
        ],
      },
    }),
  },
  {
    name: "duplicate-times",
    description: "同一時間兩個關鍵格（髒資料）",
    actionTable: makeTable({
      0: {
        0: [
          black(0),
          color(1000, 255, 0, 0),
          color(1000, 0, 255, 0),
          black(1990),
        ],
      },
    }),
  },
  {
    name: "keyframe-at-duration-edge",
    description: "最後一個關鍵格正好落在網格點上（非 -10ms 哨兵）",
    actionTable: makeTable({
      0: { 0: [black(0), color(1000, 255, 128, 64), black(2000)] },
    }),
  },
  {
    name: "blink-pairs",
    description: "applyBlinkEffect 產生的 (色, 黑@-10ms) 配對序列",
    actionTable: makeTable({
      0: {
        0: [
          black(0),
          color(1000, 255, 0, 0),
          black(1090),
          color(1100, 255, 0, 0),
          black(1190),
          color(1200, 255, 0, 0),
          black(1290),
        ],
      },
    }),
  },
  {
    name: "alpha-variants",
    description:
      "各種 alpha 值，鎖定 alpha7 = min(floor(A*128), 127) 的打包行為",
    actionTable: makeTable({
      0: {
        0: [black(0), color(500, 255, 0, 0, 0)],
        1: [black(0), color(500, 255, 0, 0, 0.1)],
        2: [black(0), color(500, 255, 0, 0, 0.5)],
        3: [black(0), color(500, 255, 0, 0, 0.99)],
        4: [black(0), color(500, 255, 0, 0, 1)],
      },
    }),
  },
  {
    name: "accessory-only",
    description: "只有飾品部位（14-21 = acc0-acc7）有資料",
    // 放在舞者 3（刀）身上：他的 14..21 八個部位全部都有燈。原本放舞者 0，
    // 而那位沒帶道具——那正是 `isPartAllowed` 現在會擋掉的資料，擺在這裡的話
    // 這個 fixture 就不再測得到飾品的編碼了（整排都被清成黑）
    actionTable: makeTable({
      3: {
        14: [black(0), color(1000, 255, 0, 0), black(1990)],
        15: [black(0), color(1000, 0, 255, 0), black(1990)],
        21: [black(0), color(1000, 0, 0, 255), black(1990)],
      },
    }),
  },
  {
    name: "object-keyed-container",
    description: '容器是 object（key "0".."21"）而非 array — 現況兩種寫法並存',
    actionTable: toObjectContainer(
      makeTable({
        0: {
          0: [black(0), color(1000, 255, 0, 0, 1, 1), black(1990)],
          1: [black(0), color(1500, 0, 255, 0)],
        },
      }),
    ),
  },
  {
    name: "missing-linear-field",
    description:
      "關鍵格完全沒有 linear 欄位 — 真實資料中佔 96%（54 萬筆中的 52 萬），" +
      "舊版編輯器寫入時不帶此欄位",
    actionTable: makeTable({
      0: {
        0: [
          { time: 0, color: { R: 0, G: 0, B: 0, A: 1 } },
          { time: 1000, color: { R: 255, G: 0, B: 0, A: 1 } },
          { time: 1990, color: { R: 0, G: 0, B: 0, A: 1 } },
        ],
      },
    }),
  },
  {
    name: "dirty-fractional-times",
    description:
      "非整數的關鍵格時間 — 真實資料中確實存在（如黑點落在 x.28798185940832ms），" +
      "來自未量化的播放位置操作",
    actionTable: makeTable({
      0: {
        0: [
          black(0),
          color(1000, 255, 0, 0),
          black(1023.28798185940832),
          color(2000, 0, 255, 0, 1, 1),
          black(2976.7119),
        ],
      },
    }),
  },
  {
    name: "off-grid-color-keyframe",
    description: "彩色關鍵格本身離網格（非 50ms 倍數）— 真實資料中有 40 筆",
    actionTable: makeTable({
      0: {
        0: [black(0), color(1017, 255, 128, 0), black(1990)],
        1: [black(0), color(1033, 0, 255, 128, 1, 1), black(2029)],
      },
    }),
  },
  {
    name: "multi-armor-mixed",
    description: "多位舞者、混合各種特徵（漸變、純色、飾品、不同時間軸）",
    actionTable: makeTable({
      0: {
        0: [black(0), color(1000, 255, 0, 0, 1, 1), black(1990)],
        5: [black(0), color(1250, 0, 128, 255, 0.5), black(2490)],
      },
      1: {
        0: [black(0), color(500, 0, 255, 0), black(990)],
        14: [black(0), color(750, 255, 255, 0, 0.75), black(1490)],
      },
      3: {
        13: [
          black(0),
          color(2000, 128, 128, 128, 1, 1),
          color(3000, 255, 255, 255),
          black(3990),
        ],
      },
      6: {
        // 舞者 6 是匕首，只有 14..18；原本寫 21，而那個部位他沒有
        18: [black(0), color(100, 1, 2, 3), black(150)],
      },
    }),
  },
  {
    name: "light-on-part-the-dancer-does-not-have",
    description:
      "資料落在舞者沒有的飾品部位（舞者 0 沒帶道具、舞者 6 只有 14-18）——" +
      "輸出必須把顏色清成黑，否則那盞不存在的燈會被寫進韌體資料",
    /*
     * 這種資料真的進得來：跨軌貼上的落點是 (舞者, 部位) 的座標差推出來的，
     * 把七位舞者的 acc3 一起複製再往下貼一格就會落在沒有那件道具的人身上。
     * 症狀是**沒有症狀**——上傳成功、清單正常、編輯器裡看得到色塊，只有演出
     * 當天那盞燈不會亮。這個 fixture 鎖住 buildPlayers 的最後一道防線。
     */
    actionTable: makeTable({
      0: {
        // 身體部位人人都有，這一條要原樣保留（證明把關沒有誤傷）
        0: [black(0), color(1000, 255, 0, 0), black(1990)],
        14: [black(0), color(1000, 255, 0, 0), black(1990)],
        21: [black(0), color(1000, 0, 0, 255), black(1990)],
      },
      6: {
        18: [black(0), color(1000, 0, 255, 0), black(1990)], // 合法：匕首的刀柄
        19: [black(0), color(1000, 0, 255, 0), black(1990)], // 不合法
      },
    }),
  },
];

export default fixtures;
