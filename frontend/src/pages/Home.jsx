import { useNavigate } from "react-router-dom";
import "./Home.css";
import ControlPanel from "../components/ControlPanel.jsx";
import Palette from "../components/Palette.jsx";
import People from "../components/People.jsx";
import DancerToggle from "../components/DancerToggle.jsx";
import { MdOutput, MdInput, MdKeyboard } from "react-icons/md";
import { FiEdit } from "react-icons/fi";
import { Suspense, lazy, useEffect, useState } from "react";
import { FaSignOutAlt } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable, updateMusicFilename } from "../redux/actions";
import { persistor, flushPersist } from "../redux/store.js";
import Dropdown from "../components/LoadData.jsx";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import { LuPlus, LuMusic, LuChevronRight } from "react-icons/lu";
/*
 * 快捷鍵說明是個很少打開的 modal，但它帶著整套 markdown 轉譯器
 * （`react-markdown` + `remark-gfm` + micromark/mdast，實測約 80KB）。
 * 那些東西不該躺在編輯器的熱路徑上，所以按需求才抓。
 */
const ShortcutModal = lazy(() => import("../components/ShortcutModal.jsx"));
import { API_ENDPOINTS } from "../config/api.js";
import { localMusicFiles } from "../components/audio/musicData.js";
import {
  saveLocalBackup,
  cleanExpiredBackups,
  deleteLocalBackup,
} from "../utils/indexedDB.js";
import { buildPlayers } from "../utils/export/buildPlayers.js";
import { segmentsToActionTable } from "../utils/segments/convert.js";
import {
  SCHEMA_VERSION,
  normalizeSegmentTable,
} from "../utils/migration/loadProjectData.js";
import { createEmptyActionTable } from "../constants/parts.js";

// const cleanActionTableByDuration = (currentTable, maxDuration) => {
//   if (!currentTable || typeof currentTable !== "object" || maxDuration <= 0) return currentTable;

//   const cleanedTable = {};
//   let hasChanged = false; // 用來標記是否真的有變動

//   Object.entries(currentTable).forEach(([armorIdx, parts]) => {
//     cleanedTable[armorIdx] = {};

//     Object.entries(parts).forEach(([partIdx, timeline]) => {
//       if (Array.isArray(timeline)) {
//         // 1. 先過濾掉超過 duration 的點
//         let newTimeline = timeline.filter((point) => point.time < maxDuration);

//         // 2. 判斷是否需要補上終點黑色塊
//         // 檢查現存最後一個點是否已經是 duration 處的黑色塊
//         const lastPoint = newTimeline[newTimeline.length - 1];
//         const isLastBlackEnd = lastPoint &&
//                                lastPoint.time === maxDuration &&
//                                lastPoint.color.R === 0 &&
//                                lastPoint.color.G === 0 &&
//                                lastPoint.color.B === 0;

//         if (!isLastBlackEnd) {
//           // 在精確的 duration 位置補上黑色塊
//           newTimeline.push({
//             time: maxDuration,
//             color: { R: 0, G: 0, B: 0, A: 1 },
//             linear: 0
//           });
//           hasChanged = true;
//         }

//         // 3. 確保時間排序正確
//         newTimeline.sort((a, b) => a.time - b.time);
//         cleanedTable[armorIdx][partIdx] = newTimeline;
//       } else {
//         cleanedTable[armorIdx][partIdx] = timeline;
//       }
//     });
//   });

//   return hasChanged ? cleanedTable : currentTable;
// };
function Home({ rgba, setRgba, setButtonState }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const token = useSelector((state) => state.profiles.accessToken);
  const data = useSelector((state) => state.profiles.data) || {
    actionTable: [],
    music_filename: "",
  };
  const actionTable = data.actionTable || [];
  const musicFilename = data.music_filename ?? "";
  const userName = useSelector((state) => state.profiles.user);
  const duration = useSelector((state) => state.profiles.duration);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pendingMusic, setPendingMusic] = useState(null);
  const initialTable = createEmptyActionTable();

  // const sizeInMB = (JSON.stringify(data).length / 1024 / 1024).toFixed(2);
  // console.log(`目前資料大小: ${sizeInMB} MB`);

  const editing = () => {
    navigate("/edit");
  };

  // 自動清理 30 天前的舊備份
  useEffect(() => {
    const cleanOldBackups = async () => {
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

  /*
   * 歌單也是專案資料（它會一起進 raw_data），改了就是還沒存。
   *
   * ⚠️ 這裡刻意**不看整份 `audioClips`**，只看「歌單本身」那幾個欄位。音檔解碼
   * 完之後 `waveform.jsx` 會把量到的長度寫回 store，那會動到 `lengthMs` 與
   * `start`/`end`——那是推導出來的資料不是使用者的編輯，看整份的話每次載入專案
   * 都會立刻亮起「尚未儲存」，橫幅就再也沒有意義了。
   */
  const playlistSignature = (data.audioClips ?? [])
    .map(
      (clip) =>
        `${clip.sourceFile}:${clip.name}:${clip.bpm}:${clip.beatAnchor}:${clip.beatsPerBar}`,
    )
    .join("|");

  useEffect(() => {
    setIsDirty(true);
  }, [playlistSignature, data.audioOverlapMs]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // persist 的寫入有 2 秒 debounce，而 debouncedStorage.setItem 會立刻
      // 回傳 resolved promise——redux-persist 以為寫好了，其實還在計時器裡。
      // 關分頁前補一次寫入，否則最後 2 秒的編輯會靜默消失。
      flushPersist();

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

    /*
     * ⚠️ **不要在這裡就把「尚未儲存」關掉。**
     *
     * 這一行原本在函式開頭，也就是在真的送出去之前。上傳失敗時沒有人把它設回來，
     * 於是橫幅消失、`beforeunload` 的提醒也不再出現——畫面說「已儲存」而伺服器上
     * 什麼都沒有。使用者關掉分頁就真的沒了（本地備份還在 IndexedDB，但他不會
     * 知道要去找）。現在只有 `response.ok` 那一條路徑才清掉。
     */

    // raw_data 現在存 segments（前端的黑盒子，後端不解析），標上 schemaVersion
    // 讓載入端知道格式。不再需要 sanitizeActionTableTimes——segment 的邊界
    // 在寫入時就由不變式保證對齊網格，上傳前不必再洗一次。
    const rawPayload = {
      ...data,
      schemaVersion: SCHEMA_VERSION,
    };
    const rawDataString = JSON.stringify(rawPayload);
    const sizeInMB = (rawDataString.length / 1024 / 1024).toFixed(2);
    console.log(`Output raw data size: ${sizeInMB} MB`);

    const backupKey = `local_backup_${musicFilename}`;

    // 1. 本地備份 (IndexedDB + Try-Catch 隔離)
    try {
      const backupData = {
        data: rawPayload,
        timestamp: new Date().getTime(),
        displayTime: new Date().toLocaleString(),
        uploaded: false, // 初始設為 false
      };
      await saveLocalBackup(backupKey, backupData);
      console.log("✅ 本地備份成功 (IndexedDB)");
    } catch (e) {
      console.error("❌ 本地備份失敗，但將繼續嘗試上傳至伺服器:", e);
    }

    // P5: 讓瀏覽器先處理 UI 更新（如 isLoading 狀態），再開始大量計算
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 壓平成韌體 PlayerData：segments → keyframes → PlayerData。
    // 兩步都是純函式，由 golden 與 Phase 4 閘門測試鎖定輸出。
    const players = buildPlayers(
      segmentsToActionTable(actionTable, { duration }),
    );

    console.log("players : ", players);
    console.log(">>> [1] 上傳的原始資料 (Raw Data):", data);
    const result = {
      players,
      music_filename: musicFilename,
    };

    console.log(">>> [2] 上傳的播放資料 (Translated Items):", result);
    let BearerToken = "";
    token === "" ? (BearerToken = " ") : (BearerToken = token);

    // 使用新的合併端點上傳，確保時間戳記一致
    const fullUploadData = {
      raw_data: rawDataString,
      players: players,
      music_filename: String(musicFilename),
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
      } else {
        /*
         * 把後端說的原因帶出來。422 是「光表格式不對，這一版沒存進去」、
         * 503 是「資料庫寫不進去，等一下再試」——兩者要做的事完全不同，
         * 只說「上傳失敗」的話使用者不知道該重試還是該回報。
         */
        const detail = await response
          .json()
          .then((body) => body?.detail)
          .catch(() => null);

        alert(
          `上傳失敗，資料已自動備份至本地。\n\n${detail ?? `伺服器回應 ${response.status}`}`,
        );
        console.error("Upload Error:", response.status, detail);
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
        const response = await fetch(
          `${API_ENDPOINTS.BASE}/get_music_list/${userName}`,
        );
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
      dispatch(updateActionTable(initialTable, { skipHistory: true }));
      setShowNewProjectMenu(false);
    }
  };

  // 僅在 duration 變化時（載入新音檔）補齊 actionTable 形狀，
  // 不在每次編輯時觸發——否則會污染 undo history 並導致 undo 被反轉。
  //
  // segment 模型只需要補「7×22 個部位都存在」；keyframe 時代那些頭尾黑點的
  // 正規化已經不需要了（空隙本身就代表熄滅，長度由 duration 單一來源決定）。
  useEffect(() => {
    if (!actionTable || duration <= 0) return;

    const normalized = normalizeSegmentTable(actionTable);

    // 逐格比對 reference 就夠了：normalizeSegmentTable 對已存在的部位原樣沿用
    const isDifferent =
      normalized.length !== actionTable.length ||
      normalized.some((armor, a) =>
        armor.some((segments, p) => segments !== actionTable[a]?.[p]),
      );

    if (isDifferent) {
      console.log(
        ">>> actionTable 結構不完整，正在補齊 7 players x 22 parts...",
      );
      dispatch(updateActionTable(normalized, { skipHistory: true }));
    }
  }, [duration]); // 僅依賴 duration，不在每次編輯時觸發
  // useEffect(() => {
  //   if (duration > 0 && actionTable) {
  //     const cleaned = cleanActionTableByDuration(actionTable, duration);

  //     // 檢查是否有資料真的被刪除了，避免無限迴圈更新
  //     const isDifferent = JSON.stringify(cleaned) !== JSON.stringify(actionTable);

  //     if (isDifferent) {
  //       console.log(">>> 檢測到超出音樂長度的資料點，正在執行自動清洗...");
  //       dispatch(updateActionTable(cleaned));
  //     }
  //   }
  // }, [duration, dispatch]);

  const handleModalAction = async (action) => {
    if (action === "save") {
      try {
        await handleOutput(); // 執行你原本的儲存邏輯
        dispatch(updateMusicFilename(pendingMusic));
        dispatch(updateActionTable(initialTable, { skipHistory: true }));
        console.log("actionTable to save:", actionTable);
      } catch (e) {
        alert("儲存失敗，已取消新建。");
        return;
      }
    } else if (action === "discard") {
      dispatch(updateMusicFilename(pendingMusic));
      dispatch(updateActionTable(initialTable, { skipHistory: true }));
    }

    // 如果是 "cancel"，就直接關閉 Modal，不做任何 dispatch
    setShowSaveModal(false);
    setIsDirty(false); // 只有在 save 或 discard 時重置 dirty
    setShowNewProjectMenu(false);
  };

  // 上半部右側唯一的欄。飾品已經搬到光衣旁邊（見 components/Armor.jsx），
  // 身體部位本來就在光衣上點得到，所以這一欄只剩調色盤
  const listitem = [<Palette key="palette" rgba={rgba} setRgba={setRgba} />];

  return (
    <div>
      <div className="homepage">
        <div className="panel">
          {/*
           * 頂部工具列。
           *
           * 這一排原本是「每個按鈕各自 position: absolute + 寫死 left: 370px /
           * 584px / 681px…」，於是視窗一換寬度就互相重疊——實測 Edit 與 Logout
           * 被「有尚未儲存的變更」橫幅整個蓋住，完全點不到。改成 flex 之後
           * 由瀏覽器排版，不再有魔術座標。
           */}
          <div className="panel-header">
          <button
            type="button"
            className="title"
            onClick={handleLogout}
            style={{ backgroundColor: "black", color: "white" }}
          >
            NYCUEE Light Dance
          </button>
          <button className="ld-btn ld-btn--primary output-button" onClick={handleOutput}>
            Output <MdOutput className="output-icon" />
          </button>
          <button
            className="ld-btn ld-btn--secondary shortcut-button"
            onClick={() => setShowShortcuts(true)}
          >
            Shortcuts <MdKeyboard className="shortcut-icon" />
          </button>
          <Dropdown
            userName={userName}
            setIsDirty={setIsDirty}
            isDirty={isDirty}
            setIsLoaded={setIsLoaded}
            isLoaded={isLoaded}
          />
          <button className="ld-btn ld-btn--secondary edit-button" onClick={editing}>
            Edit <FiEdit className="edit-icon" />
          </button>
          <button className="ld-btn ld-btn--ghost logout-button" onClick={handleLogout}>
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
          <div
            className={`home-creation-bar ${showNewProjectMenu ? "expanded" : ""}`}
          >
            {/* 音樂清單放在前面，實現向左延伸 */}
            {showNewProjectMenu && (
              <div className="home-music-extension">
                <div className="home-music-list-scroll">
                  {musicList.map((file, i) => (
                    <div
                      key={i}
                      className="home-music-item"
                      onClick={() => handleSelectNewMusic(file)}
                    >
                      <LuMusic className="item-icon" />
                      <span>{file}</span>
                    </div>
                  ))}
                </div>
                <LuChevronRight
                  className="divider-icon"
                  style={{ transform: "rotate(180deg)" }}
                />
              </div>
            )}

            <div className="home-main-action" onClick={handleToggleNewProject}>
              <LuPlus className="action-icon" />
              <span className="action-text">New Project</span>
            </div>
          </div>
          <button className="ld-btn ld-btn--ghost device-info-button">
            <FontAwesomeIcon icon={faRobot} size="lg" />
          </button>
          </div>
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
              <button
                className="btn-save"
                onClick={() => handleModalAction("save")}
              >
                儲存並新建
              </button>
              <button
                className="btn-discard"
                onClick={() => handleModalAction("discard")}
              >
                放棄變更並新建
              </button>
              <button
                className="btn-cancel"
                onClick={() => setShowSaveModal(false)}
              >
                取消返回
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 沒打開就完全不 render——lazy 只有在真的用到時才會去抓那個 chunk */}
      {showShortcuts && (
        <Suspense fallback={null}>
          <ShortcutModal
            isOpen={showShortcuts}
            onClose={() => setShowShortcuts(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default Home;
