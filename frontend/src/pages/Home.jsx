import { useNavigate } from "react-router-dom";
import "./Home.css";
import ControlPanel from "../components/ControlPanel.jsx";
import Palette from "../components/Palette.jsx";
import People from "../components/People.jsx";
import { MdOutput, MdInput } from "react-icons/md";
import { FiEdit } from "react-icons/fi";
import { useEffect, useState } from "react";
import { FaSignOutAlt } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { persistor } from "../redux/store.js";
import Dropdown from "../components/LoadData.jsx";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import { updateAutoRefresh } from "../redux/actions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import { set } from "lodash";
import { API_ENDPOINTS } from "../config/api.js";

function Home({ rgba, setRgba, setButtonState }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const token = useSelector((state) => state.profiles.accessToken);
  const actionTable = useSelector((state) => state.profiles.actionTable);
  const userName = useSelector((state) => state.profiles.userName);
  const autoRefresh = useSelector((state) => state.profiles.autoRefresh);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const editing = () => {
    navigate("/edit");
  };

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

  async function handleOutputString(BearerToken) {
    // Upload raw data
    setIsDirty(false);
    setIsLoaded(false);
    console.log("-token- : ", BearerToken);
    let result = JSON.stringify(actionTable);
    // console.log("upload(raw) : ", JSON.stringify(result));
    const response = await fetch(API_ENDPOINTS.UPLOAD_RAW, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // 這是你後端需要的 Content-Type
        Authorization: `Bearer ${BearerToken}`, // 如果需要授權，記得帶上 token
      },
      body: JSON.stringify({ raw_data: result }), // 轉換為 JSON 字串
      mode: "cors",
    });
    if (!response.ok) {
      alert("upload failed");
      console.error("Response Error:", response.status, response.statusText);
      const errorText = await response.text();
      throw new Error(
        `HTTP error! Status: ${response.status}, Message: ${errorText}`
      );
    } else {
      alert("upload successful");
    }
  }

  async function handleOutput() {
    // 生出光表給硬體用
    setIsDirty(false);
    const players = [];
    const armorIndices = Object.keys(actionTable); // 因為actiontable是物件，所以要先取出key
    for (let i = 0; i < armorIndices.length; i++) {
      const armorIndex = armorIndices[i];
      const partGroup = actionTable[armorIndex]; // 一個人的所有部位
      console.log(partGroup);

      let times = new Set();
      for (let key in partGroup) {
        const partArray = partGroup[key];
        if (!Array.isArray(partArray)) continue;

        partArray.forEach((item) => {
          const roundedTime = Math.ceil(item.time / 50) * 50;
          times.add(roundedTime);
        });
      }

      // 生成唯一的時間點數組並排序
      let uniqueTimes = [...times]
        .map((time) => Math.round(time))
        .sort((a, b) => a - b);

      let mergedResults = [];

      // 遍歷 uniqueTimes 中的每個時間點
      for (let j = 0; j < uniqueTimes.length; j++) {
        // 每個人的每個時間點
        let mergedItem = {
          time: uniqueTimes[j],
        };
        for (let key in partGroup) {
          // 每個人的每個部位
          let itemsAtSameTime = partGroup[key].filter(
            (el) => Math.ceil(el.time / 50) * 50 === uniqueTimes[j]
          );
          let item =
            itemsAtSameTime.find(
              (el) =>
                el.color?.R !== 0 || el.color?.G !== 0 || el.color?.B !== 0
            ) || itemsAtSameTime[0]; // 如果都黑色，就選第一個

          if (item) {
            // 將對應的 item 的數據合併到 mergedItem 中
            mergedItem[key] = item.color;
          }
        }
        mergedResults.push({
          time: Math.floor(mergedItem.time / 50),
          head: mergedItem[0],
          shoulder: mergedItem[1],
          chest: mergedItem[2],
          front: mergedItem[3],
          skirt: mergedItem[4],
          leg: mergedItem[5],
          shoes: mergedItem[6],
          weap_1: mergedItem[7],
          weap_2: mergedItem[8],
        });
      }
      console.log(mergedResults);

      for (let j = 0; j < mergedResults.length; j++) {
        for (let item in mergedResults[j]) {
          if (item !== "time") {
            let target = mergedResults[j][item];
            if (target) {
              const color =
                ((target.R & 0xff) << 24) |
                ((target.G & 0xff) << 16) |
                ((target.B & 0xff) << 8) |
                ((target.A * 100) & 0xff);
              let unsignedColor = color >>> 0;
              mergedResults[j][item] = unsignedColor;
            }
          }
        }
      }
      // console.log(mergedResults);
      players.push(mergedResults);
    }

    let newPlayer = [];

    players.forEach((group) => {
      let newGroup = [];
      let prevElement = null;

      group.forEach((element) => {
        if (prevElement !== null) {
          for (let key in prevElement) {
            // If the key is missing in the current element, copy it from prevElement
            if (!(key in element) || element[key] === undefined) {
              element[key] = prevElement[key];
            }
          }
        }
        prevElement = element;
        // console.log(prevElement);
        newGroup.push(element);
      });
      newPlayer.push(newGroup);
    });

    // console.log(JSON.stringify(newPlayer, null, 2));

    // 生成 JSON 對象
    const result = {
      players,
    };
    // console.log(JSON.stringify(result, null, 2));

    let BearerToken = "";
    token === "" ? (BearerToken = " ") : (BearerToken = token);

    // console.log(token);
    handleOutputString(BearerToken);

    const response = await fetch(API_ENDPOINTS.UPLOAD_ITEMS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // 這是你後端需要的 Content-Type
        Authorization: `Bearer ${BearerToken}`, // 如果需要授權，記得帶上 token
      },
      body: JSON.stringify(result),
      mode: "cors",
    });
    if (!response.ok) {
      alert("upload failed");
      console.error("Response Error:", response.status, response.statusText);
      const errorText = await response.text();
      throw new Error(
        `HTTP error! Status: ${response.status}, Message: ${errorText}`
      );
    } else {
      // alert("upload successful");
      console.log("upload(translated) : ", JSON.stringify(result));
    }
  }

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
          <button className="device-info-button">
            <FontAwesomeIcon icon={faRobot} size="lg" />
          </button>
          <h1 className="title">NYCUEE Light Dance</h1>
          {listitem}
          <div className="people-container">
            <People />
          </div>
        </div>

        <ControlPanel
          onFlagMove={(position) => console.log(position)}
          setButtonState={setButtonState}
        />
      </div>
    </div>
  );
}

export default Home;
