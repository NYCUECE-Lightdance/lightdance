import "./App.css";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import ControlPanel from "./components/ControlPanel.js";
import Palette from "./components/Palette.js";
import TransparentButton from "./components/TransparentButton.js";
import People from "./components/People.js";
import UploadBottom from "./components/audio/audioUploadBtm.js";

function App() {
  const [colors, setColors] = useState([]);
  const [colorDataUnit, setColorDataUnit] = useState([]);
  const [rgba, setRgba] = useState({ R: 0, G: 0, B: 0, A: 1 });
  const [headRgb, setHeadRgb] = useState({ R: 0, G: 0, B: 0 });
  const [rightHandRgb, setRightHandRgb] = useState({ R: 0, G: 0, B: 0 });
  const [leftHandRgb, setLeftHandRgb] = useState({ R: 0, G: 0, B: 0 });
  const [bodyRgb, setBodyRgb] = useState({ R: 0, G: 0, B: 0 });
  const [rightLegRgb, setRightLegRgb] = useState({ R: 0, G: 0, B: 0 });
  const [leftLegRgb, setLeftLegRgb] = useState({ R: 0, G: 0, B: 0 });
  const [buttonState, setButtonState] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // 當前播放時間



  // useEffect(() => {
  //   console.log("Updated colors state:", colors);
  //   console.table(colors);
  //   console.log(colors[0]);
  // }, [colors]);

  function deepClone3DArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return arr;
    }
    const clone = [];
    for (let i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        clone.push(deepClone3DArray(arr[i])); // Recursively clone nested arrays
      } else {
        clone.push(arr[i]); // Copy non-array elements
      }
    }
    return clone;
  }

  /**
   * Print the color of blocks
   */

  const output = () => {
    let str = "";
    for (let k = 0; k < 9; k++) {
      for (let i = 0; i < 16; i++) {
        if (i % 2 !== 0) {
          for (let j = 0; j < 16; j++) {
            let encode =
              4 * (colors[k][i][j].R !== 0) +
              2 * (colors[k][i][j].G !== 0) +
              (colors[k][i][j].B !== 0);
            str = str + encode.toString();
          }
        } else {
          for (let j = 15; j > -1; j--) {
            let encode =
              4 * (colors[k][i][j].R !== 0) +
              2 * (colors[k][i][j].G !== 0) +
              (colors[k][i][j].B !== 0);
            str = str + encode.toString();
          }
        }
      }
    }

    // 頭 -> 左手 -> 身體 -> 右手 -> 右腳 -> 左腳
    let encode =
      4 * (headRgb.R !== 0) + 2 * (headRgb.G !== 0) + (headRgb.B !== 0);
    str = str + encode.toString();

    encode =
      4 * (leftHandRgb.R !== 0) +
      2 * (leftHandRgb.G !== 0) +
      (leftHandRgb.B !== 0);
    str = str + encode.toString();

    encode = 4 * (bodyRgb.R !== 0) + 2 * (bodyRgb.G !== 0) + (bodyRgb.B !== 0);
    str = str + encode.toString();

    encode =
      4 * (rightHandRgb.R !== 0) +
      2 * (rightHandRgb.G !== 0) +
      (rightHandRgb.B !== 0);
    str = str + encode.toString();

    encode =
      4 * (rightLegRgb.R !== 0) +
      2 * (rightLegRgb.G !== 0) +
      (rightLegRgb.B !== 0);
    str = str + encode.toString();

    encode =
      4 * (leftLegRgb.R !== 0) +
      2 * (leftLegRgb.G !== 0) +
      (leftLegRgb.B !== 0);
    str = str + encode.toString();

    let list = { color: str };
    // console.log(JSON.parse(JSON.stringify(list)));

    fetch("http://140.113.160.136:8000/items/", {
      method: "POST",
      body: JSON.stringify(list),
      headers: {
        "Content-Type": "application/json",
      },
      mode: "cors",
    });
    alert("Output!");
  };

  const loading = () => {
    fetch("http://140.113.160.136:8000/items/latest/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        return response.json();
      })
      .then((text) => {
        load(JSON.stringify(text["color"]));
      });
    setTimeout(() => alert("Loading"), 100);
  };

  const load = (str) => {
    const colors_ = deepClone3DArray(colors);

    let cnt = 1;
    for (let k = 0; k < 9; k++) {
      for (let i = 0; i < 16; i++) {
        if (i % 2 !== 0) {
          for (let j = 0; j < 16; j++) {
            let num = Number(str[cnt]);
            let c1 = num >= 4 ? 255 : 0,
              c2 = num % 4 >= 2 ? 255 : 0,
              c3 = num % 2 ? 255 : 0;
            colors_[k][i][j] = { R: c1, G: c2, B: c3 };
            // console.log(colors_[k][i][j]);
            cnt++;
          }
        } else {
          for (let j = 15; j > -1; j--) {
            let num = Number(str[cnt]);
            let c1 = num >= 4 ? 255 : 0,
              c2 = num % 4 >= 2 ? 255 : 0,
              c3 = num % 2 ? 255 : 0;
            colors_[k][i][j] = { R: c1, G: c2, B: c3 };
            cnt++;
          }
        }
      }
    }

    setColors(colors_);

    // 頭 -> 右手 -> 身體 -> 左手 -> 左腳 -> 右腳
    let num = Number(str[cnt]);
    //console.log(cnt);
    const headR = num >= 4 ? 255 : 0;
    num %= 4;
    const headG = num >= 2 ? 255 : 0;
    num %= 2;
    const headB = num ? 255 : 0;
    // console.log();
    // console.log(headR,headG,headB);
    setHeadRgb({ R: headR, G: headG, B: headB });
    cnt++;

    num = Number(str[cnt]);
    const leftHandR = num >= 4 ? 255 : 0;
    num %= 4;
    const leftHandG = num >= 2 ? 255 : 0;
    num %= 2;
    const leftHandB = num ? 255 : 0;
    setLeftHandRgb({ R: leftHandR, G: leftHandG, B: leftHandB });
    cnt++;

    num = Number(str[cnt]);
    const bodyR = num >= 4 ? 255 : 0;
    num %= 4;
    const bodyG = num >= 2 ? 255 : 0;
    num %= 2;
    const bodyB = num ? 255 : 0;
    setBodyRgb({ R: bodyR, G: bodyG, B: bodyB });
    cnt++;

    num = Number(str[cnt]);
    const rightHandR = num >= 4 ? 255 : 0;
    num %= 4;
    const rightHandG = num >= 2 ? 255 : 0;
    num %= 2;
    const rightHandB = num ? 255 : 0;
    setRightHandRgb({ R: rightHandR, G: rightHandG, B: rightHandB });
    cnt++;

    num = Number(str[cnt]);
    const rightLegR = num >= 4 ? 255 : 0;
    num %= 4;
    const rightLegG = num >= 2 ? 255 : 0;
    num %= 2;
    const rightLegB = num ? 255 : 0;
    setRightLegRgb({ R: rightLegR, G: rightLegG, B: rightLegB });
    cnt++;

    num = Number(str[cnt]);
    const leftLegR = num >= 4 ? 255 : 0;
    num %= 4;
    const leftLegG = num >= 2 ? 255 : 0;
    num %= 2;
    const leftLegB = num ? 255 : 0;
    setLeftLegRgb({ R: leftLegR, G: leftLegG, B: leftLegB });
    cnt++;
  };

  const backgroud = () => {
    const lineColors = [];

    for (let i = 0; i < 16; i++) {
      // lineColors.push({ R: rgb.R, G: rgb.G, B: rgb.B });
    }

    const allColorsOfABlock = [];

    for (let i = 0; i < 16; i++) {
      allColorsOfABlock.push([...lineColors]);
    }

    const allColors = [];

    for (let i = 0; i < 9; ++i) {
      allColors.push([...allColorsOfABlock]);
    }

    setColors(allColors);
  };

  const setColor = (theColor) => {
    console.log(theColor);
    setRgba(theColor);
  };
  const listitem = [<Palette rgba={rgba} setRgba={setRgba} />];

  return (
    <Router>
      <Routes>
        <Route
          path="/home"
          element={
            <div className="homepage">
              {/* <UploadBottom /> */}
              {/* <div
        className="palette_background"
        style={{
          position: "absolute",
          right: "30px",
          top: "10px",
        }}
      ></div> */}

              {/* <StartButton
        currentTime={currentTime}
        setCurrentTime={setCurrentTime}
        buttonState={buttonState}
        setButtonState={setButtonState}
      /> */}
              <div className="palette-container">
                {listitem}
                <TransparentButton rgba={rgba} setRgba={setRgba} />
              </div>

              <div className="people-container">
                <People
                  colors={colors}
                  currentTime={currentTime}
                  setColors={setColors}
                  colorDataUnit={colorDataUnit}
                  rgba={rgba}
                  buttonState={buttonState}
                />
              </div>

              <div className="panel">
                <button className="output-button" onClick={output}>
                  Output
                </button>

                <button className="load-button" onClick={loading}>
                  Load
                </button>
              </div>

              <div className="bar">
                <ControlPanel
                  onFlagMove={(position) => console.log(position)}
                  currentTime={currentTime}
                  setCurrentTime={setCurrentTime}
                  setButtonState={setButtonState}
                />
              </div>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
