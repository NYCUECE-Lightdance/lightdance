import { describe, it, expect } from "vitest";

import {
  activeSet,
  activeTracks,
  addSet,
  createDefaultWorksets,
  migrateWorksets,
  removeSet,
  renameSet,
  switchSet,
  withTracks,
} from "../worksets.js";

/**
 * 工作集的不變式測試。
 *
 * 這一層唯一會真的害到使用者的失敗是「軌道不見了」——`sets` 變空、
 * `activeId` 指向不存在的組、或遷移把舊的挑選丟掉。下面每一則都在守這件事。
 */

const make = () => ({
  activeId: 2,
  sets: [
    { id: 1, name: "全身", tracks: [{ id: 1, armorIndex: 0, partIndex: 0 }] },
    {
      id: 2,
      name: "所有人的帽子",
      tracks: [
        { id: 1, armorIndex: 0, partIndex: 0 },
        { id: 2, armorIndex: 1, partIndex: 0 },
      ],
    },
  ],
});

describe("讀取", () => {
  it("activeSet 回傳 activeId 指到的那一組", () => {
    expect(activeSet(make()).name).toBe("所有人的帽子");
  });

  it("activeId 指不到時退回第一組，而不是回傳 null 讓畫面變空", () => {
    const broken = { ...make(), activeId: 999 };
    expect(activeSet(broken).id).toBe(1);
    expect(activeTracks(broken)).toHaveLength(1);
  });

  it("完全沒有資料時 activeTracks 仍然是陣列", () => {
    expect(activeTracks(undefined)).toEqual([]);
    expect(activeTracks({ sets: [] })).toEqual([]);
  });
});

describe("withTracks", () => {
  it("只換掉那一組，其他組維持原 reference", () => {
    const before = make();
    const next = withTracks(before, 2, []);

    expect(next.sets[1].tracks).toEqual([]);
    expect(next.sets[0]).toBe(before.sets[0]);
  });
});

describe("addSet", () => {
  it("複製目前這一組的軌道並切換過去", () => {
    const next = addSet(make(), "上半身");

    expect(next.sets).toHaveLength(3);
    expect(next.activeId).toBe(3);
    // 從「所有人的帽子」複製而來
    expect(activeTracks(next)).toHaveLength(2);
    expect(activeTracks(next)[1]).toMatchObject({ armorIndex: 1, partIndex: 0 });
  });

  it("id 取最大值加一，刪掉中間那組之後也不會撞號", () => {
    // 先刪掉 id 1，再新增——用 length + 1 的話會產生第二個 id 2
    const afterRemove = removeSet(make(), 1);
    const next = addSet(afterRemove);

    const ids = next.sets.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(next.activeId).toBe(3);
  });

  it("複製過來的軌道自己重新編號", () => {
    const next = addSet(make());
    expect(activeTracks(next).map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("removeSet", () => {
  it("刪掉非作用中的那組", () => {
    const next = removeSet(make(), 1);
    expect(next.sets).toHaveLength(1);
    expect(next.activeId).toBe(2);
  });

  it("刪掉作用中的那組時 activeId 改指向剩下的第一組", () => {
    const next = removeSet(make(), 2);
    expect(next.activeId).toBe(1);
  });

  it("只剩一組時不准刪——沒有工作集的話畫面上一條軌道都沒有", () => {
    const single = { activeId: 1, sets: [make().sets[0]] };
    expect(removeSet(single, 1)).toBe(single);
  });
});

describe("switchSet / renameSet", () => {
  it("切換到存在的組", () => {
    expect(switchSet(make(), 1).activeId).toBe(1);
  });

  it("切換到不存在的組時原樣回傳", () => {
    const before = make();
    expect(switchSet(before, 999)).toBe(before);
  });

  it("改名不動 tracks", () => {
    const next = renameSet(make(), 2, "副歌用");
    expect(next.sets[1].name).toBe("副歌用");
    expect(next.sets[1].tracks).toEqual(make().sets[1].tracks);
  });
});

describe("migrateWorksets", () => {
  it("舊的 showPart 收成一組叫「未命名」的工作集", () => {
    const legacy = {
      showPart: [
        { id: 1, armorIndex: 0, partIndex: 0, hidden: false },
        { id: 2, armorIndex: 3, partIndex: 7, hidden: true },
      ],
    };
    const next = migrateWorksets(legacy);

    expect(next.worksets.sets).toHaveLength(1);
    expect(next.worksets.sets[0].name).toBe("未命名");
    expect(next.worksets.activeId).toBe(1);
    expect(activeTracks(next.worksets)).toEqual([
      { id: 1, armorIndex: 0, partIndex: 0 },
      { id: 2, armorIndex: 3, partIndex: 7 },
    ]);
  });

  it("丟掉已經移除的 hidden 欄位", () => {
    const next = migrateWorksets({
      showPart: [{ id: 1, armorIndex: 0, partIndex: 0, hidden: true }],
    });
    expect(activeTracks(next.worksets)[0]).not.toHaveProperty("hidden");
  });

  it("已經是 worksets 的資料原樣沿用", () => {
    const current = make();
    const next = migrateWorksets({ worksets: current });
    expect(next.worksets).toBe(current);
  });

  it("兩個都沒有時給預設值，不要留下空畫面", () => {
    expect(activeTracks(migrateWorksets({}).worksets)).toHaveLength(3);
    expect(activeTracks(migrateWorksets({ showPart: [] }).worksets)).toHaveLength(3);
  });

  it("遷移後不留下 showPart，避免兩份真相", () => {
    const next = migrateWorksets({ showPart: [{ id: 1, armorIndex: 0, partIndex: 0 }] });
    expect(next.showPart).toBeUndefined();
  });
});

describe("預設值", () => {
  it("預設有一組三條軌道，activeId 指得到", () => {
    const worksets = createDefaultWorksets();
    expect(activeSet(worksets)).not.toBe(null);
    expect(activeTracks(worksets)).toHaveLength(3);
  });
});
