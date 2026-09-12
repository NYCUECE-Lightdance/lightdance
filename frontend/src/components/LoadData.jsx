import React, { useState } from "react";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import { MdInput } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import {
  updateActionTable,
  updateAudioClips,
  updateAudioOverlap,
  updateMusicFilename,
} from "../redux/actions.js";
import { API_ENDPOINTS } from "../config/api.js";
import { getAllLocalBackups } from "../utils/indexedDB.js";
import { PART_COUNT } from "../constants/parts.js";
import { loadProjectData } from "../utils/migration/loadProjectData.js";

function Dropdown({ userName, setIsDirty, isDirty, setIsLoaded, isLoaded }) {
  const [timeList, setTimeList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [anchorIndex, setAnchorIndex] = useState(0);
  const dispatch = useDispatch();
  const actionTable = useSelector(
    (state) => state.profiles.data?.actionTable || [],
  );
  const duration = useSelector((state) => state.profiles.duration);
  const [localBackups, setLocalBackups] = useState([]);

  async function fetchAvailableDataList() {
    // --- 部分 A: 抓取本地備份資料 (僅限 IndexedDB) ---
    const backups = [];

    // 抓取 IndexedDB
    try {
      const idbBackups = await getAllLocalBackups();
      idbBackups.forEach((item) => {
        backups.push({
          key: item.key,
          music_filename: item.data?.music_filename || "Unknown",
          displayTime: item.displayTime || "N/A",
          timestamp: item.timestamp || 0,
          rawData: item.data,
          source: "IndexedDB",
          uploaded: item.uploaded,
        });
      });
    } catch (e) {
      console.error("抓取 IndexedDB 備份失敗", e);
    }

    // 按時間排序 (最新的在前面)
    backups.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    setLocalBackups(backups);

    // Define the API endpoint
    const apiEndpoint = `${API_ENDPOINTS.TIMELIST}/${userName}`; // Example API

    // Use fetch to send a GET request
    fetch(apiEndpoint)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json(); // Parse the JSON data
      })
      .then((data) => {
        // console.log("Fetched Data:", data); // Log the returned data
        // console.log(data.list); // Log the returned data
        let timeListArray = data.list;
        setTimeList(timeListArray);
        const uniqueArray = [
          ...new Set(timeListArray.map((array) => array.user)),
        ];
        setUserList(uniqueArray);

        // console.log(uniqueArray);
        setAnchorIndex(0);
      })
      .catch((error) => {
        console.error("Error fetching data:", error); // Handle any errors
      });

    // console.log("TimeList API Response:", data);
  }

  async function handleChoose(user, time) {
    // console.log(time);
    // Define the API endpoint
    const apiEndpoint = `${API_ENDPOINTS.ITEMS}/${user}/${time}`; // Example API
    // Use fetch to send a GET request
    fetch(apiEndpoint)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json(); // Parse the JSON data
      })
      .then((data) => {
        console.log("Fetched Data:", data); // Log the returned data
        // console.log(data.players); // Log the returned data
        // reverseConversion 從韌體 players 反推出來的是 keyframe 格式，
        // 一樣要經過遷移入口才能進 store
        const { segmentTable } = loadProjectData(reverseConversion(data), {
          duration,
        });

        dispatch(updateActionTable(segmentTable));
        console.log("After : ", segmentTable);

        // let timeListArray = data.list;
        // setTimeList(timeListArray);
        // const uniqueArray = [
        //   ...new Set(timeListArray.map((array) => array.user)),
        // ];
        // setUserList(uniqueArray);
        // // console.log(uniqueArray);
        // setAnchorIndex(0);
        if (data.music_filename !== undefined) {
          dispatch(updateMusicFilename(data.music_filename));
        }
      })
      .catch((error) => {
        console.error("Error fetching data:", error); // Handle any errors
      });
  }

  const handleLoadLocal = (backup) => {
    if (backup.rawData) {
      // 統一走遷移入口：舊備份是 keyframe、新備份是 segment，由形狀自動辨認
      const {
        segmentTable,
        musicFilename: musicFile,
        audioClips,
        overlapMs,
      } = loadProjectData(backup.rawData, { duration });

      dispatch(updateActionTable(segmentTable));
      dispatch(updateMusicFilename(musicFile));
      // 音訊時間軸要在 music_filename 之後——後者在檔名不同時會把清單重設成單曲
      dispatch(updateAudioOverlap(overlapMs));
      dispatch(updateAudioClips(audioClips));
      setIsDirty(false); // 載入後暫時重置 dirty 狀態
      alert(`已載入本地暫存: ${musicFile}`);
    }
  };

  async function fetchRawPlayerData(user, time) {
    // console.log(time);
    // Define the API endpoint
    const apiEndpoint = `${API_ENDPOINTS.BASE}/raw/${user}/${time}`; // Example API
    // Use fetch to send a GET request
    fetch(apiEndpoint)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json(); // Parse the JSON data
      })
      .then((data) => {
        console.log("Fetched Data:", data); // Log the returned data

        // Check if the backend returned an error message in the body
        if (data && data.message) {
          throw new Error(`Backend error: ${data.message}`);
        }

        let actionData;
        let musicFilename; // 預設值
        if (data && typeof data.raw_data !== "undefined") {
          // If raw_data exists, parse it
          // 1. 先把整串 JSON 字串轉成物件
          const parsedRaw = JSON.parse(data.raw_data);
          console.log("rawData:", parsedRaw);

          // 2. 判斷資料結構（如果是舊格式可能直接是 actionTable，新格式可能包含 music_filename）
          actionData = parsedRaw.actionTable || parsedRaw;
          musicFilename = parsedRaw.music_filename;
        } else {
          // Otherwise, assume the data object itself is what we need
          console.warn(
            "Response did not contain 'raw_data' field. Assuming the whole data object is the actionTable.",
          );
          actionData = data;
          musicFilename = data.music_filename;
        }

        // 統一走遷移入口：伺服器上同時存在 v1（keyframe）與 v2（segment）
        // 兩種 raw_data，由形狀自動辨認並轉成 segments
        const { segmentTable, audioClips, overlapMs } = loadProjectData(
          actionData,
          { duration },
        );
        console.log("Final ActionData:", segmentTable);
        console.log("Final MusicFilename:", musicFilename);

        dispatch(updateActionTable(segmentTable));
        dispatch(updateMusicFilename(musicFilename));
        // 音訊時間軸要在 music_filename 之後——後者在檔名不同時會把清單重設成單曲
        dispatch(updateAudioOverlap(overlapMs));
        dispatch(updateAudioClips(audioClips));
      })
      .catch((error) => {
        // This will now catch both HTTP errors and backend errors from the response body
        console.error("Error fetching data:", error); // Handle any errors
        alert(`Failed to load data: ${error.message}`); // Also alert the user
      });
  }

  // const reverseToActionTable = (result) => {
  //   const actionTable = [];

  //   for (let i = 0; i < result.players.length; i++) {
  //     const playerGroup = [];
  //     for (let j = 0; j < result.players[i].length; j++) {
  //       const player = result.players[i][j];
  //       const rgbaColors = [];

  //       // 解码每个部位的颜色
  //       const decodeColor = (unsignedColor) => ({
  //         R: (unsignedColor >> 24) & 0xff,
  //         G: (unsignedColor >> 16) & 0xff,
  //         B: (unsignedColor >> 8) & 0xff,
  //         A: unsignedColor & 0xff,
  //       });

  //       rgbaColors.push(decodeColor(player.head));
  //       rgbaColors.push(decodeColor(player.shoulder));
  //       rgbaColors.push(decodeColor(player.chest));
  //       rgbaColors.push(decodeColor(player.arm_waist));
  //       rgbaColors.push(decodeColor(player.leg1));
  //       rgbaColors.push(decodeColor(player.leg2));
  //       rgbaColors.push(decodeColor(player.shoes));

  //       // 构建单个玩家数据
  //       const playerData = [player.time, ...rgbaColors];
  //       playerGroup.push(playerData);
  //     }
  //     actionTable.push(playerGroup);
  //   }

  //   return actionTable;
  // };

  function reverseConversion(result) {
    const actionTable = [];

    result.players.forEach((player) => {
      const playerGroup = {};

      player.forEach((mergedItem) => {
        const time = mergedItem.time;

        // Iterate over each key in mergedItem (like 'head', 'shoulder', etc.)
        Object.keys(mergedItem).forEach((key, index) => {
          if (key !== "time") {
            // Use the numeric index as the key (e.g., "0", "1", "2", etc.)
            const numericKey = String(index - 1);

            // Initialize the numeric key in playerGroup if not already present
            if (!playerGroup[numericKey]) {
              playerGroup[numericKey] = [];
            }

            let color = {
              R: (mergedItem[key] >> 24) & 0xff,
              G: (mergedItem[key] >> 16) & 0xff,
              B: (mergedItem[key] >> 8) & 0xff,
              A: (mergedItem[key] & 0xff) / 100,
              // A: 1,
            };

            // Compare the new color with the previous one

            // Push the new color and time if it's different from the previous one
            playerGroup[numericKey].push({ time: time * 50, color: color });
            // Update the previous color
          }
        });
      });

      // Push the playerGroup into the actionTable
      actionTable.push(playerGroup);
    });
    console.log("table : ", actionTable);

    actionTable.forEach((player) => {
      Object.values(player).forEach((item) => {
        let prevColor = null;
        for (let index = 0; index < item.length; index++) {
          const element = item[index];
          if (
            prevColor &&
            prevColor.R === element.color.R &&
            prevColor.G === element.color.G &&
            prevColor.B === element.color.B &&
            prevColor.A === element.color.A &&
            index !== item.length - 1
          ) {
            // Remove the element from the array if the color is the same as the previous one
            item.splice(index, 1);
            index--; // Adjust index after removal
          }
          prevColor = element.color;
        }
      });
    });
    return actionTable;
  }

  return (
    <div>
      <button
        className="ld-btn ld-btn--secondary load-button"
        onClick={fetchAvailableDataList}
        data-bs-toggle="dropdown"
      >
        Load <MdInput className="load-icon" />
      </button>
      <div className="dropdown">
        <ul
          className="dropdown-menu dropdown-menu-md-start"
          aria-labelledby="dropdownMenuButton1"
          style={{
            fontSize: "18px",
            maxHeight: "800px", // ✅ 最大高度限制
            overflowY: "auto", // ✅ 垂直滾動
          }}
        >
          {/* --- 區段 1: 本地暫存檔 --- */}
          {localBackups.length > 0 && (
            <>
              <li>
                <span
                  className="dropdown-header text-primary"
                  style={{ fontSize: "20px" }}
                >
                  📦 本地備份檔
                </span>
              </li>
              {localBackups.map((backup) => (
                <li key={backup.key}>
                  <a
                    className="dropdown-item d-flex justify-content-between align-items-center"
                    style={{
                      fontSize: "16px",
                      backgroundColor: backup.uploaded ? "#f8f9fa" : "#fff3cd", // 已同步用淡灰色，未同步用淡橘色
                    }}
                    onClick={() => handleLoadLocal(backup)}
                  >
                    <div>
                      <span className="fw-bold">{backup.music_filename}</span>
                      <br />
                      <small className="text-muted">{backup.displayTime}</small>
                    </div>
                    <div className="d-flex flex-column align-items-end">
                      <span
                        className={`badge ${backup.uploaded ? "bg-success" : "bg-warning"} text-dark mb-1`}
                      >
                        {backup.uploaded ? "已同步伺服器" : "待同步/上傳失敗"}
                      </span>
                      <small style={{ fontSize: "10px", color: "#888" }}>
                        IDB
                      </small>
                    </div>
                  </a>
                </li>
              ))}
              <li>
                <hr className="dropdown-divider" />
              </li>
            </>
          )}

          {/* --- 區段 2: 遠端資料庫檔 (你原本的渲染邏輯) --- */}
          {timeList.length === 0 && localBackups.length === 0 && (
            <li>
              <span className="dropdown-item">無可用資料</span>
            </li>
          )}

          {timeList.map((option, index) => {
            const isNewUser =
              index === 0 || option.user !== timeList[index - 1].user;
            // 加上 index 確保即使 user 和 update_time 相同，key 也是唯一的
            const fragmentKey = `remote-${option.user}-${option.update_time}-${index}`;
            return (
              <React.Fragment key={fragmentKey}>
                {isNewUser && (
                  <li key={`${option.user}-header`}>
                    <span
                      className="dropdown-header"
                      style={{ fontSize: "20px" }}
                    >
                      {option.user}
                    </span>
                  </li>
                )}
                <li key={`${fragmentKey}-item`}>
                  <a
                    className="dropdown-item d-flex justify-content-between align-items-center"
                    style={{ fontSize: "16px" }}
                    onClick={() =>
                      fetchRawPlayerData(option.user, option.update_time)
                    }
                  >
                    {/* 顯示更新時間 */}
                    <span>{option.update_time}</span>

                    {/* 新增：顯示 Music Filename 的標籤 */}
                    <span className="badge bg-info text-dark ms-2">
                      🎵 Music: {option.music_filename ?? "N/A"}
                    </span>
                  </a>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default Dropdown;
