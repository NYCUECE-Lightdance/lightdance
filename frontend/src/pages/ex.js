async function handleOutput() {
  const players = [];
  for (let i = 0; i < actionTable.length; i++) {
    const playerGroup = [];

    let times = new Set();

    // 將所有 time 加入 Set 中
    for (let key in actionTable[i]) {
      actionTable[i][key].forEach((item) => times.add(item.time));
    }

    // 生成唯一的時間點數組並排序
    let uniqueTimes = [...times]
      .map((time) => Math.round(time))
      .sort((a, b) => a - b);

    // console.log(uniqueTimes);

    let mergedResults = [];

    // 遍歷 uniqueTimes 中的每個時間點
    for (let j = 0; j < uniqueTimes.length; j++) {
      let mergedItem = {
        time: uniqueTimes[j],
      };

      // 遍歷 actionTable[i] 中的所有項目，根據時間進行合併
      for (let key in actionTable[i]) {
        // 在每個 key 中找到時間為 current time 的項目
        let item = actionTable[i][key].find(
          (el) => Math.round(el.time) === uniqueTimes[j]
        );

        if (item) {
          // 將對應的 item 的數據合併到 mergedItem 中
          mergedItem[key] = item.color;
        }
      }
      mergedResults.push({
        time: mergedItem.time,
        head: mergedItem[0],
        shoulder: mergedItem[1],
        chest: mergedItem[2],
        arm_waist: mergedItem[3],
        leg1: mergedItem[4],
        leg2: mergedItem[5],
        shoes: mergedItem[6],
      });
    }

    for (let j = 0; j < mergedResults.length; j++) {
      for (let item in mergedResults[j]) {
        let target = mergedResults[j][item];
        if (target) {
          const color =
            ((target.R & 0xff) << 24) |
            ((target.G & 0xff) << 16) |
            ((target.B & 0xff) << 8) |
            (target.A & 0xff);
          let unsignedColor = color >>> 0;
          mergedResults[j][item] = unsignedColor;
        }
      }
    }
    players.push(mergedResults);
  }
  let newPlayer = [];

  players.forEach((group) => {
    let newGroup = [];
    let prevElement = null;

    group.forEach((element) => {
      if (prevElement !== null) {
        for (let key in prevElement) {
          // If the key is missing in the current element, copy it from prevElement
          if (!(key in element) || element[key] === undefined) {
            element[key] = prevElement[key];
          }
        }
      }
      prevElement = element;
      newGroup.push(element);
    });
    newPlayer.push(newGroup);
  });

  console.log(JSON.stringify(newPlayer, null, 2));

  // 生成 JSON 對象
  const result = {
    // players: players,
    players,
  };
  console.log(JSON.stringify(result, null, 2));
}
