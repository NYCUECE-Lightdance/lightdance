/**
 * 時間相關常數 — 單一來源。
 *
 * 為什麼要集中：50ms 這個數字原本以字面值散落在 handleOutput、sanitizeActionTable、
 * 頻閃週期驗證等處，改一個地方就得全專案搜一輪。集中之後，未來若韌體改用別的
 * tick，前端只要改這裡一行。
 *
 * ⚠️ 改 TICK_MS 是**前端與韌體的協同變更**，不是前端單方面能決定的：
 *    - 既有光表都是在 50ms 網格上創作的
 *    - 上傳給韌體的 time 欄位是 `floor(毫秒 / TICK_MS)`，除數變了韌體那端也要跟著改
 *    改之前請先與硬體組確認。
 */

/** 韌體的時間解析度（毫秒）。上傳的 time 欄位 = floor(毫秒 / TICK_MS) */
export const TICK_MS = 50;

/** 在光衣上點擊放色時，新色塊的預設長度（毫秒） */
export const DEFAULT_SEGMENT_MS = 1000;
