import { useMemo, memo } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./Armor.css";
import { PART_KEYS } from "../constants/parts.js";
import { TICK_MS } from "../constants/time.js";
import { getColorAt, insertColorSegment } from "../utils/segments/color.js";
import {
  updateCurrentTime,
  updateDancerVisibility,
  updateSelectedDancer,
} from "../redux/actions";
import { useSegmentArmorTimelines } from "../hooks/useSegmentActionTable.js";
import {
  ARMOR_FLOOR,
  ARMOR_SHAPES,
  ARMOR_VIEWBOX,
  radiusOf,
} from "../config/armorShapes.js";
import { ACCESSORY_CONFIGS } from "../config/accessoryConfig.js";

const Armor = (props) => {
  const dispatch = useDispatch();
  // 只訂閱**自己這位舞者**的 22 個部位。訂閱整張表的話，
  // 任何舞者被編輯都會讓 7 個 Armor 全部重算 22 個顏色。
  const { armorSegments, commitPart } = useSegmentArmorTimelines(props.index);
  const time = useSelector((state) => state.profiles.currentTime);
  const duration = useSelector((state) => state.profiles.duration);
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const multiSelectedBlocks = useSelector(
    (state) => state.profiles.multiSelectedBlocks,
  );
  const selectedDancerId = useSelector(
    (state) => state.profiles.selectedDancerId,
  );
  const dancerVisibility = useSelector(
    (state) => state.profiles.dancerVisibility,
  );

  /** 把這位舞者收起來。叫回來的入口在卡片外面（見 DancerToggle.jsx） */
  const hideDancer = () => {
    const next = [...dancerVisibility];
    next[props.index] = false;
    dispatch(updateDancerVisibility(next));
  };
  const myId = props.index;

  // 新的部位名稱（對應 Home.jsx 的輸出映射）
  const partNames = PART_KEYS;

  // 根據部位和當前時間計算顏色。
  //
  // 舊版在這裡自己走一遍「找前後關鍵格、判斷是不是漸變、插值」的邏輯
  // （飾品面板還有一份幾乎相同的複本）。segment 模型把這件事收斂成
  // `getColorAt`：空隙回傳黑色、漸變段內回傳插值，兩個元件共用同一份。
  const getColorForPart = (part) => {
    const { R, G, B, A } = getColorAt(armorSegments[part], time);
    return `rgba(${R}, ${G}, ${B}, ${A})`;
  };

  const colors = useMemo(
    () =>
      Object.fromEntries(
        partNames.map((name, index) => [name, getColorForPart(index)]),
      ),
    [time, armorSegments, myId],
  );

  function insertArray(part) {
    const nowTime = Math.floor(time / TICK_MS) * TICK_MS;
    dispatch(updateCurrentTime(nowTime));

    commitPart(
      part,
      insertColorSegment(armorSegments[part], {
        time: nowTime,
        color: chosenColor,
        duration,
      }),
    );
  }

  /** 這位是不是目前選取的舞者 */
  const isCurrentDancer = selectedDancerId === myId;

  /** 這位舞者的道具（沒有配置就是沒帶道具） */
  const accessory = ACCESSORY_CONFIGS[myId] ?? null;

  const isSelected = (part) => {
    return multiSelectedBlocks.some(
      (b) => b.armorIndex === myId && b.partIndex === part,
    );
  };

  // 處理部位顏色更改
  const handleColorChange = (part) => {
    insertArray(part);
  };

  /**
   * 一個形狀畫成 SVG 元素。
   *
   * 圖形與選取高亮吃**同一組座標**：高亮只是把 fill 換成 none、加一圈描邊。
   * 舊版兩份座標各寫一遍，鞋子的高亮框因此比鞋子本身高 10px。
   */
  const renderShape = (shape, key, { highlight = false, part = 0 } = {}) => {
    // key 不能混在 spread 裡（React 會警告並且拿不到它），所以獨立傳
    const attrs = highlight
      ? { fill: "none", className: "armor-highlight" }
      : {
          // 部位編號寫在元素上，讓測試（單元與 e2e）可以直接指名要點哪個部位。
          // 先前兩邊都用「第 N 個有 fill 的元素」，帽子與領帶各有兩個形狀之後
          // 位置就對不上了——而且不會報錯，只會靜默點到別的部位。
          "data-part": part,
          fill: colors[partNames[part]],
          onClick: () => handleColorChange(part),
        };

    if (shape.kind === "circle") {
      return (
        <circle key={key} {...attrs} cx={shape.cx} cy={shape.cy} r={shape.r} />
      );
    }
    if (shape.kind === "polygon") {
      return <polygon key={key} {...attrs} points={shape.points} />;
    }
    return (
      <rect
        key={key}
        {...attrs}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={radiusOf(shape)}
      />
    );
  };


  return (
    <div
      // 選到的那位要看得出來——右邊的「裝備編輯」顯示的就是他，
      // 沒有標記的話使用者只能靠記憶對應
      className={`armor-container${isCurrentDancer ? " is-current" : ""}`}
      onClick={() => dispatch(updateSelectedDancer(myId))}
    >
      <div className="dancer-label">
        <span className="dancer-label__name">舞者 {myId + 1}</span>
        {/*
          隱藏這位舞者。放在卡片自己的標題列上，「關掉這位」的按鈕就在這位身上
          ——舊版是光衣下面另一整列 50px 的開關，佔掉約 66px 而且平常不會用到。
          叫回來的入口在卡片外面（`DancerToggle.jsx`），因為卡片一隱藏，
          長在它上面的按鈕就跟著消失了。
        */}
        <button
          type="button"
          className="dancer-hide"
          data-testid={`dancer-hide-${myId}`}
          title={`隱藏舞者 ${myId + 1}`}
          aria-label={`隱藏舞者 ${myId + 1}`}
          onClick={(e) => {
            e.stopPropagation(); // 不要順便把整張卡片當成「選這位舞者」
            hideDancer();
          }}
        >
          ×
        </button>
      </div>
      <div className="armor-body">
      <svg className="armor-figure" viewBox={ARMOR_VIEWBOX}>
        {/* 舞台地板：讓光衣看起來是站著的，而不是浮在卡片中間 */}
        <line
          className="armor-floor"
          x1={ARMOR_FLOOR.x1}
          y1={ARMOR_FLOOR.y}
          x2={ARMOR_FLOOR.x2}
          y2={ARMOR_FLOOR.y}
        />

        {ARMOR_SHAPES.map((shapes, part) =>
          shapes.map((shape, i) => renderShape(shape, `p${part}-${i}`, { part })),
        )}

        {/* 高亮畫在最後，才不會被後面的部位蓋掉 */}
        {ARMOR_SHAPES.map((shapes, part) =>
          isSelected(part)
            ? shapes.map((shape, i) =>
                renderShape(shape, `h${part}-${i}`, { highlight: true, part }),
              )
            : null,
        )}
      </svg>

        {/*
          道具就掛在人旁邊。
          飾品燈原本列在右側一個獨立的側欄裡，離它所屬的舞者好幾百像素遠——
          播放的時候你沒辦法一眼看出「這位舞者的刀亮了」。放在同一張卡片上、
          與光衣並排之後，播放時整個人連同手上的東西一起亮，看得出來是一體的。
        */}
        {accessory && (
          <div className="armor-props" title={accessory.name}>
            {accessory.groups.map((group) => (
              <div className="armor-props__group" key={group.label}>
                <span className="armor-props__label">{group.label}</span>
                <div className="armor-props__leds">
                  {group.indices.map((part) => (
                    <button
                      key={part}
                      type="button"
                      className="armor-props__led"
                      data-part={part}
                      aria-selected={isSelected(part)}
                      aria-label={`${accessory.name} ${group.label}`}
                      style={{ background: colors[partNames[part]] }}
                      onClick={(e) => {
                        e.stopPropagation(); // 不要順便把整張卡片當成「選這位舞者」
                        dispatch(updateSelectedDancer(myId));
                        handleColorChange(part);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(Armor);
