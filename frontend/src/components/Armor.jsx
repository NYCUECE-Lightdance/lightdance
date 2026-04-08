import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./Armor.css";
import {
  updateActionTable,
  updateCurrentTime,
} from "../redux/actions";
import { insertColor } from "../utils/actionTable/insertColor.js";
import { binarySearchFirstGreater } from "../utils/actionTable/search.js";

const Armor = (props) => {
  const dispatch = useDispatch();
  const data = useSelector((state) => state.profiles.data);
  const actionTable = data?.actionTable || [];
  const time = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration);
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const multiSelectedBlocks = useSelector((state) => state.profiles.multiSelectedBlocks);
  const myId = props.index;

  useEffect(() => {
    console.log("data: ", data);
  }, [data]);

  // 新的部位名稱（對應 Home.jsx 的輸出映射）
  const partNames = [
    "hat",           // 0:帽子
    "face",          // 1:臉部
    "chestL",        // 2:左胸
    "chestR",        // 3:右胸
    "armL",          // 4:左手臂
    "armR",          // 5:右手臂
    "tie",           // 6:領帶
    "belt",          // 7:腰帶
    "gloveL",        // 8:左手套
    "gloveR",        // 9:右手套
    "legL",          // 10:左腿
    "legR",          // 11:右腿
    "shoeL",         // 12:左鞋
    "shoeR",         // 13:右鞋
    "board",         // 14:板子
  ];

  // 根據部位名稱和當前時間計算顏色
  const getColorForPart = (part) => {
    const partData = actionTable?.[myId]?.[part] || [];
    const timeIndex = binarySearchFirstGreater(partData, time);
    const prevData = partData?.[timeIndex - 1];
    const nextData = partData?.[timeIndex];

    if (prevData && prevData.linear === 1 && nextData) {
      const afterNextData = partData?.[timeIndex + 1];

      const startTime = prevData.time;
      const endTime = nextData.time;
      const currentTime = time;

      const startColor = prevData.color;
      const endColor = afterNextData?.color || { R: 0, G: 0, B: 0, A: 1 };

      if (endTime > startTime) {
        const ratio = (currentTime - startTime) / (endTime - startTime);
        const r = Math.round(
          startColor.R * (1 - ratio) + endColor.R * ratio
        );
        const g = Math.round(
          startColor.G * (1 - ratio) + endColor.G * ratio
        );
        const b = Math.round(
          startColor.B * (1 - ratio) + endColor.B * ratio
        );
        const startA = startColor.A ?? 1;
        const endA = endColor.A ?? 1;
        const a = startA * (1 - ratio) + endA * ratio;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
    }

    const colorData = prevData?.color || {
      R: 0,
      G: 0,
      B: 0,
      A: 1,
    };
    
    return `rgba(${colorData.R}, ${colorData.G}, ${colorData.B}, ${colorData.A})`;
  };

  const colors = Object.fromEntries(
    partNames.map((name, index) => [name, getColorForPart(index)])
  );

  function insertArray(part) {
    const { table, alignedTime } = insertColor(actionTable, {
      armor: myId,
      part,
      time,
      color: chosenColor,
      duration,
    });
    dispatch(updateCurrentTime(alignedTime));
    dispatch(updateActionTable(table));
  }

  const isSelected = (part) => {
    return multiSelectedBlocks.some(b => 
      b.armorIndex === myId && 
      b.partIndex === part
    );
  };

  // 處理部位顏色更改
  const handleColorChange = (part) => {
    insertArray(part);
  };

  // 渲染高亮邊框
  const renderHighlight = (
    x,
    y,
    width,
    height,
    shape = "rect",
    options = {}
  ) => {
    const { r = null, cx = null, cy = null } = options;

    if (shape === "rect") {
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke="white"
          strokeWidth="2"
        />
      );
    }

    if (shape === "circle") {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="2"
        />
      );
    }

    return null;
  };

  return (
    <div className="armor-container">
      {/* 舞者編號標籤 */}
      <div className="dancer-label">舞者 {myId + 1}</div>
      <svg width="242" height="480" viewBox="10 0 222 480">
        {/* 將所有 SVG 內容向下移動 35px，為標籤留出空間 */}
        <g transform="translate(0, 35)">
        {/*0:hat*/}
        {isSelected(0) && (
          <path
            d="M 96.8 5 L 145.2 5 L 145.2 23 L 169.4 23 L 169.4 38 L 72.6 38 L 72.6 23 L 96.8 23 Z"
            fill="none"
            stroke="white"
            strokeWidth="2"
          />
        )}
        <path
          d="M 96.8 5 L 145.2 5 L 145.2 23 L 169.4 23 L 169.4 38 L 72.6 38 L 72.6 23 L 96.8 23 Z"
          fill={colors.hat}
          onClick={() => handleColorChange(0)}
        />

        {/*1:face - 臉部*/}
        {isSelected(1) && renderHighlight(null, null, null, null, "circle", {
          r: 30,
          cx: 121,
          cy: 68
        })}
        <circle
          cx="121"
          cy="68"
          r="30"
          fill={colors.face}
          onClick={() => handleColorChange(1)}
        />

        {/*2:chestL - 左胸（螢幕左側）*/}
        {isSelected(2) && renderHighlight(72, 103, 28, 65)}
        <rect
          x="72"
          y="103"
          width="28"
          height="65"
          fill={colors.chestL}
          onClick={() => handleColorChange(2)}
        />

        {/*3:chestR - 右胸（螢幕右側）*/}
        {isSelected(3) && renderHighlight(142, 103, 28, 65)}
        <rect
          x="142"
          y="103"
          width="28"
          height="65"
          fill={colors.chestR}
          onClick={() => handleColorChange(3)}
        />

        {/*4:armL - 左手臂（螢幕左側）*/}
        {isSelected(4) && renderHighlight(35, 103, 32, 65)}
        <rect
          x="35"
          y="103"
          width="32"
          height="65"
          fill={colors.armL}
          onClick={() => handleColorChange(4)}
        />

        {/*5:armR - 右手臂（螢幕右側）*/}
        {isSelected(5) && renderHighlight(175, 103, 32, 65)}
        <rect
          x="175"
          y="103"
          width="32"
          height="65"
          fill={colors.armR}
          onClick={() => handleColorChange(5)}
        />

        {/*6:tie - 領帶*/}
        {isSelected(6) && renderHighlight(105, 103, 32, 50)}
        <rect
          x="105"
          y="103"
          width="32"
          height="50"
          fill={colors.tie}
          onClick={() => handleColorChange(6)}
        />
        {/* 領帶三角形 - 與矩形完美對齊 */}
        {isSelected(6) && (
        <polygon
         points="105,153 137,153 121,173"
         fill="none"
         stroke="white"
         strokeWidth="2"
        />
        )}
        <polygon
          points="105,153 137,153 121,173"
          fill={colors.tie}
          onClick={() => handleColorChange(6)}
        />


        {/*7:belt - 腰帶*/}
        {isSelected(7) && renderHighlight(78, 173, 86, 35)}
        <rect
          x="78"
          y="173"
          width="86"
          height="35"
          fill={colors.belt}
          onClick={() => handleColorChange(7)}
        />

        {/*8:gloveL - 左手套（螢幕左側）*/}
        {isSelected(8) && renderHighlight(35, 173, 32, 35)}
        <rect
          x="35"
          y="173"
          width="32"
          height="35"
          fill={colors.gloveL}
          onClick={() => handleColorChange(8)}
        />

        {/*9:gloveR - 右手套（螢幕右側）*/}
        {isSelected(9) && renderHighlight(175, 173, 32, 35)}
        <rect
          x="175"
          y="173"
          width="32"
          height="35"
          fill={colors.gloveR}
          onClick={() => handleColorChange(9)}
        />

        {/*10:legL - 左腿（螢幕左側）*/}
        {isSelected(10) && renderHighlight(85, 213, 28, 80)}
        <rect
          x="85"
          y="213"
          width="28"
          height="80"
          fill={colors.legL}
          onClick={() => handleColorChange(10)}
        />

        {/*11:legR - 右腿（螢幕右側）*/}
        {isSelected(11) && renderHighlight(129, 213, 28, 80)}
        <rect
          x="129"
          y="213"
          width="28"
          height="80"
          fill={colors.legR}
          onClick={() => handleColorChange(11)}
        />

        {/*12:shoeL - 左鞋（螢幕左側）*/}
        {isSelected(12) && renderHighlight(75, 298, 45, 25)}
        <rect
          x="75"
          y="298"
          width="45"
          height="15"
          fill={colors.shoeL}
          onClick={() => handleColorChange(12)}
        />

        {/*13:shoeR - 右鞋（螢幕右側）*/}
        {isSelected(13) && renderHighlight(122, 298, 45, 25)}
        <rect
          x="122"
          y="298"
          width="45"
          height="15"
          fill={colors.shoeR}
          onClick={() => handleColorChange(13)}
        />
        </g>
      </svg>
    </div>
  );
};

export default Armor;