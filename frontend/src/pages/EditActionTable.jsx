import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

import { useSegmentActionTable } from "../hooks/useSegmentActionTable.js";
import { updateUndo, updateRedo } from "../redux/actions.js";
import { isPartAllowed } from "../config/accessoryConfig";
import { PART_LABELS } from "../constants/parts.js";
import { DEFAULT_SEGMENT_MS, TICK_MS } from "../constants/time.js";
import { createId, roundToTick, validateSegments } from "../utils/segments/core.js";
import {
  cloneColor,
  createColorSegment,
  sameColor,
} from "../utils/segments/color.js";
import "./EditActionTable.css";

/**
 * 光表的原始表格編輯器 —— 給查資料與救急用，不是主要的編輯介面。
 *
 * 主編輯器（Home）是用滑鼠在時間軸上畫色塊；這一頁直接把某個部位的 segment
 * 陣列攤成表格，可以逐欄改數字。用途是「Timeline 上看起來怪怪的，想確認底層
 * 到底存了什麼」，或者要精確填一個時間點。
 *
 * ## 為什麼直接用全域 undo
 *
 * 這頁原本自己維護一份 `JSON.parse(JSON.stringify(...))` 的歷史。那是重複的
 * ——store 本來就有 history 與 redoStack，而且每次 commit 都會再推一筆進去，
 * 於是本地 undo 跳回上一版之後，全域 history 反而多了一格。改成直接發
 * `UPDATEUNDO` / `UPDATEREDO`，兩邊看到的就是同一份歷史。
 *
 * ## 不變式的處理
 *
 * 這裡允許直接改 `start` / `end`，所以有機會做出重疊或未對齊網格的資料。
 * 每次寫入都會先對齊網格再排序，並跑一次 `validateSegments` 把問題印在
 * 表格上方——擋下來反而不好用（想把一段往右挪就得先改另一段），所以是警告
 * 而非阻擋。
 */
function EditActionTable() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { segmentTable, duration, commitPart } = useSegmentActionTable();

  const [selectedArmor, setSelectedArmor] = useState(0);
  const [selectedPart, setSelectedPart] = useState(0);

  const segments = segmentTable?.[selectedArmor]?.[selectedPart] ?? [];
  const problems = validateSegments(segments);

  /** 對齊網格 + 依 start 排序後寫回目前這個部位 */
  const writeBack = (nextSegments) => {
    const normalized = nextSegments
      .map((segment) => ({
        ...segment,
        start: roundToTick(segment.start),
        end: roundToTick(segment.end),
      }))
      .sort((a, b) => a.start - b.start);

    commitPart(selectedArmor, selectedPart, normalized);
  };

  /**
   * 改一個欄位。值沒有真的變就什麼都不做——調色盤拖曳時會連續發事件，
   * 沒有這道判斷的話一次拖曳就吃掉幾十格 undo。
   */
  const updateField = (segmentId, patch) => {
    const target = segments.find((segment) => segment.id === segmentId);
    if (!target || !patchChangesAnything(target, patch)) return;

    writeBack(
      segments.map((segment) =>
        segment.id === segmentId ? { ...segment, ...patch } : segment,
      ),
    );
  };

  /**
   * 在最後一段之後接一個新色塊。
   *
   * 接在後面而不是插在 0，是因為插在 0 會依 trim 策略把既有的第一段吃掉一截，
   * 對「我只是想多一列」的人來說是意外的破壞。
   */
  const addSegment = () => {
    const start = segments.length ? segments[segments.length - 1].end : 0;
    const end = Math.min(start + DEFAULT_SEGMENT_MS, duration || Infinity);
    if (!(end > start)) return; // 表演結尾已經沒有空間

    writeBack([
      ...segments,
      createColorSegment({
        start,
        end,
        color: { R: 255, G: 255, B: 255, A: 1 },
        makeId: createId,
      }),
    ]);
  };

  const deleteSegment = (segmentId) => {
    writeBack(segments.filter((segment) => segment.id !== segmentId));
  };

  return (
    <div className="edit-container">
      <h2>Edit Action Table</h2>
      <button onClick={() => navigate(-1)} className="back-button">
        ← 返回
      </button>

      <div className="select-container">
        <label>Select Armor:</label>
        <select
          value={selectedArmor}
          onChange={(e) => setSelectedArmor(Number(e.target.value))}
        >
          {(segmentTable ?? []).map((_, armorIndex) => (
            <option key={armorIndex} value={armorIndex}>
              Armor {armorIndex}
            </option>
          ))}
        </select>

        <label>Select Part:</label>
        <select
          value={selectedPart}
          size={22}
          style={{ height: "308px", overflowY: "auto" }}
          onChange={(e) => setSelectedPart(Number(e.target.value))}
        >
          {(segmentTable?.[selectedArmor] ?? []).map((_, partIndex) => {
            const allowed = isPartAllowed(selectedArmor, partIndex);
            return (
              <option key={partIndex} value={partIndex} disabled={!allowed}>
                {PART_LABELS[partIndex]}
                {allowed ? "" : "x"}
              </option>
            );
          })}
        </select>
      </div>

      <div className="history-buttons">
        <button onClick={() => dispatch(updateUndo())}>Undo</button>
        <button onClick={() => dispatch(updateRedo())}>Redo</button>
      </div>

      {problems.length > 0 && (
        <ul className="segment-problems">
          {problems.map((problem) => (
            <li key={problem}>⚠ {problem}</li>
          ))}
        </ul>
      )}

      <div className="table-wrapper">
        <PartEditor
          armorIndex={selectedArmor}
          partIndex={selectedPart}
          segments={segments}
          onUpdate={updateField}
          onDelete={deleteSegment}
        />
      </div>

      <div className="button-container">
        <button onClick={addSegment}>+ Add Segment</button>
      </div>
    </div>
  );
}

function PartEditor({ armorIndex, partIndex, segments, onUpdate, onDelete }) {
  return (
    <div className="table-container">
      <h3>
        Armor {armorIndex} - {PART_LABELS[partIndex]}
      </h3>
      <div className="scrollable-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Start (ms)</th>
              <th>End (ms)</th>
              <th>Color</th>
              <th>Color End</th>
              <th>Linear</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment, index) => (
              <tr key={segment.id}>
                <td>{index}</td>
                <td>
                  <TimeCell
                    value={segment.start}
                    onCommit={(next) => onUpdate(segment.id, { start: next })}
                  />
                </td>
                <td>
                  <TimeCell
                    value={segment.end}
                    onCommit={(next) => onUpdate(segment.id, { end: next })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={rgbToHex(segment.colorStart)}
                    onChange={(e) => {
                      // 保留原本的 alpha —— 它是 LED 亮度，不該被改色相順手清成 1
                      const color = hexToRgb(
                        e.target.value,
                        segment.colorStart?.A ?? 1,
                      );
                      // 固定色的兩端要一起改，否則切成漸變時會漸變到舊顏色
                      onUpdate(segment.id, {
                        colorStart: color,
                        colorEnd:
                          segment.linear === 1
                            ? cloneColor(segment.colorEnd)
                            : color,
                      });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={rgbToHex(segment.colorEnd)}
                    disabled={segment.linear !== 1}
                    onChange={(e) =>
                      onUpdate(segment.id, {
                        colorEnd: hexToRgb(
                          e.target.value,
                          segment.colorEnd?.A ?? 1,
                        ),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={segment.linear === 1}
                    onChange={(e) =>
                      onUpdate(segment.id, { linear: e.target.checked ? 1 : 0 })
                    }
                  />
                </td>
                <td>
                  <button onClick={() => onDelete(segment.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** patch 裡有沒有任何一項和 segment 目前的值不同（顏色比內容，其餘比值） */
const patchChangesAnything = (segment, patch) =>
  Object.entries(patch).some(([key, value]) =>
    key.startsWith("color")
      ? !sameColor(segment[key], value)
      : segment[key] !== value,
  );

/**
 * 時間欄位：打字時只動本地狀態，**離開欄位或按 Enter 才寫回 store**。
 *
 * 每次 keystroke 就 dispatch 的話，把 550 改成 1500 會經過 1 / 15 / 150 / 1500
 * 四個中間值，每個都佔一格 undo，而且中間值會被 `roundToTick` 夾成 0——
 * 使用者會看到自己打的數字被吃掉。這也是為什麼不用受控的 `type="number"`
 * 直接綁 store。
 */
function TimeCell({ value, onCommit }) {
  const [draft, setDraft] = useState(String(value));

  // 外部改變（undo、切換部位、其他欄位連動）時同步顯示值
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value)); // 打了非數字就還原，不要把 NaN 寫進光表
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      type="number"
      step={TICK_MS}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

/** `<input type="color">` 只吃 `#rrggbb`，alpha 由亮度欄位另外管 */
const rgbToHex = (color) => {
  if (!color) return "#ffffff";
  const { R = 0, G = 0, B = 0 } = color;
  return `#${[R, G, B].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

/** 保留原本的 alpha（=LED 亮度），只換色相 */
const hexToRgb = (hex, alpha = 1) => {
  const bigint = parseInt(hex.slice(1), 16);
  return {
    R: (bigint >> 16) & 255,
    G: (bigint >> 8) & 255,
    B: bigint & 255,
    A: alpha,
  };
};

export default EditActionTable;
