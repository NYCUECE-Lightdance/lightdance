import { useDispatch, useSelector } from "react-redux";
import { updateDancerVisibility } from "../redux/actions";
import "./DancerToggle.css";

/**
 * 舞者的顯示 / 隱藏。
 *
 * ## 為什麼從一整排開關變成兩塊
 *
 * 舊版是光衣那一列下面**再一整列** 50px 的方形開關，七個一字排開，光是那一列
 * 連同上下留白就吃掉約 66px 的垂直空間——而畫面上最需要空間的正是光衣本身
 * （它要塞下 22 個部位加道具）。而且那一列在多數時候是**完全沒有作用的**：
 * 平常七位舞者都顯示著，七個開關全部亮著、誰都不會去點。
 *
 * 現在拆成兩塊，代價與使用頻率對得起來：
 *
 * - **隱藏**：按鈕收進每張光衣卡片自己的標題列（`Armor.jsx` 的 `.dancer-label`）。
 *   不佔額外的列，而且「關掉這位」的按鈕就在這位身上，不必再靠位置對應
 * - **叫回來**：只有**真的有人被隱藏時**才出現一條細長的提示列（就是這個元件）。
 *   全部顯示時它完全不 render，不佔任何空間
 *
 * ⚠️ **叫回來的入口不能放在被隱藏的那張卡片上。** 卡片被隱藏之後那個按鈕
 * 也跟著消失，使用者就沒有辦法讓它回來了——軌道的「眼睛」按鈕當初就是這樣
 * 被移除的（見 CLAUDE.md）。所以恢復的入口一定要在卡片外面。
 */
const DancerToggle = () => {
  const dispatch = useDispatch();
  const dancerVisibility = useSelector(
    (state) => state.profiles.dancerVisibility,
  );

  const hidden = (dancerVisibility ?? [])
    .map((isVisible, index) => (isVisible ? null : index))
    .filter((index) => index !== null);

  // 全部都看得到就完全不佔空間——這是絕大多數時候的狀態
  if (hidden.length === 0) return null;

  const show = (index) => {
    const next = [...dancerVisibility];
    next[index] = true;
    dispatch(updateDancerVisibility(next));
  };

  const showAll = () =>
    dispatch(updateDancerVisibility(dancerVisibility.map(() => true)));

  return (
    <div className="hidden-dancers" data-testid="hidden-dancers">
      <span className="hidden-dancers__label">已隱藏</span>
      {hidden.map((index) => (
        <button
          key={index}
          type="button"
          className="ld-btn ld-btn--ghost hidden-dancers__chip"
          onClick={() => show(index)}
          title={`顯示舞者 ${index + 1}`}
        >
          {index + 1}
        </button>
      ))}
      {hidden.length > 1 && (
        <button
          type="button"
          className="ld-btn ld-btn--ghost hidden-dancers__all"
          onClick={showAll}
        >
          全部顯示
        </button>
      )}
    </div>
  );
};

export default DancerToggle;
