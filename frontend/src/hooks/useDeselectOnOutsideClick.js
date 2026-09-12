import { useEffect } from "react";
import { useDispatch } from "react-redux";

import {
  updateIsColorChangeActive,
  updateMultiSelectedBlocks,
} from "../redux/actions.js";

/**
 * 點在色塊以外的地方就取消選取 —— **全站只掛一次**。
 *
 * 這段邏輯原本寫在 `Timeline.jsx` 裡，而 Timeline 是逐軌渲染的：畫面上有幾條軌
 * 就有幾份**內容完全相同**的 document listener（工作集開滿是 154 份）。每次點擊
 * 瀏覽器要把它們全部跑一遍，每一份各自做十次 `closest()` 查詢，然後各自
 * dispatch 一次同樣的清空動作。功能正確，但那是同一件事做 154 遍。
 *
 * 它本來就不是「某一條軌」的行為——清空的是全域選取，跟 listener 掛在誰身上
 * 無關。收成一份之後行為完全不變，只是少了 153 份副本。
 *
 * ## 這裡列的是「點了不該取消選取」的地方
 *
 * 選取存在的意義就是給接下來的操作用，所以**所有會對選取做事的控制項**都得
 * 排除掉——工具列的剪下、刪除、改色、亮度、效果選單、統一透明度、調色盤的
 * 色票……漏掉任何一個，使用者按下去的瞬間選取就沒了，那顆按鈕會變成
 * 「按了沒反應」。
 *
 * ⚠️ 新增會操作選取的控制項時，記得把它的容器加進這份清單。
 */
const KEEPS_SELECTION = [
  ".timeline-block",
  ".palette-color-picker",
  ".color-button",
  ".delete-button",
  ".timeline-controls",
  ".waveform-container",
  ".brightness-control",
  ".cut-button",
  ".effect-wrapper",
  ".uniform-alpha-wrapper",
];

export function useDeselectOnOutsideClick() {
  const dispatch = useDispatch();

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const target = event.target;
      if (!target?.closest) return; // 例如點在 document 本身

      if (KEEPS_SELECTION.some((selector) => target.closest(selector))) return;

      dispatch(updateMultiSelectedBlocks([]));
      dispatch(updateIsColorChangeActive(false));
    };

    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [dispatch]);
}

export default useDeselectOnOutsideClick;
