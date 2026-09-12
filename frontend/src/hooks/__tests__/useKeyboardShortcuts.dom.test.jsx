import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { useKeyboardShortcuts } from "../useKeyboardShortcuts.js";

/**
 * `useKeyboardShortcuts` 的比對規則測試。
 *
 * 這個 hook 取代了三個各自為政的 document keydown listener，所以它的
 * 比對語意（尤其是「所有符合的綁定都會執行」和防彈跳）必須被鎖住。
 */

const Harness = ({ bindings, options }) => {
  useKeyboardShortcuts(bindings, options);
  return null;
};

const mount = (bindings, options) =>
  render(<Harness bindings={bindings} options={options} />);

const press = (key, options = {}) =>
  fireEvent.keyDown(document, { key, ...options });

describe("按鍵比對", () => {
  it("key 不分大小寫", () => {
    const handler = vi.fn();
    mount([{ key: "m", handler }]);

    press("M");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("key 可以給一組候選", () => {
    const handler = vi.fn();
    mount([{ key: ["Delete", "Backspace"], handler }]);

    press("Backspace");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ctrl/shift 沒寫就是不管", () => {
    const handler = vi.fn();
    mount([{ key: "m", handler }]);

    press("m", { ctrlKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ctrl: false 要求沒按 Ctrl", () => {
    const handler = vi.fn();
    mount([{ key: "c", ctrl: false, handler }], { debounceMs: 0 });

    press("c", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();

    press("c");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("code 可以用正規表示式（Shift+數字的 key 會變成符號）", () => {
    const handler = vi.fn();
    mount([{ code: /^Digit[1-8]$/, shift: true, handler }]);

    press("!", { shiftKey: true, code: "Digit1" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("when 可以再加條件", () => {
    const handler = vi.fn();
    let enabled = false;
    mount([{ key: "Escape", when: () => enabled, handler }], { debounceMs: 0 });

    press("Escape");
    expect(handler).not.toHaveBeenCalled();

    enabled = true;
    press("Escape");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("所有符合的綁定都會執行", () => {
  it("兩個綁定同時符合時兩個都跑", () => {
    // 這是刻意保留的語意：編輯器現有的 Shift+←/→ 和 Ctrl+1~8 就是這樣重疊的
    const first = vi.fn();
    const second = vi.fn();
    mount([
      { key: "ArrowRight", handler: first },
      { key: "ArrowRight", shift: true, handler: second },
    ]);

    press("ArrowRight", { shiftKey: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("防彈跳", () => {
  it("預設 100ms 內的第二次按鍵被忽略", () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      mount([{ key: "m", handler }]);

      press("m");
      press("m");
      expect(handler).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(150);
      press("m");
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("latch 是跨綁定共用的（和拆件前每個 listener 一個 latch 相同）", () => {
    vi.useFakeTimers();
    try {
      const first = vi.fn();
      const second = vi.fn();
      mount([
        { key: "m", handler: first },
        { key: "p", handler: second },
      ]);

      press("m");
      press("p"); // 不同鍵，但同一個 latch 還沒放開
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("debounceMs: 0 可以連發（Ctrl+Z 需要）", () => {
    const handler = vi.fn();
    mount([{ key: "z", ctrl: true, handler }], { debounceMs: 0 });

    press("z", { ctrlKey: true });
    press("z", { ctrlKey: true });
    press("z", { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(3);
  });
});

describe("修飾鍵不佔用防彈跳名額（瀏覽器實測抓到的 bug）", () => {
  /**
   * 真實按下 Ctrl+3 會依序產生兩個 keydown：`Control` 然後 `3`。
   *
   * 修修正前，`Control` 那一下會把 latch 鎖住 100ms，於是緊接著的 `3` 被
   * 當成連發丟掉——瀏覽器實測 Ctrl+0~9（亮度）與 Shift+1~8（插入最愛色）
   * 完全按不動。undo/redo 沒事只是因為它們註冊時傳了 `debounceMs: 0`。
   *
   * 元件測試抓不到是因為測試都直接送最終那一下按鍵，不會先送修飾鍵。
   */
  it("先送 Control 再送數字，數字仍然會觸發", () => {
    const handler = vi.fn();
    mount([{ key: "3", ctrl: true, handler }]);

    press("Control", { ctrlKey: true }); // 修飾鍵自己
    press("3", { ctrlKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("先送 Shift 再送數字鍵，一樣會觸發", () => {
    const handler = vi.fn();
    mount([{ code: /^Digit[1-8]$/, shift: true, handler }]);

    press("Shift", { shiftKey: true });
    press("!", { shiftKey: true, code: "Digit1" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("修飾鍵自己不會觸發任何綁定", () => {
    const handler = vi.fn();
    mount([{ ctrl: true, handler }]); // 沒指定 key，理論上什麼都符合

    press("Control", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
