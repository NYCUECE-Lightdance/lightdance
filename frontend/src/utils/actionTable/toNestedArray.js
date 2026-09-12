import { PART_COUNT, PLAYER_COUNT } from "../../constants/parts.js";

/**
 * 把 actionTable 正規化成標準容器型別：**巢狀 array**。
 *
 * 為什麼需要這個：專案裡的 actionTable 長期同時存在兩種容器形狀——
 * Home.jsx 產出 array，而 LoadData / sanitizeActionTable / Armor / AccessoryPanel
 * 產出 key 為 "0".."21" 的 object。多數程式碼用 `[armor][part]` 存取，兩種都能跑，
 * 所以問題一直被掩蓋；但 `Array.isArray()` 判斷與 `.map()` 呼叫會因為「最後是誰寫入的」
 * 而有不同行為，是潛在的 bug 來源。
 *
 * 給 C++ 開發者的類比：等同於同一份資料有時是 `std::vector<T>`、有時是
 * `std::map<int, T>`，取值語法剛好都能用 `[i]`，但一旦拿去做型別相關的操作就會炸。
 *
 * 這裡統一為 array，並補齊缺漏的部位。實際的黑點/duration 正規化仍由
 * Home.jsx 的 normalizeActionTable 負責，本函式只管容器型別。
 *
 * @param {Array|Object} actionTable
 * @param {() => Array} makeDefaultTimeline - 缺漏部位的預設時間軸產生器
 * @returns {Array<Array<Array>>} actionTable[armorIndex][partIndex] = keyframes[]
 */
export function toNestedArray(actionTable, makeDefaultTimeline) {
  const armors = Array.isArray(actionTable)
    ? actionTable
    : Object.values(actionTable ?? {});

  const normalized = [];
  for (let armorIndex = 0; armorIndex < PLAYER_COUNT; armorIndex++) {
    const armor = armors[armorIndex] ?? {};
    const parts = [];
    for (let partIndex = 0; partIndex < PART_COUNT; partIndex++) {
      // array 與 object 都吃得到：JS 的 arr["0"] 等同 arr[0]
      parts[partIndex] = armor[partIndex] ?? makeDefaultTimeline();
    }
    normalized[armorIndex] = parts;
  }
  return normalized;
}

export default toNestedArray;
