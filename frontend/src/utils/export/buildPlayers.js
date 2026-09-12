import { TICK_MS } from "../../constants/time.js";
import { PART_KEYS } from "../../constants/parts.js";
import { isPartAllowed } from "../../config/accessoryConfig.js";

/**
 * buildPlayers — 把編輯器的 actionTable 壓平成韌體吃的 PlayerData 陣列。
 *
 * 這段邏輯原本內嵌在 Home.jsx 的 handleOutput 內（2026-08-08 原樣抽出成純函式，
 * 以便被 golden 測試鎖定）。**輸出是韌體契約**：欄位順序 (hat..acc7)、時間單位
 * (50ms tick)、32-bit 打包格式都不可任意更動，任何修改都必須先通過
 * __tests__/buildPlayers.golden.test.js。
 *
 * 給 C++ 開發者的類比：這相當於把 struct 序列化成 wire format 的函式，
 * 欄位順序等同 ABI，改了另一端（韌體）就會解析錯誤。
 *
 * @param {Array|Object} actionTable - actionTable[armorIndex][partIndex] = [{time, color:{R,G,B,A}, linear}]
 * @returns {Array<Array<Object>>} players[armorIndex] = [{time, hat, face, ..., acc7}]
 */
export function buildPlayers(actionTable) {
  const players = [];
  const armorIndices = Object.keys(actionTable);

  for (let i = 0; i < armorIndices.length; i++) {
    const armorIndex = armorIndices[i];
    const partGroup = actionTable[armorIndex];
    // 物件的 key 是字串，而 isPartAllowed 要比的是舞者編號
    const armor = Number(armorIndex);

    // 收集這位舞者所有部位的關鍵格時間，對齊到 50ms 網格後去重
    let times = new Set();

    for (let key in partGroup) {
      const partArray = partGroup[key];
      if (!Array.isArray(partArray)) continue;

      partArray.forEach((item) => {
        const roundedTime = Math.ceil(item.time / TICK_MS) * TICK_MS;
        times.add(roundedTime);
      });
    }

    let uniqueTimes = [...times]
      .map((t) => Math.round(t))
      .sort((a, b) => a - b);

    let mergedResults = [];

    for (let j = 0; j < uniqueTimes.length; j++) {
      const time = uniqueTimes[j];

      const mergedItem = {
        time: Math.floor(time / TICK_MS),
      };

      for (let key in partGroup) {
        const partTimeline = partGroup[key];
        if (!Array.isArray(partTimeline) || partTimeline.length === 0) continue;

        // 找出時間軸上最後一個 time <= 當前取樣點的關鍵格
        let activeBlock = null;
        let activeIndex = -1;

        for (let k = 0; k < partTimeline.length; k++) {
          if (partTimeline[k].time <= time) {
            activeBlock = partTimeline[k];
            activeIndex = k;
          } else {
            break;
          }
        }

        let R = 0,
          G = 0,
          B = 0,
          A = 1,
          linear = 0;

        if (activeBlock) {
          if (activeBlock.linear === 1) {
            const nextBlock = partTimeline[activeIndex + 1];

            if (nextBlock && nextBlock.time > activeBlock.time) {
              // 線性漸變：分母用關鍵格的原始毫秒時間，不是對齊後的時間
              const f =
                (time - activeBlock.time) / (nextBlock.time - activeBlock.time);

              R = Math.round(
                activeBlock.color.R * (1 - f) + nextBlock.color.R * f,
              );
              G = Math.round(
                activeBlock.color.G * (1 - f) + nextBlock.color.G * f,
              );
              B = Math.round(
                activeBlock.color.B * (1 - f) + nextBlock.color.B * f,
              );
              A = activeBlock.color.A * (1 - f) + nextBlock.color.A * f;
              linear = 1;
            } else {
              R = activeBlock.color.R;
              G = activeBlock.color.G;
              B = activeBlock.color.B;
              A = activeBlock.color.A;
              linear = 1;
            }
          } else {
            R = activeBlock.color.R;
            G = activeBlock.color.G;
            B = activeBlock.color.B;
            A = activeBlock.color.A;
            linear = 0;
          }
        }

        // 32-bit 打包：[R 8][G 8][B 8][亮度 7][漸變 1]
        const alpha7 = Math.min(Math.floor(A * 128), 127);
        const packedByte = (alpha7 << 1) | (linear & 1);

        const color32 =
          ((R & 0xff) << 24) |
          ((G & 0xff) << 16) |
          ((B & 0xff) << 8) |
          (packedByte & 0xff);

        mergedItem[key] = color32 >>> 0;
      }

      // 欄位順序即韌體 ABI，由 constants/parts.js 的 PART_KEYS 決定，不可調換
      const row = { time: mergedItem.time };
      PART_KEYS.forEach((partKey, partIndex) => {
        /*
         * ⚠️ 這位舞者沒有的部位一律輸出 0（黑、亮度 0）——**這是最後一道防線**。
         *
         * `isPartAllowed` 原本只用在「畫面上要不要讓你點」（ControlPanel 與
         * /edit 的表格），輸出路徑完全沒有檢查。跨軌貼上之後那個缺口變得踩得到：
         * 落點是 (舞者, 部位) 的座標差推出來的，而唯一的檢查是「這個部位是不是
         * 一個陣列」——22 個部位全部為真。於是把七位舞者的 acc3 一起複製、往下
         * 貼一格，資料就會落在根本沒帶那件道具的舞者身上。
         *
         * 那種錯的症狀是**沒有症狀**：上傳成功、版本清單正常、編輯器裡看得到
         * 色塊，只有演出當天那盞不存在的燈不會亮。落點那邊也擋了（見
         * clipboard.js 與 table.js），但載入舊光表一樣可能帶進這種資料，
         * 所以最後這一關不能省。
         */
        const packed = mergedItem[partIndex] ?? 0;
        /*
         * 清的是 **RGB，不是整個欄位**。黑色乘上任何亮度還是黑色，所以留著
         * 低位元組（亮度 7 bit + 漸變旗標）就足以保證那盞燈不會亮，而原本
         * 就是暗的欄位輸出**一個 bit 都不會變**——把整個欄位歸零的話，
         * 每一位舞者每一列的八個飾品欄位都會從 254（黑、亮度 100%）變成 0，
         * 那是在沒有必要的情況下動到韌體契約。
         */
        row[partKey] = isPartAllowed(armor, partIndex)
          ? packed
          : packed & 0x000000ff;
      });
      mergedResults.push(row);
    }

    // 缺漏欄位由前一列補上（forward fill）
    for (let j = 0; j < mergedResults.length; j++) {
      if (j > 0) {
        for (let k in mergedResults[j - 1]) {
          if (
            !(k in mergedResults[j]) ||
            mergedResults[j][k] === undefined ||
            mergedResults[j][k] === null
          ) {
            mergedResults[j][k] = mergedResults[j - 1][k];
          }
        }
      }
    }

    players.push(mergedResults);
  }

  return players;
}

export default buildPlayers;
