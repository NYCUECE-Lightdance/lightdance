// EffectMenu — 效果按鈕 + 一級下拉選單（漸變 / 頻閃）。
// 漸變的二級設定 panel 已移除（dead UI；新規格 B6 改成「使用者選首尾顏色」，
// 待 EffectMenu 之外的色塊選擇器 UI 完成後再加回）。
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";

export default function EffectMenu({ onSetLinear, onApplyBlink }) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <div className="effect-wrapper">
      <button className="effect-button" onClick={() => setOpen((v) => !v)}>
        <FontAwesomeIcon icon={faWandMagicSparkles} size="lg" />
        <span className="tooltip">Effect</span>
      </button>

      {open && (
        <div className="effect-menu">
          <div
            className="effect-menu-item"
            onClick={() => {
              onSetLinear();
              close();
            }}
          >
            漸變 (L)
          </div>
          <div
            className="effect-menu-item"
            onClick={() => {
              const userInput = window.prompt(
                "請輸入頻閃間隔 (ms)，必須為 50 的倍數：",
                "100"
              );
              if (userInput !== null) onApplyBlink(userInput);
              close();
            }}
          >
            頻閃 (B)
          </div>
        </div>
      )}
    </div>
  );
}
