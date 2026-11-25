import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { LuPlus, LuFolderOpen, LuMusic, LuChevronRight } from "react-icons/lu";
import {
  updateActionTable,
  updateAudioClips,
  updateAudioOverlap,
  updateMusicFilename,
  updateSeason,
} from "../redux/actions";
import { loadProjectData } from "../utils/migration/loadProjectData.js";
import { API_ENDPOINTS } from "../config/api.js";
import { selectSeason, withSeason } from "../utils/season.js";
import "./Dashboard.css"; // 引入外部 CSS

const Dashboard = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const userName = useSelector((state) => state.profiles.user);
  const season = useSelector(selectSeason);

  const [timeList, setTimeList] = useState([]);
  const [musicList, setMusicList] = useState([]);
  const [showMusicMenu, setShowMusicMenu] = useState(false);
  // 後端說今年是哪一年、哪些年份有資料（前端不自己算，見 utils/season.js）
  const [seasonInfo, setSeasonInfo] = useState({ current: null, seasons: [] });

  useEffect(() => {
    fetch(`${API_ENDPOINTS.BASE}/seasons`)
      .then((response) => response.json())
      .then((data) => {
        if (data?.current) setSeasonInfo(data);
      })
      .catch((error) => console.error("Fetch seasons error:", error));
  }, []);

  // 抓取這一年的光表列表（換年份時重抓）
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const response = await fetch(
          withSeason(`${API_ENDPOINTS.TIMELIST}/${userName}`, season),
        );
        const data = await response.json();
        setTimeList(data.list || []);
      } catch (error) {
        console.error("Fetch initial data error:", error);
      }
    };
    fetchInitialData();
  }, [userName, season]);

  // 選單的值：今年一律是 ""（= 不帶 year），存下來的年份剛好等於今年也一樣
  const pickerValue =
    season == null || season === seasonInfo.current ? "" : String(season);
  const olderSeasons = [
    ...new Set([
      ...seasonInfo.seasons,
      ...(season != null ? [season] : []),
    ]),
  ]
    .filter((year) => year !== seasonInfo.current)
    .sort((a, b) => b - a);

  const handleSeasonChange = (event) => {
    const value = event.target.value;
    dispatch(updateSeason(value === "" ? null : Number(value)));
    setShowMusicMenu(false);
  };

  // 抓取音樂清單
  const handleToggleMusic = async () => {
    if (!showMusicMenu) {
      try {
        const response = await fetch(
          withSeason(`${API_ENDPOINTS.BASE}/get_music_list/${userName}`, season),
        );
        const data = await response.json();
        setMusicList(data.music_list || []);
        setShowMusicMenu(true);
      } catch (error) {
        console.error("Fetch music error:", error);
      }
    } else {
      setShowMusicMenu(false);
    }
  };

  const createNewProject = (filename) => {
    dispatch(updateMusicFilename(filename));
    navigate("/home");
  };

  const loadProject = async (user, time) => {
    try {
      const response = await fetch(
        withSeason(`${API_ENDPOINTS.BASE}/raw/${user}/${time}`, season),
      );
      const data = await response.json();
      let actionData, musicFile;

      if (data && data.raw_data) {
        actionData = JSON.parse(data.raw_data);
      } else {
        actionData = data;
      }

      // 統一走遷移入口：伺服器上同時存在 v1（keyframe）與 v2（segment）
      // 兩種 raw_data，由形狀自動辨認並轉成 segments。
      // 這裡還沒載入音檔，duration 未知——舊資料尾端本來就帶著自己的黑點，
      // 不需要 duration 也能正確轉換。
      const { segmentTable, musicFilename, audioClips, overlapMs } =
        loadProjectData(actionData);
      musicFile = musicFilename;

      dispatch(updateActionTable(segmentTable));
      dispatch(updateMusicFilename(musicFile || ""));
      // 音訊時間軸要在 music_filename 之後——後者在檔名不同時會把清單重設成單曲
      dispatch(updateAudioOverlap(overlapMs));
      dispatch(updateAudioClips(audioClips));
      navigate("/home");
    } catch (error) {
      alert("載入失敗: " + error.message);
    }
  };

  // ... 前方 import 與邏輯不變 ...

  return (
    <div className="dashboard-container">
      {/* 左上角歡迎訊息 */}
      <header className="dashboard-header">
        <div className="welcome-message">
          Welcome, <span className="user-highlight">{userName}</span>
        </div>
      </header>

      {/* 上方區域：開始創作與音樂清單延伸 */}
      <div className="upper-section">
        <div className={`creation-bar ${showMusicMenu ? "expanded" : ""}`}>
          <div className="main-action" onClick={handleToggleMusic}>
            <LuPlus className="action-icon" />
            <span className="action-text">開始創作</span>
          </div>

          {showMusicMenu && (
            <div className="music-extension">
              <LuChevronRight className="divider-icon" />
              <div className="music-list-scroll">
                {musicList.map((file, i) => (
                  <div
                    key={i}
                    className="music-item"
                    onClick={() => createNewProject(file)}
                  >
                    <LuMusic className="item-icon" />
                    <span>{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 下方區域 */}
      <div className="lower-section">
        <div className="section-heading">
          <h3 className="section-title">我的專案 ({timeList.length})</h3>
          <label className="season-picker">
            演出年份
            <select
              aria-label="演出年份"
              value={pickerValue}
              onChange={handleSeasonChange}
            >
              <option value="">
                {seasonInfo.current ? `${seasonInfo.current}（今年）` : "今年"}
              </option>
              {olderSeasons.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="project-grid">
          {timeList.map((item, i) => (
            <div
              key={i}
              className="project-card"
              onClick={() => loadProject(item.user, item.update_time)}
            >
              <div className="card-accent"></div>
              <div className="card-content">
                <LuFolderOpen className="card-icon" />
                <div className="card-info">
                  <span className="update-time">{item.update_time}</span>
                  <span className="music-tag">
                    🎵 {item.music_filename || "未設定"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
