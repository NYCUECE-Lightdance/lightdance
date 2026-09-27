import { describe, it, expect } from "vitest";

import profiles from "../reducers/profiles.js";
import {
  updateAudioClips,
  updateAudioOverlap,
  updateMusicFilename,
} from "../actions.js";
import {
  MAX_OVERLAP_MS,
  createClip,
  migrateClips,
  removeClip,
  resequence,
} from "../../utils/audio/clips.js";

/**
 * 音訊時間軸在 reducer 層的行為。
 *
 * 清單本身的規則（順序、位置、接縫）已經在 `utils/audio/__tests__/clips.test.js`
 * 窮舉過，這裡只驗**接線**：
 *
 * 1. `music_filename` 有沒有跟著第一首走——後端的 raw_data、舊備份、Dashboard
 *    的清單都認得那個欄位，兩份各存各的遲早會對不起來
 * 2. 舊的單曲入口（`updateMusicFilename`）會不會把多曲的清單洗掉
 */

const reduce = (actions, state) =>
  actions.reduce((acc, action) => profiles(acc, action), state);

const initial = () => profiles(undefined, { type: "@@INIT" });

const clipsOf = (...files) =>
  resequence(files.map((file) => createClip({ sourceFile: file, durationMs: 10000 })));

describe("UPDATEAUDIOCLIPS", () => {
  it("music_filename 跟著第一首走", () => {
    const state = reduce([updateAudioClips(clipsOf("a.mp3", "b.mp3"))], initial());

    expect(state.data.audioClips).toHaveLength(2);
    expect(state.data.music_filename).toBe("a.mp3");
  });

  it("換掉第一首時 music_filename 一起換", () => {
    const state = reduce(
      [updateAudioClips(clipsOf("a.mp3", "b.mp3")), updateAudioClips(clipsOf("b.mp3"))],
      initial(),
    );

    expect(state.data.music_filename).toBe("b.mp3");
  });

  /*
   * 這一則守的是一個實際踩到的 bug。
   *
   * `music_filename` 是清單的投影，而**投影必須是全域的**：空清單投影出來是
   * 空字串。先前這裡寫的是「空清單就保留舊檔名」，於是讀取端的 `migrateClips`
   * 看到「沒有 clip 但有 music_filename」，判定成還沒遷移的舊單曲專案，
   * 幫忙生一個 clip 回來——使用者按下移除，那首歌自己長回來。
   */
  it("清空清單時 music_filename 一起清掉，移除的歌不會自己長回來", () => {
    const state = reduce(
      [updateAudioClips(clipsOf("a.mp3")), updateAudioClips([])],
      initial(),
    );

    expect(state.data.audioClips).toEqual([]);
    expect(state.data.music_filename).toBe("");
    // 讀取端看到的也必須是空的
    expect(migrateClips(state.data.audioClips, state.data.music_filename)).toEqual([]);
  });

  it("移除最後一首之後，讀取端不會再把它變出來", () => {
    const clips = clipsOf("solo.mp3");
    let state = profiles(initial(), updateAudioClips(clips));
    state = profiles(
      state,
      updateAudioClips(removeClip(state.data.audioClips, clips[0].id)),
    );

    expect(migrateClips(state.data.audioClips, state.data.music_filename)).toEqual([]);
  });

  it("同一份清單再 dispatch 一次是同一個 state", () => {
    const clips = clipsOf("a.mp3");
    const first = profiles(initial(), updateAudioClips(clips));

    expect(profiles(first, updateAudioClips(clips))).toBe(first);
  });

  it("不是陣列就當空清單，不讓壞資料流進播放路徑", () => {
    const state = profiles(initial(), updateAudioClips(null));
    expect(state.data.audioClips).toEqual([]);
  });
});

describe("UPDATEAUDIOOVERLAP", () => {
  it("改接縫會把整張清單重排一次——位置與重疊不能各存各的", () => {
    const state = reduce(
      [updateAudioClips(clipsOf("a.mp3", "b.mp3")), updateAudioOverlap(1000)],
      initial(),
    );

    expect(state.data.audioOverlapMs).toBe(1000);
    expect(state.data.audioClips[1].start).toBe(9000); // 10000 - 1000
    expect(state.data.audioClips[0].fadeOut).toBe(1000);
  });

  it("夾在 0 與上限之間", () => {
    expect(profiles(initial(), updateAudioOverlap(-1)).data.audioOverlapMs).toBe(0);
    expect(profiles(initial(), updateAudioOverlap(1e9)).data.audioOverlapMs).toBe(
      MAX_OVERLAP_MS,
    );
    expect(profiles(initial(), updateAudioOverlap("x")).data.audioOverlapMs).toBe(0);
  });

  it("值沒變就不動 state", () => {
    const state = profiles(initial(), updateAudioClips(clipsOf("a.mp3")));
    expect(profiles(state, updateAudioOverlap(0))).toBe(state);
  });

  it("之後加進來的歌也吃同一個接縫", () => {
    const state = reduce(
      [updateAudioOverlap(500), updateAudioClips(clipsOf("a.mp3", "b.mp3"))],
      initial(),
    );

    // 加進來的清單本身是用 overlap 0 排的，overlap 存在 state 上供呼叫端使用
    expect(state.data.audioOverlapMs).toBe(500);
  });
});

describe("UPDATEMUSICFILENAME（舊的單曲入口）", () => {
  it("換一首歌 = 換掉整張清單", () => {
    const state = reduce(
      [updateAudioClips(clipsOf("a.mp3", "b.mp3")), updateMusicFilename("c.mp3")],
      initial(),
    );

    expect(state.data.audioClips).toHaveLength(1);
    expect(state.data.audioClips[0].sourceFile).toBe("c.mp3");
  });

  /*
   * 這一則是這個檔案存在的主要理由。
   *
   * 載入多曲專案時 envelope 的 `music_filename` 就是第一首，載入路徑會照順序
   * dispatch music_filename → audioClips。若 UPDATEMUSICFILENAME 無條件重設
   * 清單，先 dispatch 的那一下會把後面幾首丟掉；順序反過來寫的人也不會發現，
   * 因為畫面上「有一首歌、波形也畫得出來」看起來完全正常。
   */
  it("第一首已經是它時不動清單——多曲專案載入時會踩到", () => {
    const clips = clipsOf("a.mp3", "b.mp3", "c.mp3");
    const state = reduce(
      [updateAudioClips(clips), updateMusicFilename("a.mp3")],
      initial(),
    );

    expect(state.data.audioClips).toBe(clips);
  });

  it("清成空字串時清單也清空", () => {
    const state = reduce(
      [updateAudioClips(clipsOf("a.mp3")), updateMusicFilename("")],
      initial(),
    );

    expect(state.data.audioClips).toEqual([]);
  });
});
