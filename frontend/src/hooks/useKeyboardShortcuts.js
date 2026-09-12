import { useEffect, useRef } from "react";

/**
 * 把一組宣告式的快捷鍵綁定掛到 document 上。
 *
 * ```js
 * useKeyboardShortcuts([
 *   { key: "m", handler: toggleMoveMode },
 *   { key: "c", ctrl: false, handler: cutSelected },
 *   { code: /^Digit[1-8]$/, shift: true, ctrl: false, handler: insertColor },
 * ]);
 * ```
 *
 * ## 比對規則
 *
 * - `key`：字串（不分大小寫）或字串陣列，比對 `event.key`
 * - `code`：字串或正規表示式，比對 `event.code`。**按住 Shift 時數字鍵的
 *   `event.key` 會變成符號**（`Shift+1` → `"!"`），這種綁定只能用 `code`
 * - `ctrl` / `shift`：`true` 必須按著、`false` 必須沒按、**不寫 = 不管**
 *
 * ## 所有符合的綁定都會執行
 *
 * 這是刻意的：編輯器現有的鍵盤處理是一串平行的 `if`（不是 `else if`），
 * 有些鍵確實會同時觸發兩件事（見 audioplayer 的鍵位表）。統一註冊方式時
 * 保留這個語意，行為才不會在重構中偷偷改掉。
 *
 * ## 防彈跳
 *
 * `options.debounceMs`（預設 100）內的第二次按鍵會被忽略——包含**按住不放
 * 產生的 key repeat**。每次呼叫這個 hook 都有自己獨立的 latch，所以需要
 * 連發的快捷鍵（例如 Ctrl+Z 連續復原）要另外呼叫一次並傳 `debounceMs: 0`。
 */
/**
 * 修飾鍵**自己**的 keydown。
 *
 * 按 Ctrl+3 會產生兩個 keydown：先 `Control`、再 `3`。修飾鍵那一下不可能
 * 對應到任何綁定（每條綁定都指定了 key 或 code），但它會吃掉防彈跳的 latch，
 * 於是 100ms 內的 `3` 被當成連發而丟棄——實測 Ctrl+0~9（亮度）與
 * Shift+1~8（插入最愛色）在瀏覽器上完全按不動，只有 undo/redo 因為
 * 註冊時傳了 `debounceMs: 0` 才倖免。
 */
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

export function useKeyboardShortcuts(bindings, options = {}) {
  const { debounceMs = 100 } = options;

  // 監聽器只掛一次，但每次 render 都更新 ref，避免 stale closure
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const latched = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      // 修飾鍵自己不算一次按鍵，也不該佔用防彈跳的名額（見上方說明）
      if (MODIFIER_KEYS.has(event.key)) return;

      if (debounceMs > 0) {
        if (latched.current) return;
        latched.current = true;
        setTimeout(() => (latched.current = false), debounceMs);
      }

      bindingsRef.current.forEach((binding) => {
        if (!matches(binding, event)) return;

        if (binding.preventDefault !== false) event.preventDefault();
        if (binding.stopPropagation) event.stopPropagation();

        binding.handler(event);
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [debounceMs]);
}

function matches(binding, event) {
  if (binding.ctrl !== undefined && binding.ctrl !== event.ctrlKey)
    return false;
  if (binding.shift !== undefined && binding.shift !== event.shiftKey)
    return false;

  if (binding.code !== undefined) {
    const ok =
      binding.code instanceof RegExp
        ? binding.code.test(event.code)
        : binding.code === event.code;
    if (!ok) return false;
  }

  if (binding.key !== undefined) {
    const wanted = Array.isArray(binding.key) ? binding.key : [binding.key];
    const ok = wanted.some(
      (k) => k.toLowerCase() === String(event.key).toLowerCase(),
    );
    if (!ok) return false;
  }

  return binding.when === undefined || binding.when(event);
}
