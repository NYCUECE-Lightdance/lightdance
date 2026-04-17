import { useNavigate } from "react-router-dom";
import "./Home.css";
import ControlPanel from "../components/ControlPanel.jsx";
import Palette from "../components/Palette.jsx";
import People from "../components/People.jsx";
import DancerToggle from "../components/DancerToggle.jsx";
import { MdOutput, MdInput } from "react-icons/md";
import { FiEdit } from "react-icons/fi";
import { useEffect, useState } from "react";
import { FaSignOutAlt } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable, updateMusicFilename } from "../redux/actions";
import { persistor } from "../redux/store.js";
import Dropdown from "../components/LoadData.jsx";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import { updateAutoRefresh } from "../redux/actions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import { set } from "lodash";
import { LuPlus, LuMusic, LuChevronRight } from "react-icons/lu";
import { API_ENDPOINTS } from "../config/api.js";
import { localMusicFiles } from "../components/audio/musicData.js";
import { saveLocalBackup, cleanExpiredBackups, deleteLocalBackup } from "../utils/indexedDB.js";

const generateInitialTable = () => Array.from({ length: 7 }, () =>
  Array.from({ length: 14 }, () => [
    { time: 0, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
  ])
);

const cleanActionTableByDuration = (currentTable, maxDuration) => {
  if (!currentTable || typeof currentTable !== "object" || maxDuration <= 0) return currentTable;

  const cleanedTable = {};
  let hasChanged = false; // 用來標記是否真的有變動

  Object.entries(currentTable).forEach(([armorIdx, parts]) => {
    cleanedTable[armorIdx] = {};
    
    Object.entries(parts).forEach(([partIdx, timeline]) => {
      if (Array.isArray(timeline)) {
        // 1. 先過濾掉超過 duration 的點
        let newTimeline = timeline.filter((point) => point.time < maxDuration);
        
        // 2. 判斷是否需要補上終點黑色塊
        // 檢查現存最後一個點是否已經是 duration 處的黑色塊
        const lastPoint = newTimeline[newTimeline.length - 1];
        const isLastBlackEnd = lastPoint && 
                               lastPoint.time === maxDuration && 
                               lastPoint.color.R === 0 && 
                               lastPoint.color.G === 0 && 
                               lastPoint.color.B === 0;

        if (!isLastBlackEnd) {
          // 在精確的 duration 位置補上黑色塊
          newTimeline.push({
            time: maxDuration,
            color: { R: 0, G: 0, B: 0, A: 1 },
            linear: 0
          });
          hasChanged = true;
        }

        // 3. 確保時間排序正確
        newTimeline.sort((a, b) => a.time - b.time);
        cleanedTable[armorIdx][partIdx] = newTimeline;
      } else {
        cleanedTable[armorIdx][partIdx] = timeline;
      }
    });
  });

  return hasChanged ? cleanedTable : currentTable;
};
function Home({ rgba, setRgba, setButtonState }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const token = useSelector((state) => state.profiles.accessToken);
  const data = useSelector((state) => state.profiles.data) || { actionTable: [], music_filename: "" };
  const actionTable = data.actionTable || [];
  const musicFilename = data.music_filename ?? "";
  const userName = useSelector((state) => state.profiles.user);
  const autoRefresh = useSelector((state) => state.profiles.autoRefresh);
  const duration = useSelector((state) => state.profiles.duration); 
  const [isDirty, setIsDirty] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingMusic, setPendingMusic] = useState(null);
  const initialTable = generateInitialTable();

  const sizeInMB = (JSON.stringify(data).length / 1024 / 1024).toFixed(2);
  console.log(`目前資料大小: ${sizeInMB} MB`);

  const editing = () => {
    navigate("/edit");
  };

    // 自動清理 30 天前的舊備份
  useEffect(() => {
    const cleanOldBackups = async () => {
      // 1. 徹底清理 localStorage 中所有舊的 local_backup_ 開頭的 Key
      // 釋放 5MB 的配額給 Redux Persist 使用
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("")) {
          localStorage.removeItem(key);
        }
      });

      // 2. 僅清理 IndexedDB 的過期備份 (預設 30 天)
      try {
        await cleanExpiredBackups(30);
      } catch (e) {
        console.error("清理 IndexedDB 失敗:", e);
      }
    };

    cleanOldBackups();
  }, []);

  useEffect(() => {
    setIsDirty(true);
  }, [actionTable]);

  useEffect(() => {
    if (autoRefresh > 0) {
      const timeout = setTimeout(() => {
        // if (autoRefresh == 1) window.location.reload(true);
        dispatch(updateAutoRefresh(autoRefresh - 1));
      }, 1500); // Example: Decrease every second

      return () => clearTimeout(timeout); // Clean up the timeout
    }
  }, [autoRefresh, dispatch, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ""; // 有些瀏覽器需要設定空字串才會彈出提示
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    // Check if the token exists in LocalStorage
    // const token = localStorage.getItem("access_token");
    console.log("Token:", token); // Logs the token
    if (!token) {
      navigate("/"); // Redirect to home if the user is authenticated
    }
  }, [navigate]);

  const handleLogout = () => {
    // Clear the cookie by setting it with an expired date
    // document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    dispatch({ type: "REFRESH" });
    persistor.purge(); // Clears persisted state
    navigate("/"); // Redirect to login page after logout
  };

  async function handleOutput() {
    console.log("UPLOAD_RAW:", API_ENDPOINTS.UPLOAD_RAW);
    console.log("UPLOAD_ITEMS:", API_ENDPOINTS.UPLOAD_ITEMS);
    setIsDirty(false);
    const backupKey = `local_backup_${musicFilename}`;
  
    // 1. 本地備份 (IndexedDB + Try-Catch 隔離)
    try {
      const backupData = {
        data: data, 
        timestamp: new Date().getTime(),
        displayTime: new Date().toLocaleString(),
        uploaded: false, // 初始設為 false
      };
      await saveLocalBackup(backupKey, backupData);
      console.log("✅ 本地備份成功 (IndexedDB)");
    } catch (e) {
      console.error("❌ 本地備份失敗，但將繼續嘗試上傳至伺服器:", e);
    }

    const players = [];
    const armorIndices = Object.keys(actionTable);
  
    for (let i = 0; i < armorIndices.length; i++) {
      const armorIndex = armorIndices[i];
      const partGroup = actionTable[armorIndex];
  
      let times = new Set();
  
      for (let key in partGroup) {
        const partArray = partGroup[key];
        if (!Array.isArray(partArray)) continue;
  
        partArray.forEach((item) => {
          const roundedTime = Math.ceil(item.time / 50) * 50;
          times.add(roundedTime);
        });
      }
  
      let uniqueTimes = [...times]
        .map((t) => Math.round(t))
        .sort((a, b) => a - b);
  
      let mergedResults = [];
  
      for (let j = 0; j < uniqueTimes.length; j++) {
        const time = uniqueTimes[j];
  
        const mergedItem = {
          time: Math.floor(time / 50),
        };
  
        for (let key in partGroup) {
          const partTimeline = partGroup[key];
          if (!Array.isArray(partTimeline) || partTimeline.length === 0) continue;
  
          let activeBlock = null;
          let activeIndex = -1;
  
          for (let k = 0; k < partTimeline.length; k++) {
            if (partTimeline[k].time <= time) {
              activeBlock = partTimeline[k];
              activeIndex = k;
            } else {
              break;
            }
          }
  
          let R = 0,
            G = 0,
            B = 0,
            A = 1,
            linear = 0;
  
          if (activeBlock) {
            if (activeBlock.linear === 1) {
              const nextBlock = partTimeline[activeIndex + 1];
  
              if (nextBlock && nextBlock.time > activeBlock.time) {
                const f =
                  (time - activeBlock.time) /
                  (nextBlock.time - activeBlock.time);
  
                R = Math.round(
                  activeBlock.color.R * (1 - f) + nextBlock.color.R * f
                );
                G = Math.round(
                  activeBlock.color.G * (1 - f) + nextBlock.color.G * f
                );
                B = Math.round(
                  activeBlock.color.B * (1 - f) + nextBlock.color.B * f
                );
                A = activeBlock.color.A * (1 - f) + nextBlock.color.A * f;
                linear = 1;
              } else {
                R = activeBlock.color.R;
                G = activeBlock.color.G;
                B = activeBlock.color.B;
                A = activeBlock.color.A;
                linear = 1;
              }
            } else {
              R = activeBlock.color.R;
              G = activeBlock.color.G;
              B = activeBlock.color.B;
              A = activeBlock.color.A;
              linear = 0;
            }
          }
  
          const alpha7 = Math.min(Math.floor(A * 128), 127);
          const packedByte = (alpha7 << 1) | (linear & 1);
  
          const color32 =
            ((R & 0xff) << 24) |
            ((G & 0xff) << 16) |
            ((B & 0xff) << 8) |
            (packedByte & 0xff);
  
          mergedItem[key] = color32 >>> 0;
        }
  
        mergedResults.push({
          time: mergedItem.time,
          hat: mergedItem[0] ?? 0,
          face: mergedItem[1] ?? 0,
          chestL: mergedItem[2] ?? 0,
          chestR: mergedItem[3] ?? 0,
          armL: mergedItem[4] ?? 0,
          armR: mergedItem[5] ?? 0,
          tie: mergedItem[6] ?? 0,
          belt: mergedItem[7] ?? 0,
          gloveL: mergedItem[8] ?? 0,
          gloveR: mergedItem[9] ?? 0,
          legL: mergedItem[10] ?? 0,
          legR: mergedItem[11] ?? 0,
          shoeL: mergedItem[12] ?? 0,
          shoeR: mergedItem[13] ?? 0,
          board: 0,
        });
      }
  
      for (let j = 0; j < mergedResults.length; j++) {
        if (j > 0) {
          for (let k in mergedResults[j - 1]) {
            if (
              !(k in mergedResults[j]) ||
              mergedResults[j][k] === undefined ||
              mergedResults[j][k] === null
            ) {
              mergedResults[j][k] = mergedResults[j - 1][k];
            }
          }
        }
      }
  
      players.push(mergedResults);
    }
    
    console.log("players : ", players);
    console.log(">>> [1] 上傳的原始資料 (Raw Data):", data);
    const result = {  
      players,
      music_filename: musicFilename
    };
    
    console.log(">>> [2] 上傳的播放資料 (Translated Items):", result);
    let BearerToken = "";
    token === "" ? (BearerToken = " ") : (BearerToken = token);
  
    // 使用新的合併端點上傳，確保時間戳記一致
    const fullUploadData = {
      raw_data: JSON.stringify(data),
      players: players,
      music_filename: String(musicFilename)
    };

    try {
      const response = await fetch(API_ENDPOINTS.UPLOAD_FULL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BearerToken}`,
        },
        body: JSON.stringify(fullUploadData),
        mode: "cors",
      });

    
      if (response.ok) {
        setIsDirty(false);
        // 更新本地備份狀態為已同步
        try {
          const syncData = {
            data: data,
            timestamp: new Date().getTime(),
            displayTime: new Date().toLocaleString(),
            uploaded: true,
          };
          await saveLocalBackup(backupKey, syncData);
        } catch (e) {
          console.error("更新本地同步狀態失敗:", e);
        }
        alert("原始檔與播放檔皆上傳成功！"); 
        console.log("upload(full) : ", JSON.stringify(fullUploadData));
      }
 else {
        alert("上傳失敗，資料已自動備份至本地。");
        console.error("Upload Error:", response.status);
      }
    } catch (error) {
      alert("網路斷線，資料已自動備份至本地。");
      console.error("Upload Exception:", error);
    }

  }

  const [musicList, setMusicList] = useState([]);
  const [showNewProjectMenu, setShowNewProjectMenu] = useState(false);

  // 1. 點擊「新建專案」時切換音樂選單
  const handleToggleNewProject = async () => {
    if (!showNewProjectMenu) {
      let apiList = [];
      try {
        const response = await fetch(`${API_ENDPOINTS.BASE}/get_music_list/${userName}`);
        const json = await response.json();
        apiList = json.music_list || [];
      } catch (error) {
        console.error("Fetch music error:", error);
      }
      // 本地 musicsrc/ 的 mp3 永遠顯示，後端上傳的額外加進來
      setMusicList([...new Set([...localMusicFiles, ...apiList])]);
      setShowNewProjectMenu(true);
    } else {
      setShowNewProjectMenu(false);
    }
  };

  // 2. 核心邏輯：選定音樂後的檢查機制
  const handleSelectNewMusic = async (filename) => {

    if (isDirty) {
      setPendingMusic(filename);
      setShowSaveModal(true); // 有變動，跳出自訂彈窗
    } else {
      // 沒變動，直接新建
      dispatch(updateMusicFilename(filename));
      dispatch(updateActionTable(initialTable));
      setShowNewProjectMenu(false);
    }
  };

  useEffect(() => {
    if (duration > 0 && actionTable) {
      const cleaned = cleanActionTableByDuration(actionTable, duration);
      
      // 檢查是否有資料真的被刪除了，避免無限迴圈更新
      const isDifferent = JSON.stringify(cleaned) !== JSON.stringify(actionTable);
      
      if (isDifferent) {
        console.log(">>> 檢測到超出音樂長度的資料點，正在執行自動清洗...");
        dispatch(updateActionTable(cleaned));
      }
    }
  }, [duration, dispatch]);

  const handleModalAction = async (action) => {
    if (action === "save") {
      try {
        await handleOutput(); // 執行你原本的儲存邏輯
        dispatch(updateMusicFilename(pendingMusic));
        dispatch(updateActionTable(initialTable));
        console.log("actionTable to save:", actionTable);
      } catch (e) {
        alert("儲存失敗，已取消新建。");
        return;
      }
    } else if (action === "discard") {
      dispatch(updateMusicFilename(pendingMusic));
      dispatch(updateActionTable(initialTable));
    }
    
    // 如果是 "cancel"，就直接關閉 Modal，不做任何 dispatch
    setShowSaveModal(false);
    setIsDirty(false); // 只有在 save 或 discard 時重置 dirty
    setShowNewProjectMenu(false);
  };
    

  const listitem = [<Palette key="palette-1" rgba={rgba} setRgba={setRgba} />]; // 添加 key

  return (
    <div>
      <div className="homepage">
        <div className="panel">

          <button className="output-button" onClick={handleOutput}>
            Output <MdOutput className="output-icon" />
          </button>
          <Dropdown
            userName={userName}
            setIsDirty={setIsDirty}
            isDirty={isDirty}
            setIsLoaded={setIsLoaded}
            isLoaded={isLoaded}
          />
          <button className="edit-button" onClick={editing}>
            Edit <FiEdit className="edit-icon" />
          </button>
          <button className="logout-button" onClick={handleLogout}>
            Logout <FaSignOutAlt className="logout-icon" />
          </button>
          {isDirty && (
            <div
              // style={{
              //   backgroundColor: "orange",
              //   color: "white",
              //   height : "30px",
              //   borderRadius: "4px",
              //   margintop: "50px",
              //   fontWeight: "bold",
              //   top: "10px",
              //   textAlign: "center", // 讓文字置中
              //   textJustify: "center",
              //   fontSize: "16px", // 可選：讓文字看起來更精緻
              // }}
              className="alert-warning"
            >
              ⚠️ 有尚未儲存的變更
            </div>
          )}
          <div className={`home-creation-bar ${showNewProjectMenu ? "expanded" : ""}`}>
            {/* 音樂清單放在前面，實現向左延伸 */}
            {showNewProjectMenu && (
              <div className="home-music-extension">
                <div className="home-music-list-scroll">
                  {musicList.map((file, i) => (
                    <div key={i} className="home-music-item" onClick={() => handleSelectNewMusic(file)}>
                      <LuMusic className="item-icon" />
                      <span>{file}</span>
                    </div>
                  ))}
                </div>
                <LuChevronRight className="divider-icon" style={{ transform: 'rotate(180deg)' }} />
              </div>
            )}

            <div className="home-main-action" onClick={handleToggleNewProject}>
              <LuPlus className="action-icon" />
              <span className="action-text">New Project</span>
            </div>
          </div>
          <button className="device-info-button">
            <FontAwesomeIcon icon={faRobot} size="lg" />
          </button>
          <button type="button" className="title" onClick={handleLogout} style={{ backgroundColor: 'black', color: 'white' }}>NYCUEE Light Dance</button>
          {listitem}
          <div className="people-container">
            <People />
            <DancerToggle />
          </div>
        </div>

        <ControlPanel
          onFlagMove={(position) => console.log(position)}
          setButtonState={setButtonState}
        />
      </div>
          {showSaveModal && (
      <div className="custom-modal-overlay">
        <div className="custom-modal-content">
          <h4 className="modal-title">確認新建專案</h4>
          <p className="modal-body">目前有尚未儲存的變更，請問要如何處理？</p>
          <div className="modal-footer-buttons">
            <button className="btn-save" onClick={() => handleModalAction("save")}>
              儲存並新建
            </button>
            <button className="btn-discard" onClick={() => handleModalAction("discard")}>
              放棄變更並新建
            </button>
            <button className="btn-cancel" onClick={() => setShowSaveModal(false)}>
              取消返回
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

export default Home;
