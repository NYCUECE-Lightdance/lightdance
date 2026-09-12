/**
 * 工作集 —— 具名的軌道組合。
 *
 * ## 為什麼要有
 *
 * 154 條時間軸（7 舞者 × 22 部位）不可能同時放在畫面上，所以編輯器一直是
 * 「使用者自己挑要看哪幾軌」。問題是那組挑選**沒有名字也存不起來**：
 * 「舞者 3 全身」和「所有人的帽子」是兩種完全不同的編法，先前每次切換都要
 * 把軌道一條條拆掉再一條條加回來，而且加到一半會忘記原本有哪些。
 *
 * 工作集把那組挑選變成可以命名、存起來、一鍵切換的東西。功能沒有變複雜——
 * 加軌、移除、上下移全部照舊，只是它們現在作用在「目前這一組」上。
 *
 * ## 形狀
 *
 * ```js
 * worksets = {
 *   activeId: 1,
 *   sets: [
 *     { id: 1, name: "未命名", tracks: [{ id, armorIndex, partIndex }] },
 *   ],
 * }
 * ```
 *
 * `tracks` 的元素形狀與舊的 `showPart` 完全相同，所以所有讀取端只要改成
 * 「問目前這一組的 tracks」，其餘邏輯一行都不用動。
 *
 * ## 不變式
 *
 * - `sets` 至少有一組（刪到剩一組時不准再刪，否則畫面上會沒有任何軌道）
 * - `activeId` 一定指向 `sets` 裡存在的一組
 * - 同一組裡 track 的 `id` 唯一
 */

/** 第一次使用時的預設工作集：三條帽子軌，和舊版的預設值相同 */
export const createDefaultWorksets = () => ({
  activeId: 1,
  sets: [
    {
      id: 1,
      name: "未命名",
      tracks: [
        { id: 1, armorIndex: 0, partIndex: 0 },
        { id: 2, armorIndex: 1, partIndex: 0 },
        { id: 3, armorIndex: 2, partIndex: 0 },
      ],
    },
  ],
});

/** 目前這一組（找不到時回傳第一組；`sets` 是空的才回傳 null） */
export const activeSet = (worksets) => {
  const sets = worksets?.sets;
  if (!Array.isArray(sets) || sets.length === 0) return null;
  return sets.find((set) => set.id === worksets.activeId) ?? sets[0];
};

/** 目前這一組的軌道清單（永遠回傳陣列，呼叫端不必再判斷 null） */
export const activeTracks = (worksets) => activeSet(worksets)?.tracks ?? [];

/** 在一組裡把 tracks 換掉，其餘組別維持原 reference */
export const withTracks = (worksets, setId, tracks) => ({
  ...worksets,
  sets: worksets.sets.map((set) =>
    set.id === setId ? { ...set, tracks } : set,
  ),
});

/** 下一個沒被用過的 id（不用 length + 1——刪掉中間那組之後會撞號） */
const nextId = (items) =>
  items.reduce((max, item) => Math.max(max, item.id ?? 0), 0) + 1;

/**
 * 新增一組。
 *
 * 預設**複製目前這一組的軌道**而不是給空的：多數情況下新的一組是從現有的
 * 微調而來（「上半身」是從「全身」拿掉腿和鞋），從空白開始要重加十幾條。
 */
export const addSet = (worksets, name) => {
  const id = nextId(worksets.sets);
  const source = activeSet(worksets);
  const tracks = (source?.tracks ?? []).map((track, index) => ({
    ...track,
    id: index + 1,
  }));

  return {
    activeId: id,
    sets: [...worksets.sets, { id, name: name || `工作集 ${id}`, tracks }],
  };
};

export const renameSet = (worksets, setId, name) => ({
  ...worksets,
  sets: worksets.sets.map((set) =>
    set.id === setId ? { ...set, name } : set,
  ),
});

/**
 * 刪除一組。
 *
 * 只剩一組時不做事——沒有任何工作集的話畫面上一條軌道都沒有，
 * 而使用者會找不到「怎麼把軌道弄回來」。
 */
export const removeSet = (worksets, setId) => {
  if (worksets.sets.length <= 1) return worksets;

  const sets = worksets.sets.filter((set) => set.id !== setId);
  return {
    sets,
    activeId: sets.some((set) => set.id === worksets.activeId)
      ? worksets.activeId
      : sets[0].id,
  };
};

/** 切換到某一組；id 不存在時原樣回傳（不要讓畫面變成空的） */
export const switchSet = (worksets, setId) =>
  worksets.sets.some((set) => set.id === setId)
    ? { ...worksets, activeId: setId }
    : worksets;

/**
 * 舊資料遷移 —— 把 `showPart` 收進一組叫「未命名」的工作集。
 *
 * 靠形狀辨認而不是版本號：已經有 `worksets` 就原樣沿用，只有 `showPart`
 * 就包起來，兩個都沒有就給預設值。這樣不管使用者是從哪一版跳上來的都能載入。
 *
 * 同時把舊的 `hidden` 欄位丟掉（那個功能已經移除，見 Timeline 的說明）。
 */
export const migrateWorksets = (state) => {
  if (state?.worksets?.sets?.length > 0) {
    return { ...state, worksets: state.worksets, showPart: undefined };
  }

  const legacy = Array.isArray(state?.showPart) ? state.showPart : null;
  if (!legacy || legacy.length === 0) {
    return { ...state, worksets: createDefaultWorksets(), showPart: undefined };
  }

  return {
    ...state,
    worksets: {
      activeId: 1,
      sets: [
        {
          id: 1,
          name: "未命名",
          tracks: legacy.map(({ id, armorIndex, partIndex }, index) => ({
            id: id ?? index + 1,
            armorIndex,
            partIndex,
          })),
        },
      ],
    },
    showPart: undefined,
  };
};
