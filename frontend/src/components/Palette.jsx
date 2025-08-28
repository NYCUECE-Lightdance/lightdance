import React from "react";
import { useState, useEffect } from "react";
import "./Palette.css";
import TransparentButton from "./TransparentButton";
import { RiSketching } from "react-icons/ri";
import { FaEyeDropper } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import {
  updateChosenColor,
  updatePaletteColor,
  updateFavoriteColor,
} from "../redux/actions";

function Palette({ rgba, setRgba }) {
  const dispatch = useDispatch();
  const favoriteColor = useSelector((state) => state.profiles.favoriteColor);
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const paletteColor = useSelector((state) => state.profiles.paletteColor);

  // const [inputValue, setInputValue] = useState("#000000");
  const [clickStatus, setClickStatus] = useState(false);
  const [toggleState, setToggleState] = useState(false); //

  const color =
    ((chosenColor.R & 0xff) << 24) |
    ((chosenColor.G & 0xff) << 16) |
    ((chosenColor.B & 0xff) << 8) |
    ((chosenColor.A * 100) & 0xff);
  let unsignedColor = color >>> 0;

  useEffect(() => {
    if (favoriteColor.length > 0) return;
    const tmpArray = [];
    for (let i = 0; i < 2; i++) {
      tmpArray.push({ R: 255, G: 255, B: 255, A: 1 });
    }
    const array = [];
    for (let i = 0; i < 4; i++) {
      array.push([...tmpArray]);
    }
    dispatch(updateFavoriteColor(array));
  }, [dispatch]);

  useEffect(() => {
    const sample = document.getElementById("thecolorsample");
    if (sample) {
      sample.addEventListener("click", function (event) {
        if (event.target) {
          document.querySelector("#colorWell").click();
        }
      });
    }

    // 清理事件监听器
    return () => {
      if (sample) {
        sample.removeEventListener("click", function (event) {
          if (event.target) {
            document.querySelector("#colorWell").click();
          }
        });
      }
    };
  }, []);

  const handleColorChange = (event) => {
    const newColor = event.target.value;
    dispatch(updatePaletteColor(newColor));

    const hexToRgba = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const a = chosenColor.A !== undefined ? chosenColor.A : 1; // 保持透明度不變
      return { R: r, G: g, B: b, A: a };
    };
    const rgbaColor = hexToRgba(newColor);
    dispatch(updateChosenColor(rgbaColor)); // 更新 Redux 狀態中的 chosenColor
  };

  useEffect(() => {
    console.log("顏色已變為:", chosenColor); // 侦测颜色变化
  }, [chosenColor]); // 每次 color 更新时触发

  const handleToggleChange = () => {
    setToggleState(!toggleState); // 切換滑桿狀態
    setClickStatus(!clickStatus); // 同步修改 clickStatus
  };

  const setSampleColor = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    let a = rgba.A !== undefined ? rgba.A : 1;
    setRgba({ R: r, G: g, B: b, A: a });
    dispatch(updateChosenColor({ R: r, G: g, B: b, A: a }));
  };

  function deepClone2DArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return arr;
    }
    const clone = [];
    for (let i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        clone.push(deepClone2DArray(arr[i])); // Recursively clone nested arrays
      } else {
        clone.push(arr[i]); // Copy non-array elements
      }
    }
    return clone;
  }

  const handleClick = (lineId, squareId) => {
    if (clickStatus) {
      handleChooseFavoriteColor(lineId, squareId);
    } else {
      handleChangeFavoriteColor(lineId, squareId);
    }
  };

  function handleChooseFavoriteColor(lineId, squareId) {
    var it = favoriteColor[lineId][squareId];
    dispatch(updateChosenColor({ R: it.R, G: it.G, B: it.B, A: it.A }));

    let hexString =
      "#" +
      ((1 << 24) | (it.R << 16) | (it.G << 8) | it.B)
        .toString(16)
        .slice(1)
        .toUpperCase();
    dispatch(updatePaletteColor(hexString));
  }

  function handleChangeFavoriteColor(lineId, squareId) {
    let tmpArray = deepClone2DArray(favoriteColor);
    let alpha = chosenColor.A !== undefined ? chosenColor.A : 1;
    tmpArray[lineId][squareId] = {
      R: chosenColor.R,
      G: chosenColor.G,
      B: chosenColor.B,
      A: alpha,
    };

    // setFavoriteColor(tmpArray);
    dispatch(updateFavoriteColor(tmpArray));
  }


  return (
    <div className="palette">
      <input
        className="palette-color-picker"
        type="color"
        value={paletteColor}
        id="colorWell"
        onChange={handleColorChange}
      />{" "}
      <TransparentButton rgba={rgba} setRgba={setRgba} />
      <div className="unsignedColor" style={{ color: "white" }}>
        {unsignedColor}
      </div>
      <div className="favorite_color_background">
        {favoriteColor.map((colorArray, lineId) => (
          <div key={lineId} className="favorite_color_line">
            {colorArray.map((color, squareId) => (
              <div
                key={squareId}
                className="favorite_color_sample"
                color={color}
                style={{
                  backgroundColor: `rgb(${color.R * color.A}, ${
                    color.G * color.A
                  }, ${color.B * color.A})`,
                  zIndex: "100",
                }}
                onClick={() => handleClick(lineId, squareId)}
              />
            ))}
          </div>
        ))}
        <div className="color-status">
          <span
            style={{
              color: toggleState ? "#808080" : "#FFFFFF",
              transition: "color 0.5 ease",
            }}
          >
            <RiSketching /> 填色
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="1"
            value={toggleState ? 1 : 0} // 根據 toggleState 控制滑桿位置
            onMouseDown={handleToggleChange}
            className="color-slider" // 使用外部 CSS 樣式
          />
          <span
            style={{
              color: toggleState ? "#FFFFFF" : "#808080", // toggleState=0時，取色變灰色
              transition: "color 0.5 ease",
            }}
          >
            <FaEyeDropper /> 取色
          </span>
        </div>
      </div>
    </div>
  );
}

export default Palette;
