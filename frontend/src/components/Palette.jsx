import React, { useEffect, useRef, useState } from "react";
import { FaEyeDropper } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";

import "./Palette.css";
import {
  updateChosenColor,
  updateFavoriteColor,
  updatePaletteColor,
} from "../redux/actions";
import {
  FAVORITE_SLOTS,
  HEX_PATTERN,
  hexToRgb,
  isNormalizedFavorites,
  normalizeFavorites,
  rgbToHex,
  setFavoriteSlot,
} from "../utils/palette.js";

/**
 * 調色盤 —— 上半部右側唯一的欄（200px 寬）。
 *
 * 由上而下：目前顏色（調色器 + HEX + 亮度）、最近使用、最愛色。
 * 三塊的關係是「正在調的 → 剛用過的 → 存起來的」，越往下越持久。
 *
 * ## 這一版改掉的三件事
 *
 * **點色票的預設行為是覆蓋。** 舊版用一支 `<input type="range" min=0 max=1
 * step=1>` 當「填色 / 取色」的開關，而預設在「填色」那一端——也就是點任何一格
 * 最愛色都會**把它蓋成目前的顏色**。使用者要拿出存好的顏色，得先發現那支滑桿
 * 是個開關並把它推到另一端。破壞性的操作不該是預設值，而且開關不該長得像
 * 連續值的滑桿。現在預設是「使用」，要覆蓋得先切到「存色」。
 *
 * **亮度只有六段。** 舊版是 `(parseInt(A*10) ± 2) / 10` 的加減按鈕，走得到的
 * 值只有 0/0.2/0.4/0.6/0.8/1.0 六個，而 `Ctrl+1~9` 早就能設 10%~90%——
 * 同一個屬性兩套精度，滑桿設得出來的值按鈕調不到。改成滑桿之後兩邊一致。
 *
 * **沒有「最近用過」。** 每個顏色都得先想到要存才留得住，否則調完就沒了。
 * 最近使用由 reducer 自動維護（見 `UPDATECHOSENCOLOR`），不需要使用者動手。
 */

/** 亮度滑桿的刻度：1% 一格，和 `Ctrl+1~9` 走的 10% 級距相容 */
const ALPHA_STEP = 0.01;

function Palette({ rgba, setRgba }) {
  const dispatch = useDispatch();
  const favoriteColor = useSelector((state) => state.profiles.favoriteColor);
  const recentColors = useSelector((state) => state.profiles.recentColors);
  const chosenColor = useSelector((state) => state.profiles.chosenColor);
  const paletteColor = useSelector((state) => state.profiles.paletteColor);

  /** 點最愛色是要「拿出來用」還是「存進去」。預設拿出來用——覆蓋是破壞性的 */
  const [saveMode, setSaveMode] = useState(false);

  const favorites = normalizeFavorites(favoriteColor);
  const recents = Array.isArray(recentColors) ? recentColors : [];

  /*
   * 把 store 裡的舊形狀收成一維六格。
   *
   * 舊版存的是二維陣列（色票排過 4×2 與 2×3），而排版是 CSS 的事，
   * 資料只需要「第幾格」。已經是正規形狀就不 dispatch——這個 effect 依賴
   * `favoriteColor`，少了這道判斷會無限重繪（同樣的洞在 audioplayer 的
   * 調色盤 effect 上出現過一次）。
   */
  useEffect(() => {
    if (isNormalizedFavorites(favoriteColor)) return;
    dispatch(updateFavoriteColor(normalizeFavorites(favoriteColor)));
  }, [dispatch, favoriteColor]);

  /*
   * HEX 欄位需要自己的草稿狀態：使用者一個字一個字打的時候會經過
   * `#F`、`#FF3`… 這些還不合法的中間狀態，不能每次按鍵都去改顏色。
   * 只有輸入完整的 6 位色碼才真的套用，離開欄位時再同步回目前顏色。
   */
  const [hexDraft, setHexDraft] = useState(paletteColor);
  useEffect(() => {
    setHexDraft((paletteColor ?? "#000000").toUpperCase());
  }, [paletteColor]);

  /** 選一個顏色：同步 HEX 欄位、chosenColor 與呼叫端持有的 rgba */
  const chooseColor = (color) => {
    const alpha = color.A ?? chosenColor?.A ?? 1;
    const next = { R: color.R, G: color.G, B: color.B, A: alpha };
    dispatch(updatePaletteColor(rgbToHex(next)));
    dispatch(updateChosenColor(next));
    setRgba?.(next);
  };

  const handleHexChange = (event) => {
    const next = event.target.value.toUpperCase();
    setHexDraft(next);
    const rgb = hexToRgb(next);
    if (rgb) chooseColor(rgb);
  };

  /*
   * 調色器**只在使用者確定之後才取色**。
   *
   * `<input type="color">` 有兩個事件：拖過色域的每一格都會發 `input`，
   * 使用者確定（關掉原生對話框）才發 `change`。React 的 `onChange` 綁的是
   * 前者——所以舊版是「滑鼠在色盤上滑過哪裡，選取的色塊就跟著變成哪個顏色」。
   *
   * 那不只是閃：`chosenColor` 一變就會觸發 `applyColorToSelection`，於是滑過
   * 去的**每一個中間色都寫進光表、各佔一格 undo**，選完一個顏色之後要按幾十次
   * Ctrl+Z 才回得去。「最近使用」也會被沿途經過的色相塞滿（它只比色相）。
   *
   * 所以這裡不綁 React 的 onChange，改成 uncontrolled + 監聽原生的 `change`：
   * 拖曳期間完全不進 React，放開才提交一次。
   */
  const pickerRef = useRef(null);
  const chooseColorRef = useRef(chooseColor);
  chooseColorRef.current = chooseColor;

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;

    const commit = () => {
      const rgb = hexToRgb(picker.value);
      if (rgb) chooseColorRef.current(rgb);
    };

    picker.addEventListener("change", commit);
    return () => picker.removeEventListener("change", commit);
  }, []);

  /*
   * 顏色從別的地方改變時（HEX 欄位、最愛色、工具列的「改色」）把調色器同步過去。
   * 它是 uncontrolled 的，所以要自己寫回 DOM——沒寫的話下次打開色盤時顯示的
   * 還是上一個顏色。
   */
  useEffect(() => {
    if (pickerRef.current && HEX_PATTERN.test(paletteColor)) {
      pickerRef.current.value = paletteColor;
    }
  }, [paletteColor]);

  /** 亮度 = LED 的 alpha。只改 A，色相不動 */
  const setAlpha = (alpha) => {
    dispatch(updateChosenColor({ ...chosenColor, A: alpha }));
    setRgba?.({ ...(rgba ?? chosenColor), A: alpha });
  };

  const alpha = chosenColor?.A ?? 1;

  const saveToSlot = (index) => {
    dispatch(
      updateFavoriteColor(setFavoriteSlot(favoriteColor, index, chosenColor)),
    );
  };

  /*
   * 空格一律是「存進去」，不看目前是哪個模式——空的格子沒有東西可以拿出來用，
   * 所以那個動作沒有歧義，也不會蓋掉任何東西。
   */
  const handleFavoriteClick = (index) => {
    const color = favorites[index];
    if (!color || saveMode) saveToSlot(index);
    else chooseColor(color);
  };

  /** 右鍵存色：不必先切模式，給熟了之後的人用 */
  const handleFavoriteContextMenu = (event, index) => {
    event.preventDefault();
    saveToSlot(index);
  };

  const swatchStyle = (color) => ({
    // 亮度是 LED 的 alpha，會和後面的底色合成——這裡直接乘進去而不是用
    // rgba()，讓色票顯示的就是實際演出時的亮度（和光衣站在黑卡上同一個理由）
    backgroundColor: `rgb(${color.R * (color.A ?? 1)}, ${
      color.G * (color.A ?? 1)
    }, ${color.B * (color.A ?? 1)})`,
  });

  return (
    <div className="palette">
      {/*
        調色器與 HEX/亮度並排成一列。
        直排的話光是調色盤就 272px，而這一欄在 1280×800 下只有 220px，
        下半部的控制項會掉到可視範圍外。
      */}
      <div className="palette-row">
        <input
          className="palette-color-picker"
          type="color"
          // uncontrolled：拖過色域的 `input` 事件不進 React，只有原生的
          // `change`（使用者確定）才提交。見上面 `pickerRef` 那段的說明
          ref={pickerRef}
          defaultValue={HEX_PATTERN.test(paletteColor) ? paletteColor : "#000000"}
          id="colorWell"
          aria-label="選擇顏色"
        />
        <div className="palette-row__fields">
          {/*
            原本這個位置顯示的是打包後的 32-bit RGBA 整數（例如 84215140）——
            那是 debug 產物，對使用者沒有意義。位置本來就該回答「目前顏色是
            什麼」，所以換成看得懂、也能貼色碼進去的 HEX 欄位。
          */}
          <div className="hex-field">
            <label htmlFor="hexInput">HEX</label>
            <input
              id="hexInput"
              type="text"
              value={hexDraft}
              spellCheck={false}
              maxLength={7}
              aria-label="目前顏色的 HEX 色碼"
              onChange={handleHexChange}
              onBlur={() => setHexDraft(rgbToHex(chosenColor))}
            />
          </div>

          {/*
            亮度。舊版是 ±20% 的加減按鈕（只有六段），滑桿設得出來的中間值
            按鈕調不到，而 Ctrl+1~9 早就在設 10%~90%。
          */}
          <div className="alpha-field">
            <span className="alpha-field__label">亮度</span>
            <input
              type="range"
              className="alpha-slider"
              min={0}
              max={1}
              step={ALPHA_STEP}
              value={alpha}
              aria-label="亮度"
              onChange={(event) => setAlpha(Number(event.target.value))}
            />
            <span className="alpha-field__value">
              {Math.round(alpha * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/*
        最近使用。使用者不必先想到「這個顏色等一下還會用到」才留得住它——
        調完色直接畫，回頭想再用同一個顏色時它還在。
      */}
      <div className="palette-section">
        <div className="palette-section__head">
          <span>最近</span>
        </div>
        <div className="swatch-row">
          {Array.from({ length: FAVORITE_SLOTS }, (_, i) => {
            const color = recents[i];
            if (!color) {
              return <span key={i} className="swatch swatch--placeholder" />;
            }
            return (
              <button
                key={i}
                type="button"
                className="swatch"
                style={swatchStyle(color)}
                title={`${rgbToHex(color)} · ${Math.round((color.A ?? 1) * 100)}%`}
                onClick={() => chooseColor(color)}
              />
            );
          })}
        </div>
      </div>

      {/*
        最愛色。點下去的預設行為是「拿出來用」，要覆蓋得先切到「存色」——
        舊版的預設是覆蓋，存好的顏色一不小心就被蓋掉了。
      */}
      <div className="palette-section">
        <div className="palette-section__head">
          <span>最愛</span>
          <div className="mode-switch" role="group" aria-label="最愛色的點擊行為">
            <button
              type="button"
              className="mode-switch__option"
              aria-pressed={!saveMode}
              onClick={() => setSaveMode(false)}
            >
              <FaEyeDropper /> 使用
            </button>
            <button
              type="button"
              className="mode-switch__option"
              aria-pressed={saveMode}
              onClick={() => setSaveMode(true)}
            >
              存色
            </button>
          </div>
        </div>
        <div className="swatch-row">
          {favorites.map((color, index) => (
            <button
              key={index}
              type="button"
              className={`swatch favorite_color_sample${
                color ? "" : " swatch--empty"
              }`}
              style={color ? swatchStyle(color) : undefined}
              title={
                color
                  ? `${index + 1}　${rgbToHex(color)} · ${Math.round(
                      (color.A ?? 1) * 100,
                    )}%${saveMode ? "（點擊覆蓋）" : "（點擊使用，快捷鍵 " + (index + 1) + "）"}`
                  : `第 ${index + 1} 格是空的，點擊存入目前顏色`
              }
              onClick={() => handleFavoriteClick(index)}
              onContextMenu={(event) => handleFavoriteContextMenu(event, index)}
            >
              {color ? null : "+"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Palette;
