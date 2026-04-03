// 純資料檔：本地 musicsrc/ 音樂，不含 React 元件
import music0 from "./musicsrc/2026_funding.mp3";
import music1 from "./musicsrc/3.mp3";
import music2 from "./musicsrc/4.mp3";
import music3 from "./musicsrc/5.mp3";
import music4 from "./musicsrc/Clean Bandit - Symphony.mp3";
import music5 from "./musicsrc/fixed_audio.mp3";
import music6 from "./musicsrc/lightdance V2.mp3";
import music7 from "./musicsrc/lightdance V3.mp3";
import music8 from "./musicsrc/SoundHelix-Song-9.mp3";
import music9 from "./musicsrc/test1.mp3";
import music10 from "./musicsrc/test2.mp3";

// 檔名 → Vite 打包 URL (不需後端即可播放)
export const localMusicMap = {
  "2026_funding.mp3": music0,
  "3.mp3": music1,
  "4.mp3": music2,
  "5.mp3": music3,
  "Clean Bandit - Symphony.mp3": music4,
  "fixed_audio.mp3": music5,
  "lightdance V2.mp3": music6,
  "lightdance V3.mp3": music7,
  "SoundHelix-Song-9.mp3": music8,
  "test1.mp3": music9,
  "test2.mp3": music10,
};

export const localMusicFiles = Object.keys(localMusicMap);

export const musicNames = [
  "2026 Funding", "Track 3", "Track 4", "Track 5", "Symphony",
  "Fixed Audio", "Lightdance V2", "Lightdance V3", "SoundHelix 9",
  "Test 1", "Test 2", "Test 3", "Test 4"
];
