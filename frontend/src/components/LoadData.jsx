import React, { useState } from "react";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import { MdInput } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable } from "../redux/actions.js";
import { API_ENDPOINTS } from "../config/api.js";

function Dropdown({ userName, setIsDirty, isDirty, setIsLoaded, isLoaded }) {
  const [timeList, setTimeList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [anchorIndex, setAnchorIndex] = useState(0);
  const dispatch = useDispatch();
  const actionTable = useSelector((state) => state.profiles.actionTable);

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
        const restoredActionTable = reverseConversion(
          // JSON.parse(JSON.stringify(data.players))
          data
        );
        // console.log("Table : ", actionTable);

        dispatch(updateActionTable(restoredActionTable));
        console.log("After : ", restoredActionTable);

        // let timeListArray = data.list;
        // setTimeList(timeListArray);
        // const uniqueArray = [
        //   ...new Set(timeListArray.map((array) => array.user)),
        // ];
        // setUserList(uniqueArray);
        // // console.log(uniqueArray);
        // setAnchorIndex(0);
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
        // console.log(data.players); // Log the returned data
        // console.log("Table : ", actionTable);
        let getData = JSON.parse(data.raw_data);
        console.log("getData : ", getData);
        dispatch(updateActionTable(getData));
        // console.log("After : ", restoredActionTable);

        // let timeListArray = data.list;
        // setTimeList(timeListArray);
        // const uniqueArray = [
        //   ...new Set(timeListArray.map((array) => array.user)),
        // ];
        // setUserList(uniqueArray);
        // // console.log(uniqueArray);
        // setAnchorIndex(0);
      })
      .catch((error) => {
        console.error("Error fetching data:", error); // Handle any errors
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
                    className="dropdown-item"
                    style={{ fontSize: "16px" }}
                    onClick={() =>
                      fetchRawPlayerData(option.user, option.update_time)
                    }
                  >
                    {option.update_time}
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
