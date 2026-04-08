// MusicSelector — 從後端 /get_music_list/{user} 讀清單，提供下拉切換音樂。
// 從 audioplayer.jsx 抽出 (Phase 0.5 Step 3)。
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateMusicFilename } from "../../redux/actions.js";
import { API_ENDPOINTS } from "../../config/api.js";

export default function MusicSelector({ onChangeStopPlaying }) {
  const dispatch = useDispatch();
  const userName = useSelector((state) => state.profiles.user);
  const musicFilename =
    useSelector((state) => state.profiles.data?.music_filename) ||
    "2026_funding.mp3";
  const [apiMusicList, setApiMusicList] = useState([]);

  useEffect(() => {
    if (!userName) return;
    (async () => {
      try {
        const res = await fetch(`${API_ENDPOINTS.BASE}/get_music_list/${userName}`);
        const data = await res.json();
        if (data?.music_list) setApiMusicList(data.music_list);
      } catch (err) {
        console.error("抓取音樂清單失敗:", err);
      }
    })();
  }, [userName]);

  const handleChange = (e) => {
    dispatch(updateMusicFilename(e.target.value));
    onChangeStopPlaying?.();
  };

  return (
    <div
      className="current-track-display"
      style={{ marginRight: "10px", display: "flex", alignItems: "center" }}
    >
      <div className="dropdown">
        <select
          className="dropdown-select"
          value={musicFilename}
          onChange={handleChange}
          style={{
            minWidth: "150px",
            backgroundColor: "#2c3e50",
            color: "white",
            border: "1px solid #34495e",
            borderRadius: "4px",
            padding: "5px",
          }}
        >
          {!apiMusicList.includes(musicFilename) && (
            <option value={musicFilename}>{musicFilename} (目前)</option>
          )}
          {apiMusicList.map((filename, index) => (
            <option key={index} value={filename}>
              🎵 {filename}
            </option>
          ))}
        </select>
        <span className="tooltip">Switch Track</span>
      </div>
    </div>
  );
}
