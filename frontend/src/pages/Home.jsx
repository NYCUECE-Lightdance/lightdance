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
  const data = useSelector((state) => state.profiles.data) || { actionTable: [], music_filename: "" };
  const actionTable = data.actionTable || [];
  const musicFilename = data.music_filename ?? "";
  const userName = useSelector((state) => state.profiles.user);
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
    // let result = JSON.stringify(actionTable);
    let result = JSON.stringify(data);
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
    console.log("UPLOAD_RAW:", API_ENDPOINTS.UPLOAD_RAW);
    console.log("UPLOAD_ITEMS:", API_ENDPOINTS.UPLOAD_ITEMS);
    setIsDirty(false);
  
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
    const result = {  
      players,
      music_filename: musicFilename
    };
  
    let BearerToken = "";
    token === "" ? (BearerToken = " ") : (BearerToken = token);
  
    handleOutputString(BearerToken);
  
    const response = await fetch(API_ENDPOINTS.UPLOAD_ITEMS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BearerToken}`,
      },
      body: JSON.stringify(result),
      mode: "cors",
    });
    if (response.ok) {
      // 這裡多加一個 alert，或是把 handleOutputString 裡的 alert 移到這裡
      alert("原始檔與播放檔皆上傳成功！"); 
      console.log("upload(translated) : ", JSON.stringify(result));
    }
    // if (!response.ok) {
    //   alert("upload failed");
    //   console.error("Response Error:", response.status, response.statusText);
    //   const errorText = await response.text();
    //   throw new Error(
    //     `HTTP error! Status: ${response.status}, Message: ${errorText}`
    //   );
    // } else {
    //   console.log("upload(translated) : ", JSON.stringify(result));
    // }
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
    </div>
  );
}

export default Home;
