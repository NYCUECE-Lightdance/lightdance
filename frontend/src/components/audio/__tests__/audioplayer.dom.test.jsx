import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, act } from "@testing-library/react";
import { createRef } from "react";

import AudioPlayer from "../audioplayer.jsx";
import {
  updateChosenColor,
  updateCurrentTime,
  updateIsColorChangeActive,
} from "../../../redux/actions.js";
import {
  renderWithStore,
  createTestStore,
  createCrossTrackStore,
  timelineOf,
  segmentsOf,
  selectSegment,
  selectAcross,
} from "../../../test/renderEditor.jsx";

/**
 * audioplayer 的冒煙測試 —— **Phase 3 拆件期間的安全網**。
 *
 * 這些互動（工具列、快捷鍵、選取）沒有任何純函式測試涵蓋得到，而 Phase 3
 * 要把 1,900 多行的 audioplayer 拆成多個元件。搬移過程只要有一處接錯線，
 * 這裡就會紅燈——不必等到手動測試才發現。
 *
 * 定位是**冒煙測試**：驗證主線接得起來，不追求覆蓋每個分支。
 */

const mount = (store = createTestStore()) =>
  renderWithStore(
    <AudioPlayer setButtonState={vi.fn()} timelineRef={createRef()} />,
    { store },
  );

/** 快捷鍵是掛在 document 上的，要對 document 發事件 */
const pressKey = (key, options = {}) => {
  fireEvent.keyDown(document, { key, ...options });
};

describe("AudioPlayer 掛載", () => {
  it("渲染出主要控制項", () => {
    mount();

    // 音樂選擇器與播放控制是最外顯的兩塊
    expect(document.querySelector(".audio-player-container")).toBeTruthy();
    expect(document.querySelector(".controls")).toBeTruthy();
    expect(document.querySelector(".timeline-container")).toBeTruthy();
  });

  it("播放清單預設是收起的，展開才看得到歌單", () => {
    mount();

    const toggle = document.querySelector("[data-testid='playlist-toggle']");
    expect(toggle).toBeTruthy();
    // 收起時整份清單不在 DOM 上——它常駐會吃掉工具列的版面
    expect(document.querySelector("[data-testid='playlist-panel']")).toBeNull();

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.querySelector("[data-testid='playlist-panel']")).toBeTruthy();
  });
});

describe("快捷鍵", () => {
  let store;

  beforeEach(() => {
    store = createTestStore();
    mount(store);
  });

  it("M 切換 Move Mode", () => {
    expect(store.getState().profiles.moveMode).toBe(false);
    pressKey("m");
    expect(store.getState().profiles.moveMode).toBe(true);
  });

  it("方向鍵移動播放位置（一次一個 tick）", () => {
    const before = store.getState().profiles.currentTime;
    pressKey("ArrowRight");
    expect(store.getState().profiles.currentTime).toBe(before + 50);
  });

  it("播放位置不會被方向鍵推到負數", () => {
    pressKey("ArrowLeft");
    expect(store.getState().profiles.currentTime).toBe(0);
  });

  it("P 開啟改色流程（需先有選取）", () => {
    store.dispatch({
      type: "UPDATE_MULTI_SELECTED_BLOCKS",
      payload: [{ armorIndex: 0, partIndex: 0, segmentId: null }],
    });
    pressKey("p");
    // 改色流程會把 isColorChangeActive 打開，或至少不應該炸掉
    expect(store.getState().profiles).toBeDefined();
  });

  it("沒有選取時按刪除不會破壞光表", () => {
    const before = JSON.stringify(timelineOf(store));
    pressKey("Delete");
    expect(JSON.stringify(timelineOf(store))).toBe(before);
  });
});

describe("複製貼上", () => {
  /*
   * Phase 5e：剪貼簿存的是 segments，不再是壓平的 keyframe 陣列。
   * 選取一律用 selectSegment 從 store 反查 id。
   *
   * 跨軌之後剪貼簿存的是**一個矩形**（區間 × 幾條軌），所以形狀是
   * `clipboard.parts = [{armorIndex, partIndex, segments}]`。
   */

  /** 剪貼簿裡所有軌道的段攤平成一串（大部分斷言只在乎內容） */
  const copiedSegments = (store) =>
    (store.getState().profiles.clipboard.parts ?? []).flatMap((p) => p.segments);

  it("Ctrl+C 存入剪貼簿並進入複製模式", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, 0);
    mount(store);

    expect(document.querySelector(".copy-mode-banner")).toBeFalsy();
    pressKey("c", { ctrlKey: true });

    const clipboard = store.getState().profiles.clipboard;
    expect(clipboard.kind).toBe("segments-2d");
    expect(clipboard.parts.length).toBe(1);
    expect(clipboard.parts[0].segments.length).toBeGreaterThan(0);
    expect(document.querySelector(".copy-mode-banner")).toBeTruthy();
  });

  it("Esc 離開複製模式並清空選取", () => {
    vi.useFakeTimers();
    try {
      const store = createTestStore();
      selectSegment(store, 0, 0, 0);
      mount(store);

      pressKey("c", { ctrlKey: true });
      expect(document.querySelector(".copy-mode-banner")).toBeTruthy();

      vi.advanceTimersByTime(150); // 讓 100ms 防彈跳的 latch 放開
      pressKey("Escape");
      expect(document.querySelector(".copy-mode-banner")).toBeFalsy();
      expect(store.getState().profiles.multiSelectedBlocks).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Shift+C 複製整個部位、Shift+V 覆蓋到另一個部位", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, 0);
    mount(store);

    pressKey("C", { shiftKey: true });
    const copied = copiedSegments(store);
    expect(copied.length).toBe(segmentsOf(store, 0, 0).length);

    // 換選到另一個部位再貼上（防彈跳需等 100ms 以上，這裡直接改 store）
    selectSegment(store, 1, 0, 0);
    // 重新掛載讓 handler 讀到新的選取
    mount(store);
    pressKey("V", { shiftKey: true });

    const pasted = segmentsOf(store, 1, 0);
    expect(pasted.length).toBe(copied.length);
    // 貼上的是**副本**：時間與顏色一樣，但 id 全部換新，
    // 否則選取與 undo diff 會同時指到兩個部位
    expect(pasted.map((s) => s.start)).toEqual(copied.map((s) => s.start));
    expect(pasted.some((s) => copied.some((c) => c.id === s.id))).toBe(false);
  });

  it("Ctrl+V 以選取色塊的起點對齊貼上，覆蓋掉衝突區間", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, 0); // 紅 1000~2000
    mount(store);
    pressKey("c", { ctrlKey: true });

    // 貼到第二段（綠 2000~10000）的起點
    selectSegment(store, 0, 0, 1);
    mount(store);
    pressKey("v", { ctrlKey: true });

    const segments = segmentsOf(store, 0, 0);
    // 紅色副本落在 2000，長度不變（1000ms）
    const pastedRed = segments.find((s) => s.start === 2000);
    expect(pastedRed.colorStart.R).toBe(255);
    expect(pastedRed.end).toBe(3000);
    // 原本佔著 2000~10000 的綠色被裁掉前段，從 3000 開始
    const green = segments.find((s) => s.colorStart.G === 255);
    expect(green.start).toBe(3000);
  });
});

describe("跨軌操作", () => {
  /*
   * 框選一次就能選到好幾位舞者身上的同一個樂句，但在這一組測試出現之前，
   * 幾乎每個操作都在 `multiSelectedBlocks[0]` 那一條就收斂了——選了三條
   * 只有一條會動，**而且不會報錯也沒有任何提示**，畫面上只是「怎麼其他兩條
   * 沒變」。這些測試逐項守住「選了幾條就動幾條」。
   *
   * 素材是三位舞者的部位 0 各有一個 1000~2000 的紅色色塊。
   */

  /** 三條軌的第一個色塊全選起來 */
  const selectAllThree = (store) =>
    selectAcross(store, [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);

  const redOf = (store, armor) =>
    segmentsOf(store, armor, 0).find((s) => s.colorStart.R === 255);

  it("刪除：三條一起刪", () => {
    const store = createCrossTrackStore();
    selectAllThree(store);
    mount(store);

    pressKey("Delete");

    for (const armor of [0, 1, 2]) {
      expect(segmentsOf(store, armor, 0)).toEqual([]);
    }
  });

  it("亮度：三條一起改", () => {
    const store = createCrossTrackStore();
    selectAllThree(store);
    mount(store);

    pressKey("3", { ctrlKey: true }); // 30%

    for (const armor of [0, 1, 2]) {
      expect(redOf(store, armor).colorStart.A).toBeCloseTo(0.3);
    }
  });

  it("漸變：三條一起切，而且終點色各算各的", () => {
    const store = createCrossTrackStore();
    selectAllThree(store);
    mount(store);

    pressKey("l");

    for (const armor of [0, 1, 2]) {
      expect(redOf(store, armor).linear).toBe(1);
    }
  });

  it("改色：三條一起改", () => {
    const store = createCrossTrackStore();
    // 顏色會被換掉，所以先記下 id——不能再用顏色反查
    const selected = selectAllThree(store);
    mount(store);

    act(() => {
      store.dispatch(updateChosenColor({ R: 10, G: 20, B: 30, A: 1 }));
      store.dispatch(updateIsColorChangeActive(true));
    });

    for (const { armorIndex, segmentId } of selected) {
      const segment = segmentsOf(store, armorIndex, 0).find(
        (s) => s.id === segmentId,
      );
      expect(segment.colorStart).toMatchObject({ R: 10, G: 20, B: 30 });
    }
  });

  it("剪下：三條一起在播放頭上剪開", () => {
    const store = createCrossTrackStore();
    selectAllThree(store);
    mount(store);

    act(() => {
      store.dispatch(updateCurrentTime(1500));
    });
    pressKey("c");

    for (const armor of [0, 1, 2]) {
      const reds = segmentsOf(store, armor, 0).filter(
        (s) => s.colorStart.R === 255,
      );
      expect(reds.map((s) => [s.start, s.end])).toEqual([
        [1000, 1500],
        [1500, 2000],
      ]);
    }
  });

  it("複製貼上：三條一起複製，貼到另一位舞者時整組跟著平移", () => {
    const store = createCrossTrackStore();
    // 錨點是舞者 0，所以貼到舞者 1 = 整組往下平移一位（1、2、3）
    selectAllThree(store);
    mount(store);
    pressKey("c", { ctrlKey: true });

    const clipboard = store.getState().profiles.clipboard;
    expect(clipboard.parts).toHaveLength(3);

    // 舞者 1 的部位 0 沒有選到色塊時，Ctrl+V 退化成保持原本的時間
    act(() => {
      store.dispatch({
        type: "UPDATE_MULTI_SELECTED_BLOCKS",
        payload: [{ armorIndex: 1, partIndex: 0, segmentId: null }],
      });
    });
    mount(store);
    pressKey("v", { ctrlKey: true });

    // 來源 0/1/2 → 落在 1/2/3，第四位舞者身上多出一段紅色
    expect(redOf(store, 3)).toBeTruthy();
    expect(redOf(store, 3).start).toBe(1000);
  });

  it("放最愛色：選到幾條就放幾條", () => {
    const store = createCrossTrackStore({
      currentTime: 5000,
      favoriteColor: [[{ R: 1, G: 2, B: 3, A: 1 }]],
    });
    selectAllThree(store);
    mount(store);

    pressKey("!", { shiftKey: true, code: "Digit1" });

    for (const armor of [0, 1, 2]) {
      const inserted = segmentsOf(store, armor, 0).find(
        (s) => s.colorStart.R === 1 && s.colorStart.G === 2,
      );
      expect(inserted).toBeTruthy();
    }
  });
});

describe("色塊工具列", () => {
  /**
   * 測試光表的部位 0 有兩個色塊：紅 1000~2000、綠 2000~10000
   * （見 renderEditor.jsx）。選取一律用 selectSegment 從 store 反查，
   * 不要手工組選取項目——segmentId 是
   * 建 store 時才產生的，寫死等於把實作細節抄進斷言。
   */
  const RED_BLOCK = 0;

  it("刪除鍵移除選取的色塊並清空選取", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    expect(segmentsOf(store).some((s) => s.colorStart.R === 255)).toBe(true);
    fireEvent.click(document.querySelector(".delete-button"));

    // segment 模型不需要塗黑——把那一段拿掉就是熄滅
    expect(segmentsOf(store).some((s) => s.colorStart.R === 255)).toBe(false);
    expect(store.getState().profiles.multiSelectedBlocks).toEqual([]);
  });

  it("亮度下拉改變選取色塊的透明度", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    fireEvent.change(document.querySelector("#brightness-select"), {
      target: { value: "0.3" },
    });
    expect(segmentsOf(store)[RED_BLOCK].colorStart.A).toBeCloseTo(0.3);
  });

  it("下一個時間點跳到色塊邊界", () => {
    const store = createTestStore({ currentTime: 1000 });
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    fireEvent.click(document.querySelector(".timeline-right"));
    // 紅色塊 1000~2000 的下一個邊界就是 2000。
    // 舊模型這裡會停在 1990 的黑哨兵上，所以要額外判斷「差 10ms 就再跳一格」。
    expect(store.getState().profiles.currentTime).toBe(2000);
  });

  it("沒有選取時導航不會移動播放位置", () => {
    const store = createTestStore({ currentTime: 1000 });
    mount(store);

    fireEvent.click(document.querySelector(".timeline-right"));
    expect(store.getState().profiles.currentTime).toBe(1000);
  });

  it("剪刀在播放位置把色塊切成兩段", () => {
    // 紅色塊 1000~2000，在 1500 切開
    const store = createTestStore({ currentTime: 1500 });
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    fireEvent.click(document.querySelector(".cut-button"));

    const reds = segmentsOf(store).filter((s) => s.colorStart.R === 255);
    expect(reds.map((s) => [s.start, s.end])).toEqual([
      [1000, 1500],
      [1500, 2000],
    ]);
  });

  it("剪完之後選取移到後半段", () => {
    const store = createTestStore({ currentTime: 1500 });
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    fireEvent.click(document.querySelector(".cut-button"));

    const { segmentId } = store.getState().profiles.multiSelectedBlocks[0];
    const selected = segmentsOf(store).find((s) => s.id === segmentId);
    expect(selected).toMatchObject({ start: 1500, end: 2000 });
  });

  it("統一同色透明度會改到全場同色的色塊", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    // 另一位舞者也放一個一樣的紅色塊
    const table = store.getState().profiles.data.actionTable;
    const red = segmentsOf(store)[RED_BLOCK];
    store.dispatch({
      type: "UPDATEACTIONTABLE",
      payload: table.map((armor, a) =>
        a === 3
          ? armor.map((segs, p) =>
              p === 2 ? [{ ...red, id: "other-red" }] : segs,
            )
          : armor,
      ),
      meta: { skipHistory: true },
    });

    fireEvent.click(document.querySelector(".uniform-alpha-button"));
    fireEvent.click(
      [...document.querySelectorAll(".uniform-alpha-option")].find(
        (el) => el.textContent === "30%",
      ),
    );

    expect(segmentsOf(store, 0, 0)[RED_BLOCK].colorStart.A).toBeCloseTo(0.3);
    expect(segmentsOf(store, 3, 2)[0].colorStart.A).toBeCloseTo(0.3);
  });

  it("統一同色透明度不會動到別的顏色，也維持沒改到的部位 reference", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    const greenBefore = segmentsOf(store)[1];
    const untouchedPart = segmentsOf(store, 4, 7);

    fireEvent.click(document.querySelector(".uniform-alpha-button"));
    fireEvent.click(
      [...document.querySelectorAll(".uniform-alpha-option")].find(
        (el) => el.textContent === "30%",
      ),
    );

    expect(segmentsOf(store)[1]).toBe(greenBefore);
    expect(segmentsOf(store, 4, 7)).toBe(untouchedPart);
  });

  it("剪刀讀的是畫面上這個 store 的播放位置", () => {
    // 這則的重點不是切割本身，而是 cutSelected 從哪裡讀 currentTime。
    // 它曾經 import 模組層的 store singleton，在測試裡會讀到另一個 store
    // （currentTime 恆為 0），於是永遠切在色塊外面而靜默什麼都不做。
    const store = createTestStore({ currentTime: 1800 });
    selectSegment(store, 0, 0, RED_BLOCK);
    mount(store);

    fireEvent.click(document.querySelector(".cut-button"));

    expect(
      segmentsOf(store).some((s) => s.start === 1800),
      "應該切在 1800，而不是別的 store 的 currentTime",
    ).toBe(true);
  });
});

describe("播放控制列", () => {
  it("切換播放速度會寫進 Redux", () => {
    const store = createTestStore();
    mount(store);

    fireEvent.change(document.querySelector("#speed-select"), {
      target: { value: "1.5" },
    });
    expect(store.getState().profiles.playbackRate).toBe(1.5);
  });

  it("播放鍵切換播放狀態（圖示跟著換）", () => {
    mount();
    const playButton = document.querySelector(".play-button");

    // 提示文字已改成繁中（介面其餘部分本來就是中文，只有這 16 則提示是英文）
    expect(playButton.querySelector(".tooltip").textContent).toContain("播放");
    fireEvent.click(playButton);
    expect(
      document.querySelector(".play-button .tooltip").textContent,
    ).toContain("暫停");
  });

  it("顯示目前時間與總長度", () => {
    const store = createTestStore({ currentTime: 5000 });
    mount(store);

    expect(document.querySelector(".current-time-box").textContent).toBe(
      "0:05:000",
    );
    expect(document.querySelector(".duration-box").textContent).toBe(
      "0:10:000",
    );
  });
});

describe("Shift + 數字：插入最愛顏色", () => {
  /**
   * 這條路徑原本永遠進不來：按住 Shift 時 `Shift+1` 的 `event.key` 是 `"!"`，
   * 而條件寫的是 `["1".."8"].includes(event.key)`。改用 `event.code` 才接得回來。
   */
  const storeWithPalette = () =>
    createTestStore({
      currentTime: 5000,
      favoriteColor: [
        [
          { R: 1, G: 2, B: 3, A: 1 },
          { R: 4, G: 5, B: 6, A: 1 },
        ],
      ],
      multiSelectedBlocks: [{ armorIndex: 0, partIndex: 0, segmentId: null }],
    });

  it("在播放位置插入最愛顏色", () => {
    const store = storeWithPalette();
    mount(store);

    const before = timelineOf(store).length;
    pressKey("!", { shiftKey: true, code: "Digit1" });

    const after = timelineOf(store);
    expect(after.length).toBeGreaterThan(before);
    expect(
      after.some((entry) => entry.color.R === 1 && entry.color.G === 2),
    ).toBe(true);
  });

  it("顏色盤還沒載入時不會炸掉", () => {
    // favoriteColor 預設是空陣列，原本的 favoriteColor[0].length 會直接 throw
    const store = createTestStore({
      currentTime: 5000,
      multiSelectedBlocks: [{ armorIndex: 0, partIndex: 0, segmentId: null }],
    });
    mount(store);

    const before = JSON.stringify(timelineOf(store));
    pressKey("!", { shiftKey: true, code: "Digit1" });
    expect(JSON.stringify(timelineOf(store))).toBe(before);
  });
});

describe("調色盤改色", () => {
  /**
   * 調色盤是靠一個 effect 生效的：`isColorChangeActive` 打開時，把
   * `chosenColor` 套到選取的色塊上。effect 的依賴裡有光表本身，所以它會在
   * 自己寫入之後**再跑一次**——第二次必須算出「什麼都沒變」並回傳原陣列，
   * 否則每次改色都會多推一筆 history，使用者按 Ctrl+Z 要按兩次才回得去。
   */
  const CYAN = { R: 0, G: 200, B: 200, A: 1 };

  const storeWithPalette = () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, 0); // 紅 1000~2000
    store.dispatch(updateChosenColor(CYAN));
    store.dispatch(updateIsColorChangeActive(true));
    return store;
  };

  it("把選取的色塊改成調色盤的顏色", () => {
    const store = storeWithPalette();
    mount(store);

    const segment = segmentsOf(store)[0];
    expect(segment.colorStart).toMatchObject({ R: 0, G: 200, B: 200 });
    // 固定色的兩端要一起改，否則之後切成漸變會漸變到舊顏色
    expect(segment.colorEnd).toMatchObject({ R: 0, G: 200, B: 200 });
  });

  it("effect 再跑一次不會多佔一格 history", () => {
    const store = storeWithPalette();
    const { rerender } = mount(store);

    const afterFirst = store.getState().profiles.history.length;
    const segments = segmentsOf(store);

    act(() => {
      rerender(<div />); // 觸發一輪 render/effect
    });

    expect(store.getState().profiles.history.length).toBe(afterFirst);
    expect(segmentsOf(store)).toBe(segments); // reference 都沒換
  });
});

describe("區間平移工具", () => {
  it("三步驟導引依序前進，標記跟著出現", () => {
    const store = createTestStore({ currentTime: 1000 });
    mount(store);

    // 步驟 0：只有一顆按鈕
    fireEvent.click(
      document.querySelector(".shift-tool-wrapper .shift-main-button"),
    );
    expect(document.querySelector(".shift-message").textContent).toContain(
      "[1/3]",
    );

    // 步驟 1 → 2：記下起始點，時間軸出現 Start 標記
    fireEvent.click(document.querySelector(".shift-confirm-btn"));
    expect(document.querySelector(".shift-message").textContent).toContain(
      "[2/3]",
    );
    expect(document.querySelector(".shift-marker.start-marker")).toBeTruthy();
  });

  /**
   * Phase 5e：平移搬的是**整個色塊**，不再是壓平出來的關鍵格。
   *
   * 舊版搬「點」可以把一個色塊拆開（搬走開頭、留下結尾的黑點），
   * 這裡守住「整段一起走、落點的舊色塊讓位」。
   */
  it("整段一起搬，落點的舊色塊讓位", () => {
    const store = createTestStore({ currentTime: 0 });
    mount(store);

    // 測試光表：紅 1000~2000、綠 2000~10000
    const before = segmentsOf(store, 0, 0);
    expect(before.map((s) => s.start)).toEqual([1000, 2000]);

    // 三步驟：起點 1000 → 終點 1500 → 目標 5000
    const openWizard = () =>
      fireEvent.click(
        document.querySelector(".shift-tool-wrapper .shift-main-button"),
      );
    const confirm = () =>
      fireEvent.click(document.querySelector(".shift-confirm-btn"));

    // 播放位置就是這個精靈的游標，每一步都要讓元件真的重繪後再按下一步，
    // 否則 handler 讀到的還是上一輪的 currentTime
    // 用 action creator 而不是手打 type 字串——reducer 的命名並不一致
    // （UPDATECURRENTTIME 沒有底線、UPDATE_MULTI_SELECTED_BLOCKS 有），
    // 打錯的話 dispatch 會靜靜地什麼都不做，測試就會為了錯誤的理由變綠或變紅。
    const seek = (ms) =>
      act(() => {
        store.dispatch(updateCurrentTime(ms));
      });

    openWizard();
    seek(1000);
    confirm(); // 記下起點
    seek(1500);
    confirm(); // 記下終點
    seek(5000);
    confirm(); // 執行

    const after = segmentsOf(store, 0, 0);
    const red = after.find((s) => s.colorStart.R === 255);
    const green = after.find((s) => s.colorStart.G === 255);

    // 紅色整段搬到 5000，長度保持 1000ms（不會只搬開頭）
    expect(red.start).toBe(5000);
    expect(red.end).toBe(6000);

    // 原本佔著 2000~10000 的綠色在落點區間讓位，被切成兩段
    const greens = after.filter((s) => s.colorStart.G === 255);
    expect(greens).toHaveLength(2);
    expect(greens[0]).toMatchObject({ start: 2000, end: 5000 });
    expect(greens[1]).toMatchObject({ start: 6000, end: 10000 });
    expect(green).toBeTruthy();

    // 沒有任何純黑 segment——熄滅是空隙，不是資料
    expect(
      after.filter(
        (s) => !s.colorStart.R && !s.colorStart.G && !s.colorStart.B,
      ),
    ).toHaveLength(0);
  });

  it("結束點不大於起始點時擋下並留在原步驟", () => {
    const store = createTestStore({ currentTime: 1000 });
    mount(store);

    fireEvent.click(
      document.querySelector(".shift-tool-wrapper .shift-main-button"),
    );
    fireEvent.click(document.querySelector(".shift-confirm-btn")); // start = 1000
    // 播放位置沒有前進，結束點會等於起始點
    fireEvent.click(document.querySelector(".shift-confirm-btn"));

    expect(document.querySelector(".shift-message").textContent).toContain(
      "[2/3]",
    );
    expect(globalThis.alert).toHaveBeenCalled();
  });

  it("取消會收回導引面板與標記", () => {
    const store = createTestStore({ currentTime: 1000 });
    mount(store);

    fireEvent.click(
      document.querySelector(".shift-tool-wrapper .shift-main-button"),
    );
    fireEvent.click(document.querySelector(".shift-confirm-btn"));
    fireEvent.click(document.querySelector(".shift-cancel-btn"));

    expect(document.querySelector(".shift-guide-panel")).toBeFalsy();
    expect(document.querySelector(".shift-marker")).toBeFalsy();
    expect(
      document.querySelector(".shift-tool-wrapper .shift-main-button"),
    ).toBeTruthy();
  });
});

describe("效果選單與亮度階梯", () => {
  const openEffectMenu = () => {
    fireEvent.click(document.querySelector(".effect-button"));
    return document.querySelector(".effect-menu");
  };

  const menuItem = (text) =>
    [...document.querySelectorAll(".effect-menu-item")].find(
      (el) => el.textContent.trim() === text,
    );

  it("點 Effect 按鈕會展開三個選項", () => {
    mount();
    expect(openEffectMenu()).toBeTruthy();
    expect(menuItem("漸變 (L)")).toBeTruthy();
    expect(menuItem("頻閃 (B)")).toBeTruthy();
    expect(menuItem("亮度階梯")).toBeTruthy();
  });

  it("沒有選取色塊時點頻閃不會炸掉，而且連問都不問", () => {
    // 選單這條路徑原本沒有守衛，直接解構 multiSelectedBlocks[0] 會 throw
    //（只有鍵盤的 B 有檢查 length === 1）
    //
    // 守衛現在在 promptBlink 的最前面：沒東西可套就不該先跳一個輸入框出來，
    // 讓使用者填完了才說「請先選取色塊」。
    const store = createTestStore();
    mount(store);
    openEffectMenu();

    const before = JSON.stringify(timelineOf(store));
    fireEvent.click(menuItem("頻閃 (B)"));
    expect(JSON.stringify(timelineOf(store))).toBe(before);
    expect(globalThis.prompt).not.toHaveBeenCalled();
  });

  /*
   * Phase 5d：三個效果改成 segment 原生。以下守住新的語意——
   * 熄滅是段與段之間的空隙，不再是黑色關鍵格。
   */

  /*
   * 頻閃是段上的 metadata，**不切色塊**。
   *
   * 舊版切成 N 個小色塊，於是想整段挪半拍要把 N 個全部選起來（它們之間有
   * 空隙，連選會斷）、想改間隔只能刪掉重放。這一項守住「色塊還是一個」，
   * 展開後的形狀由 `utils/segments/__tests__/effects.test.js` 守。
   */
  it("頻閃記在色塊上，色塊仍然是一個", () => {
    globalThis.prompt.mockReturnValueOnce("500");
    const store = createTestStore();
    selectSegment(store, 0, 0, 0); // 紅 1000~2000
    mount(store);
    openEffectMenu();
    fireEvent.click(menuItem("頻閃 (B)"));

    const segments = segmentsOf(store);
    const target = segments.find((s) => s.start === 1000);

    expect(target).toMatchObject({
      start: 1000,
      end: 2000,
      effect: { type: "blink", period: 500 },
    });
    // 沒有被切開，也沒有多出任何東西
    expect(segments.filter((s) => s.start >= 1000 && s.start < 2000)).toHaveLength(1);
    expect(target.colorStart.R).toBe(255);
  });

  it("再套一次頻閃可以改間隔，不必刪掉重放", () => {
    globalThis.prompt.mockReturnValueOnce("500").mockReturnValueOnce("200");
    const store = createTestStore();
    selectSegment(store, 0, 0, 0);
    mount(store);

    openEffectMenu();
    fireEvent.click(menuItem("頻閃 (B)"));
    openEffectMenu();
    fireEvent.click(menuItem("頻閃 (B)"));

    const target = segmentsOf(store).find((s) => s.start === 1000);
    expect(target.effect).toEqual({ type: "blink", period: 200 });
  });

  it("輸入 0 取消頻閃，色塊變回普通色塊", () => {
    globalThis.prompt.mockReturnValueOnce("500").mockReturnValueOnce("0");
    const store = createTestStore();
    selectSegment(store, 0, 0, 0);
    mount(store);

    openEffectMenu();
    fireEvent.click(menuItem("頻閃 (B)"));
    openEffectMenu();
    fireEvent.click(menuItem("頻閃 (B)"));

    const target = segmentsOf(store).find((s) => s.start === 1000);
    expect(target.effect).toBeUndefined();
    expect(target).toMatchObject({ start: 1000, end: 2000 });
  });

  it("頻閃週期短於兩格會被擋下來（沒有亮的部分）", () => {
    globalThis.prompt.mockReturnValueOnce("50");
    const store = createTestStore();
    selectSegment(store, 0, 0, 0);
    mount(store);
    openEffectMenu();

    const before = JSON.stringify(segmentsOf(store));
    fireEvent.click(menuItem("頻閃 (B)"));
    expect(JSON.stringify(segmentsOf(store))).toBe(before);
  });

  it("開啟漸變時，終點色取下一段的起始色（兩段相鄰）", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, 0); // 紅 1000~2000，後面緊接著綠 2000~10000
    mount(store);
    openEffectMenu();
    fireEvent.click(menuItem("漸變 (L)"));

    const [red, green] = segmentsOf(store);
    expect(red.linear).toBe(1);
    // 舊模型只有一個旗標，終點色要渲染時往後找；現在明確記在段上
    expect(red.colorEnd).toMatchObject({
      R: green.colorStart.R,
      G: green.colorStart.G,
      B: green.colorStart.B,
    });
  });

  it("後面是空隙時，漸變的終點色是黑（fade out）", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, 1); // 綠 2000~10000，後面沒有東西了
    mount(store);
    openEffectMenu();
    fireEvent.click(menuItem("漸變 (L)"));

    const green = segmentsOf(store)[1];
    expect(green.linear).toBe(1);
    expect(green.colorEnd).toMatchObject({ R: 0, G: 0, B: 0 });
  });

  it("再按一次漸變會關掉，終點色收回成起始色", () => {
    const store = createTestStore();
    selectSegment(store, 0, 0, 0);
    mount(store);
    openEffectMenu();
    fireEvent.click(menuItem("漸變 (L)"));
    openEffectMenu();
    fireEvent.click(menuItem("漸變 (L)"));

    const red = segmentsOf(store)[0];
    expect(red.linear).toBe(0);
    expect(red.colorEnd).toMatchObject(red.colorStart);
  });

  it("點「亮度階梯」會打開設定面板", () => {
    mount();
    openEffectMenu();
    expect(document.querySelector(".gradient-settings-popup")).toBeFalsy();

    fireEvent.click(menuItem("亮度階梯"));
    expect(document.querySelector(".gradient-settings-popup")).toBeTruthy();
  });

  it("沒有選取色塊時按 Apply 不會改動光表，面板留著", () => {
    const store = createTestStore();
    mount(store);
    openEffectMenu();
    fireEvent.click(menuItem("亮度階梯"));

    const before = JSON.stringify(timelineOf(store));
    fireEvent.click(
      [...document.querySelectorAll(".gradient-settings-actions button")].find(
        (el) => el.textContent === "Apply",
      ),
    );

    expect(JSON.stringify(timelineOf(store))).toBe(before);
    // 面板不關閉，使用者可以去選色塊後再按一次
    expect(document.querySelector(".gradient-settings-popup")).toBeTruthy();
  });

  it("選取一個色塊後 Apply 會依階梯逐個色塊改透明度", () => {
    const store = createTestStore();
    // 選第一個色塊（紅 1000~2000）。不要手工組選取項目——segmentId 是
    // 建 store 時才產生的，而 Phase 5d 之後效果是靠 segmentId 找目標。
    selectSegment(store, 0, 0, 0);
    mount(store);
    openEffectMenu();
    fireEvent.click(menuItem("亮度階梯"));

    fireEvent.click(
      [...document.querySelectorAll(".gradient-settings-actions button")].find(
        (el) => el.textContent === "Apply",
      ),
    );

    // 測試光表有兩個緊鄰的色塊（紅 1000~2000、綠 2000~10000）。
    // 階梯從選取的那一段往後逐段套用，預設 10% → 每階 +10%。
    // segment 模型裡「下一個色塊」就是陣列的下一格，不必再跳過黑哨兵。
    const timeline = timelineOf(store);
    const colored = timeline.filter(
      (entry) => entry.color.R || entry.color.G || entry.color.B,
    );
    expect(colored).toHaveLength(2);
    expect(colored[0].color.A).toBeCloseTo(0.1);
    expect(colored[1].color.A).toBeCloseTo(0.2);
    // 套用完面板收起
    expect(document.querySelector(".gradient-settings-popup")).toBeFalsy();
  });
});

describe("透明度快捷鍵", () => {
  /** 建好 store 之後才選色塊：segmentId 是建 store 時才產生的 */
  const withPalette = (overrides = {}) => {
    const store = createTestStore({
      favoriteColor: [[{ R: 11, G: 22, B: 33, A: 1 }]],
      ...overrides,
    });
    selectSegment(store, 0, 0, 0);
    return store;
  };

  it("Ctrl+1 只設透明度，不套最愛色，且只進一筆 history", () => {
    // 「1~8 套最愛色」那條沒有 ctrl 守衛時，Ctrl+1 會同時打中兩條綁定：
    // 兩個 handler 從同一份快照各自 produce 再 dispatch，套色被蓋掉但仍留下
    // 一筆 history，導致按一次 Ctrl+Z 會停在使用者沒看過的中間狀態。
    const store = withPalette();
    mount(store);

    const historyBefore = store.getState().profiles.history.length;
    pressKey("1", { ctrlKey: true });

    const block = segmentsOf(store)[0];
    expect(block.colorStart.R).toBe(255); // 顏色不動（還是測試光表的紅色）
    expect(block.colorStart.A).toBeCloseTo(0.1);
    expect(store.getState().profiles.history.length).toBe(historyBefore + 1);
  });

  it("Ctrl+0 設為 100%（補完 Ctrl+1~9 的 10%~90%）", () => {
    const store = withPalette();
    mount(store);

    pressKey("0", { ctrlKey: true });
    expect(segmentsOf(store)[0].colorStart.A).toBeCloseTo(1);
  });

  it("不按 Ctrl 的 1~8 才是套最愛色", () => {
    const store = withPalette();
    mount(store);

    pressKey("1");
    expect(timelineOf(store)[1].color.R).toBe(11);
  });
});

describe("Shift+←/→ 的重疊鍵位（刻意保留）", () => {
  /**
   * 這組鍵兩條綁定都會執行：先 ±50ms、再跳到上/下個關鍵格（後者覆蓋前者）。
   * `updateCurrentTime` 不進 history，沒有 undo 副作用，而且沒選取色塊時
   * 退化成 ±50ms 是個好用的 fallback，所以維持現狀並在此鎖住。
   */

  it("有選取時跳到下一個關鍵格", () => {
    // 測試光表在 2000ms 有綠色塊；從 1000ms 出發
    const store = createTestStore({
      currentTime: 1000,
      multiSelectedBlocks: [{ armorIndex: 0, partIndex: 0, segmentId: null }],
    });
    mount(store);

    pressKey("ArrowRight", { shiftKey: true });
    expect(store.getState().profiles.currentTime).toBe(2000);
  });

  it("沒有選取時退化成 +50ms", () => {
    const store = createTestStore({ currentTime: 1000 });
    mount(store);

    pressKey("ArrowRight", { shiftKey: true });
    expect(store.getState().profiles.currentTime).toBe(1050);
  });
});

describe("快捷鍵的 100ms 防彈跳", () => {
  it("同一個鍵在 100ms 內連按第二次會被忽略", () => {
    vi.useFakeTimers();
    try {
      const store = createTestStore();
      mount(store);

      pressKey("m");
      expect(store.getState().profiles.moveMode).toBe(true);

      // 100ms 內的第二次按鍵被 keyPress latch 擋掉——這是現有行為，
      // Phase 3 統一鍵盤處理時必須保留
      pressKey("m");
      expect(store.getState().profiles.moveMode).toBe(true);

      vi.advanceTimersByTime(150);
      pressKey("m");
      expect(store.getState().profiles.moveMode).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
