import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { LuPlus, LuFolderOpen, LuMusic, LuChevronRight, LuUpload } from "react-icons/lu";
import { updateActionTable, updateMusicFilename } from "../redux/actions";
import { API_ENDPOINTS } from "../config/api.js";
import "./Dashboard.css"; // 引入外部 CSS

const Dashboard = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const userName = useSelector((state) => state.profiles.user);
  const token = useSelector((state) => state.profiles.accessToken);

  const [timeList, setTimeList] = useState([]);
  const [musicList, setMusicList] = useState([]);
  const [showMusicMenu, setShowMusicMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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

  // 抓取當前使用者的音樂清單（供展開選單與上傳後刷新共用）
  const fetchMusicList = async () => {
    const response = await fetch(`${API_ENDPOINTS.BASE}/get_music_list/${userName}`);
    const data = await response.json();
    setMusicList(data.music_list || []);
  };

  // 切換音樂選單；首次展開時抓取清單
  const handleToggleMusic = async () => {
    if (!showMusicMenu) {
      try {
        await fetchMusicList();
        setShowMusicMenu(true);
      } catch (error) {
        console.error("Fetch music error:", error);
      }
    } else {
      setShowMusicMenu(false);
    }
  };

  // 上傳 MP3 音樂檔，成功後刷新清單
  const handleUploadMusic = async (event) => {
    const file = event.target.files?.[0];
    // 清空 input 值，讓同一個檔案可以再次觸發 onChange
    event.target.value = "";
    if (!file) return;

    // 後端只接受 audio/mpeg，先在前端擋掉避免多一次來回
    if (file.type !== "audio/mpeg") {
      alert("只能上傳 MP3 檔案 (audio/mpeg)");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const response = await fetch(API_ENDPOINTS.UPLOAD_MUSIC, {
        method: "POST",
        headers: {
          // 注意：multipart 上傳不可手動設定 Content-Type，
          // 否則會缺少 boundary；交給瀏覽器自動帶上
          Authorization: `Bearer ${token || " "}`,
        },
        body: formData,
      });

      if (response.ok) {
        await fetchMusicList();
      } else {
        const err = await response.json().catch(() => ({}));
        alert("上傳失敗: " + (err.detail || response.status));
      }
    } catch (error) {
      alert("上傳失敗: " + error.message);
    } finally {
      setUploading(false);
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
                {/* 上傳音樂按鈕 */}
                <div
                  className="music-item upload-item"
                  onClick={() => !uploading && fileInputRef.current?.click()}
                >
                  <LuUpload className="item-icon" />
                  <span>{uploading ? "上傳中..." : "上傳音樂"}</span>
                </div>
                {musicList.length === 0 && (
                  <div className="music-item music-empty">尚無音樂，請先上傳</div>
                )}
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

        {/* 隱藏的檔案選擇器，由「上傳音樂」按鈕觸發 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          style={{ display: "none" }}
          onChange={handleUploadMusic}
        />
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