import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAudioEngine } from "../engine.js";

/**
 * 假的 Web Audio。
 *
 * 只實作引擎真的用到的東西，並且**把每次 start 的參數記下來**——排程對不對
 * 就是看那些數字。jsdom 沒有 Web Audio，而真瀏覽器裡又沒辦法問「你把這個
 * source 排在第幾秒」，所以這是唯一驗得到接縫的方式。
 */
const makeFakeAudio = () => {
  const started = [];
  const ramps = [];
  let currentTime = 0;

  const makeGain = () => ({
    gain: {
      value: 1,
      setValueAtTime: (value, when) => ramps.push({ kind: "set", value, when }),
      linearRampToValueAtTime: (value, when) =>
        ramps.push({ kind: "ramp", value, when }),
    },
    connect: (next) => next,
    disconnect: () => {},
  });

  const context = {
    state: "suspended",
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    close: vi.fn(),
    destination: {},
    get currentTime() {
      return currentTime;
    },
    createGain: makeGain,
    createBufferSource() {
      const source = {
        buffer: null,
        playbackRate: { value: 1 },
        onended: null,
        connect: (next) => next,
        disconnect: () => {},
        stop: vi.fn(),
        start: (when, offset, duration) =>
          started.push({ when, offset, duration, source }),
      };
      return source;
    },
    decodeAudioData: async (data) => ({ duration: 30, __from: data }),
  };

  return {
    context,
    started,
    ramps,
    advance: (seconds) => {
      currentTime += seconds;
    },
    now: () => currentTime,
  };
};

const clip = (over = {}) => ({
  id: "c",
  start: 0,
  end: 10000,
  sourceFile: "a.mp3",
  sourceOffset: 0,
  ...over,
});

const threeSongs = [
  clip({ id: "a", start: 0, end: 10000, sourceFile: "a.mp3" }),
  clip({ id: "b", start: 10000, end: 20000, sourceFile: "b.mp3" }),
  clip({ id: "c", start: 20000, end: 35000, sourceFile: "c.mp3" }),
];

let fake;
let fetched;

const makeEngine = () => {
  fake = makeFakeAudio();
  fetched = [];
  return createAudioEngine({
    createContext: () => fake.context,
    fetchAudio: async (url) => {
      fetched.push(url);
      return `bytes:${url}`;
    },
  });
};

describe("生命週期", () => {
  it("還沒播放就不會建立 AudioContext", () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    // createContext 沒被呼叫過的話 state 還是初始值
    expect(fake.context.resume).not.toHaveBeenCalled();
  });

  /*
   * 舊版在元件掛載時就 new 一個 AudioContext，那時還沒有使用者手勢，
   * Chrome 給的是 suspended 的 context 而且**沒有任何地方呼叫 resume()**。
   * 現在能動是撞運氣。
   */
  it("第一次播放會 resume（自動播放政策會給 suspended 的 context）", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);
    expect(fake.context.resume).toHaveBeenCalled();
    expect(fake.context.state).toBe("running");
  });

  /*
   * 這是 e2e 抓到的回歸。resume 原本放在載入路徑裡，而沒有使用者手勢時
   * Chrome 的 `resume()` promise 會**一直 pending**（不是 reject，是永遠不
   * settle）——整個載入就卡在那裡，duration 出不來、波形是空白的。
   */
  it("載入不會等 resume（沒有手勢時那個 promise 永遠不會 settle）", async () => {
    const engine = makeEngine();
    // 讓 resume 永遠不 settle，模擬沒有使用者手勢的情形
    fake.context.resume = vi.fn(() => new Promise(() => {}));

    const buffer = await engine.load("a.mp3");
    expect(buffer.duration).toBe(30);
    expect(fake.context.resume).not.toHaveBeenCalled();
  });

  it("dispose 會關掉 context", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);
    engine.dispose();
    expect(fake.context.close).toHaveBeenCalled();
  });
});

describe("解碼快取", () => {
  it("同一個檔案只抓一次", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);
    engine.pause();
    await engine.play(0);
    expect(fetched.filter((url) => url === "a.mp3")).toHaveLength(1);
  });

  it("load 對外開放，讓波形共用同一份解碼結果", async () => {
    const engine = makeEngine();
    const buffer = await engine.load("a.mp3");
    expect(buffer.duration).toBe(30);
    // 再要一次不會重抓——波形與播放共用快取
    await engine.load("a.mp3");
    expect(fetched).toEqual(["a.mp3"]);
  });

  it("同一個檔案被兩個 clip 用到也只抓一次", async () => {
    const engine = makeEngine();
    engine.setClips([
      clip({ id: "x", start: 0, end: 5000, sourceFile: "same.mp3" }),
      clip({ id: "y", start: 5000, end: 9000, sourceFile: "same.mp3" }),
    ]);
    await engine.play(0);
    expect(fetched).toEqual(["same.mp3"]);
  });
});

describe("排程", () => {
  it("一次把所有 clip 排好，不等前一首播完", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);

    expect(fake.started).toHaveLength(3);
    expect(fake.started.map((s) => s.when)).toEqual([0, 10, 20]);
    expect(fake.started.map((s) => s.duration)).toEqual([10, 10, 15]);
  });

  it("從第二首的中間開始：只排剩下的，並從音檔對應的位置取", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(15000);

    expect(fake.started).toHaveLength(2);
    expect(fake.started[0]).toMatchObject({ when: 0, offset: 5, duration: 5 });
    expect(fake.started[1]).toMatchObject({ when: 5, offset: 0, duration: 15 });
  });

  it("2 倍速：啟動時間對半，音檔的 offset 不變", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.setRate(2);
    await engine.play(0);

    expect(fake.started.map((s) => s.when)).toEqual([0, 5, 10]);
    expect(fake.started.map((s) => s.offset)).toEqual([0, 0, 0]);
  });

  /*
   * 已經排好的 `when` 是用舊速率算的。不重排的話後面幾首歌會在錯的時間點進來
   * ——第一首聽起來正常，第二首開始就對不上，很難聯想到是變速造成的。
   */
  it("播放中變速會整批重排", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);
    fake.started.length = 0;

    fake.advance(2); // 播了 2 秒
    await engine.setRate(2);

    // 位置 2000ms，剩下 8 秒的第一首 + 後兩首，用新速率排
    expect(fake.started.map((s) => s.when)).toEqual([2, 6, 11]);
  });

  it("播放中 seek 會重排", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);
    fake.started.length = 0;

    await engine.seek(22000);

    expect(fake.started).toHaveLength(1);
    expect(fake.started[0]).toMatchObject({ offset: 2 });
  });

  it("暫停時 seek 不會出聲，但位置會記住", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.seek(12000);

    expect(fake.started).toHaveLength(0);
    expect(engine.positionMs()).toBe(12000);
  });
});

describe("位置", () => {
  it("播放中隨 context 時鐘前進", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);

    fake.advance(3);
    expect(engine.positionMs()).toBeCloseTo(3000);
  });

  it("2 倍速時走得快一倍", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.setRate(2);
    await engine.play(0);

    fake.advance(3);
    expect(engine.positionMs()).toBeCloseTo(6000);
  });

  /* 這是舊公式錯的那個情境：從中間起、非 1 倍速 */
  it("從第 15 秒用 2 倍速播 3 秒 → 21 秒", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.setRate(2);
    await engine.play(15000);

    fake.advance(3);
    expect(engine.positionMs()).toBeCloseTo(21000);
  });

  it("暫停之後位置停住不動", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);

    fake.advance(4);
    const at = engine.pause();
    expect(at).toBeCloseTo(4000);

    fake.advance(10);
    expect(engine.positionMs()).toBeCloseTo(4000);
  });

  it("再按播放會從暫停的地方繼續", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);
    fake.advance(4);
    engine.pause();
    fake.started.length = 0;

    await engine.play();
    expect(fake.started[0]).toMatchObject({ offset: 4 });
  });

  it("不會超過整場長度", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);

    fake.advance(999);
    expect(engine.positionMs()).toBe(35000);
  });
});

describe("結束通知", () => {
  /*
   * 只掛在最後一個 clip 上。每個都掛的話，每首歌播完都會通知一次「播放結束」，
   * 播放鍵會在接縫處自己跳掉。
   */
  it("只有最後一首播完才通知", async () => {
    const engine = makeEngine();
    const ended = vi.fn();
    engine.onEnded(ended);
    engine.setClips(threeSongs);
    await engine.play(0);

    const withHandler = fake.started.filter((s) => s.source.onended);
    expect(withHandler).toHaveLength(1);

    withHandler[0].source.onended();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(engine.isPlaying()).toBe(false);
  });

  it("自己停下來時不會誤發結束通知", async () => {
    const engine = makeEngine();
    const ended = vi.fn();
    engine.onEnded(ended);
    engine.setClips(threeSongs);
    await engine.play(0);
    engine.pause();

    expect(ended).not.toHaveBeenCalled();
  });
});

describe("淡入淡出", () => {
  it("有淡入淡出時排包絡，沒有時只設一個固定值", async () => {
    const engine = makeEngine();
    engine.setClips([clip({ start: 0, end: 10000, fadeIn: 1000, fadeOut: 2000 })]);
    await engine.play(0);

    expect(fake.ramps.map((r) => [r.kind, r.value, r.when])).toEqual([
      ["set", 0, 0],
      ["ramp", 1, 1],
      ["ramp", 1, 8],
      ["ramp", 0, 10],
    ]);
  });

  it("接縫重疊時兩個 clip 各有自己的包絡", async () => {
    const engine = makeEngine();
    engine.setClips([
      clip({ id: "a", start: 0, end: 10000, fadeOut: 500, sourceFile: "a.mp3" }),
      clip({ id: "b", start: 9500, end: 20000, fadeIn: 500, sourceFile: "b.mp3" }),
    ]);
    await engine.play(0);

    expect(fake.started).toHaveLength(2);
    // a 在 9.5s 開始淡出到 10s，b 在 9.5s 從 0 淡入到 10s
    expect(fake.ramps.some((r) => r.value === 0 && r.when === 10)).toBe(true);
    expect(fake.ramps.some((r) => r.kind === "set" && r.when === 9.5)).toBe(true);
  });
});

describe("換內容", () => {
  it("播放中換掉 clip 會停下來", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.play(0);
    expect(engine.isPlaying()).toBe(true);

    engine.setClips([clip({ start: 0, end: 5000 })]);
    expect(engine.isPlaying()).toBe(false);
  });

  it("換成比較短的內容時位置會被夾住", async () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    await engine.seek(30000);

    engine.setClips([clip({ start: 0, end: 5000 })]);
    expect(engine.positionMs()).toBe(5000);
  });

  it("整場長度是最後一個 clip 的結尾", () => {
    const engine = makeEngine();
    engine.setClips(threeSongs);
    expect(engine.durationMs()).toBe(35000);
  });
});

describe("解碼結果的回收", () => {
  /*
   * ⚠️ 這一組守的是**整個編輯器最大的記憶體項目**。
   *
   * 解碼後的音訊在記憶體裡是 Float32：`時長 × 取樣率 × 聲道 × 4 bytes`，
   * 立體聲 44.1kHz 每分鐘約 17MB。舊版只有 `dispose()`（離開編輯器）才清，
   * 所以同一次工作階段裡試聽過的每一首都一直留著——換過十首歌就是好幾百 MB，
   * 而畫面上完全看不出來，只覺得越用越卡。
   */

  it("留下還在用的，丟掉不在清單裡的", async () => {
    const engine = makeEngine();
    await engine.load("a.mp3");
    await engine.load("b.mp3");
    await engine.load("c.mp3");
    expect(engine.cachedCount()).toBe(3);

    const dropped = engine.keepOnly(["a.mp3", "c.mp3"]);

    expect(dropped).toBe(1);
    expect(engine.cachedCount()).toBe(2);
  });

  it("被丟掉的那份下次要用會重新抓", async () => {
    const engine = makeEngine();
    await engine.load("a.mp3");
    engine.keepOnly([]);

    fetched.length = 0;
    await engine.load("a.mp3");
    expect(fetched).toEqual(["a.mp3"]);
  });

  it("還留著的那份不會重抓（快取仍然有效）", async () => {
    const engine = makeEngine();
    await engine.load("a.mp3");
    engine.keepOnly(["a.mp3"]);

    fetched.length = 0;
    await engine.load("a.mp3");
    expect(fetched).toEqual([]);
  });

  it("Set 與陣列都收", async () => {
    const engine = makeEngine();
    await engine.load("a.mp3");
    await engine.load("b.mp3");

    expect(engine.keepOnly(new Set(["a.mp3"]))).toBe(1);
    expect(engine.cachedCount()).toBe(1);
  });

  it("沒給參數時全部丟掉，而不是全部留著", () => {
    /*
     * 這個方向很重要：漏傳參數若被當成「留全部」，那這個功能等於沒開，
     * 而且完全沒有症狀。寧可丟掉（下次用再抓一次，只是慢一點）。
     */
    const engine = makeEngine();
    expect(() => engine.keepOnly()).not.toThrow();
    expect(engine.cachedCount()).toBe(0);
  });

  it("正在解碼中的也一併放掉，否則它解完又會塞回去", async () => {
    const engine = makeEngine();
    const pending = engine.load("a.mp3");
    engine.keepOnly([]);
    await pending;

    // inflight 被移除，所以下一次 load 是重新抓一份
    fetched.length = 0;
    await engine.load("a.mp3");
    expect(fetched).toEqual(["a.mp3"]);
  });
});
