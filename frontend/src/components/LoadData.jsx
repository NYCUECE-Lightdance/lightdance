import React, { useState } from "react";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import { MdInput } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable, updateMusicFilename } from "../redux/actions.js";
import { API_ENDPOINTS } from "../config/api.js";
import { convertActionTableOldToNew } from "../utils/dataConverter.js";

function Dropdown({ userName, setIsDirty, isDirty, setIsLoaded, isLoaded }) {
  const [timeList, setTimeList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [anchorIndex, setAnchorIndex] = useState(0);
  const dispatch = useDispatch();
<<<<<<< HEAD
  const actionTable = useSelector((state) => state.profiles.actionTable);
  const duration = useSelector((state) => state.profiles.duration);
=======
  const actionTable = useSelector((state) => state.profiles.data?.actionTable || []);
>>>>>>> 7ca4da396943de1f136440c3745a54867cf826b5

  async function fetchAvailableDataList() {
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

        // Step 1: 轉換為舊格式 (time, color, linear)
        const restoredActionTable = reverseConversion(data);
        console.log("[LoadData] Old format (after reverseConversion):", restoredActionTable);

        // Step 2: 轉換為新格式 (startTime, endTime, color, linear)
        const newFormatActionTable = convertActionTableOldToNew(restoredActionTable, duration);
        console.log("[LoadData] New format (after conversion):", newFormatActionTable);

        dispatch(updateActionTable(newFormatActionTable));
        console.log("After dispatch:", newFormatActionTable);

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
            "Response did not contain 'raw_data' field. Assuming the whole data object is the actionTable."
          );
          actionData = data;
          musicFilename = data.music_filename;
        }
        console.log("Final ActionData:", actionData);
        console.log("Final MusicFilename:", musicFilename);

<<<<<<< HEAD
        console.log("getData (old format):", getData);

        // 轉換為新格式 (startTime, endTime)
        const newFormatActionTable = convertActionTableOldToNew(getData, duration);
        console.log("[LoadData] Converted to new format:", newFormatActionTable);

        dispatch(updateActionTable(newFormatActionTable));
=======
        dispatch(updateActionTable(actionData));
        dispatch(updateMusicFilename(musicFilename))
>>>>>>> 7ca4da396943de1f136440c3745a54867cf826b5
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
            };

            // Push the new color and time if it's different from the previous one
            playerGroup[numericKey].push({ time: time * 50, color: color });
          }
        });
      });

      // Push the playerGroup into the actionTable
      actionTable.push(playerGroup);
    });

    // 移除重複的相同顏色塊、黑色塊（R=0, G=0, B=0）和 empty 色塊
    actionTable.forEach((player) => {
      Object.values(player).forEach((item) => {
        let prevColor = null;
        for (let index = item.length - 1; index >= 0; index--) {
          const element = item[index];

          // 移除 empty 色塊（這些不應該存在，但為了清理舊數據）
          if (element.empty) {
            console.warn(`Removing unexpected empty block at time ${element.time}ms`);
            item.splice(index, 1);
            prevColor = null;
            continue;
          }

          // 移除黑色塊（R=0, G=0, B=0）
          const isBlack =
            element.color?.R === 0 &&
            element.color?.G === 0 &&
            element.color?.B === 0;

          if (isBlack) {
            item.splice(index, 1);
            prevColor = null; // 重設前一個顏色，因為黑色被移除
            continue;
          }

          // 如果是重複的顏色，也移除
          if (
            prevColor &&
            prevColor.R === element.color.R &&
            prevColor.G === element.color.G &&
            prevColor.B === element.color.B &&
            prevColor.A === element.color.A
          ) {
            item.splice(index, 1);
          } else {
            prevColor = element.color;
          }
        }
      });
    });

    return actionTable;
  }

  return (
    <div>
      <button
        className="load-button"
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
          {timeList.map((option, index) => {
            const isNewUser =
              index === 0 || option.user !== timeList[index - 1].user;
            const key = `${option.user}-${option.update_time}`;
            return (
              <React.Fragment key={key}>
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
                <li key={key}>
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
