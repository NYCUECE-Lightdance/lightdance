import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { LuPlus, LuFolderOpen, LuMusic, LuChevronRight } from "react-icons/lu";
import { updateActionTable, updateMusicFilename } from "../redux/actions";
import { API_ENDPOINTS } from "../config/api.js";
import "./Dashboard.css"; // 引入外部 CSS

const Dashboard = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const userName = useSelector((state) => state.profiles.user);

  const [timeList, setTimeList] = useState([]);
  const [musicList, setMusicList] = useState([]);
  const [showMusicMenu, setShowMusicMenu] = useState(false);

  // 初始化即抓取舊光表列表
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.TIMELIST}/${userName}`);
        const data = await response.json();
        setTimeList(data.list || []);
      } catch (error) {
        console.error("Fetch initial data error:", error);
      }
    };
    fetchInitialData();
  }, [userName]);

  // 抓取音樂清單
  const handleToggleMusic = async () => {
    if (!showMusicMenu) {
      try {
        const response = await fetch(`${API_ENDPOINTS.BASE}/get_music_list/${userName}`);
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
      const response = await fetch(`${API_ENDPOINTS.BASE}/raw/${user}/${time}`);
      const data = await response.json();
      let actionData, musicFile;

      if (data && data.raw_data) {
        const parsedRaw = JSON.parse(data.raw_data);
        actionData = parsedRaw.actionTable || parsedRaw;
        musicFile = parsedRaw.music_filename;
      } else {
        actionData = data;
        musicFile = data.music_filename;
      }

      dispatch(updateActionTable(actionData));
      dispatch(updateMusicFilename(musicFile || ""));
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
                  <div key={i} className="music-item" onClick={() => createNewProject(file)}>
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
        <h3 className="section-title">我的專案 ({timeList.length})</h3>
        <div className="project-grid">
          {timeList.map((item, i) => (
            <div key={i} className="project-card" onClick={() => loadProject(item.user, item.update_time)}>
              <div className="card-accent"></div>
              <div className="card-content">
                <LuFolderOpen className="card-icon" />
                <div className="card-info">
                  <span className="update-time">{item.update_time}</span>
                  <span className="music-tag">🎵 {item.music_filename || "未設定"}</span>
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