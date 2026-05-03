import { useState, memo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable, updateCurrentTime } from "../redux/actions";
import { ACCESSORY_CONFIGS } from "../config/accessoryConfig.js";
import "./AccessoryPanel.css";

const PART_NAMES = [
  "hat","face","chestL","chestR","armL","armR","tie","belt",
  "gloveL","gloveR","legL","legR","shoeL","shoeR",
  "acc0","acc1","acc2","acc3","acc4","acc5","acc6","acc7",
];

function binarySearchFirstGreater(arr, target) {
  if (!arr || arr.length === 0) return 0;
  let left = 0, right = arr.length - 1, result = 0;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid].time > target) { result = mid; right = mid - 1; }
    else left = mid + 1;
  }
  return result;
}

function AccessoryPanel() {
  const dispatch = useDispatch();
  const selectedDancerId = useSelector((s) => s.profiles.selectedDancerId);
  const actionTable = useSelector((s) => s.profiles.data?.actionTable || []);
  const time = useSelector((s) => s.profiles.currentTime);
  const duration = useSelector((s) => s.profiles.duration);
  const chosenColor = useSelector((s) => s.profiles.chosenColor);
  const multiSelectedBlocks = useSelector((s) => s.profiles.multiSelectedBlocks);

  const config = selectedDancerId !== null ? (ACCESSORY_CONFIGS[selectedDancerId] ?? null) : null;

  const getColor = (partIdx) => {
    const partData = actionTable?.[selectedDancerId]?.[partIdx] || [];
    const idx = binarySearchFirstGreater(partData, time);
    const prev = partData[idx - 1];
    const next = partData[idx];

    if (prev?.linear === 1 && next) {
      const ratio = (time - prev.time) / (next.time - prev.time);
      if (next.time > prev.time) {
        const afterNext = partData[idx + 1];
        const end = afterNext?.color || { R: 0, G: 0, B: 0, A: 1 };
        return `rgba(
          ${Math.round(prev.color.R * (1 - ratio) + end.R * ratio)},
          ${Math.round(prev.color.G * (1 - ratio) + end.G * ratio)},
          ${Math.round(prev.color.B * (1 - ratio) + end.B * ratio)},
          ${(prev.color.A ?? 1) * (1 - ratio) + (end.A ?? 1) * ratio}
        )`;
      }
    }
    const c = prev?.color || { R: 0, G: 0, B: 0, A: 1 };
    return `rgba(${c.R},${c.G},${c.B},${c.A})`;
  };

  const isSelected = (partIdx) =>
    multiSelectedBlocks.some(
      (b) => b.armorIndex === selectedDancerId && b.partIndex === partIdx
    );

  const handleClick = (partIdx) => {
    const blackthreshold = 10;
    const partData = actionTable?.[selectedDancerId]?.[partIdx] || [];
    const indexToCopy = binarySearchFirstGreater(partData, time);
    const nowTime = Math.floor(time / 50) * 50;
    dispatch(updateCurrentTime(nowTime));

    const newEntry = { time: nowTime, color: { ...chosenColor }, linear: 0 };
    const nextEl = partData[indexToCopy];
    const prevEl = partData[indexToCopy - 1] || partData[indexToCopy];

    const isNextBlack = !nextEl || (nextEl.color.R === 0 && nextEl.color.G === 0 && nextEl.color.B === 0);
    const isPrevBlack = !prevEl || (prevEl.color.R === 0 && prevEl.color.G === 0 && prevEl.color.B === 0);

    const updatedEntries = Object.entries(actionTable).map(([playerIdx, player]) => {
      if (Number(playerIdx) !== selectedDancerId) return [playerIdx, player];
      let updatedPart = [...(player[partIdx] || [])];
      const existingIdx = updatedPart.findIndex((e) => e.time === nowTime);

      if (existingIdx !== -1) {
        updatedPart = updatedPart.map((e, i) =>
          i === existingIdx ? { ...e, color: { ...chosenColor } } : e
        );
      } else if (indexToCopy === 0) {
        updatedPart.splice(updatedPart.length, 0, newEntry, {
          time: duration, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0,
        });
      } else if (!isPrevBlack && isNextBlack) {
        updatedPart.splice(indexToCopy + 1, 0,
          { time: nowTime - blackthreshold, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
          newEntry
        );
      } else if (!isPrevBlack && !isNextBlack) {
        updatedPart.splice(indexToCopy + 1, 0,
          { time: nowTime - blackthreshold, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 },
          newEntry,
          { time: (nextEl?.time - blackthreshold) || nowTime + blackthreshold, color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0 }
        );
      } else if (isPrevBlack && !isNextBlack) {
        updatedPart.splice(indexToCopy + 1, 0, newEntry, {
          time: (nextEl?.time - blackthreshold) || nowTime + blackthreshold,
          color: { R: 0, G: 0, B: 0, A: 1 }, linear: 0,
        });
      } else {
        updatedPart.splice(updatedPart.length, 0, newEntry);
      }

      updatedPart.sort((a, b) => a.time - b.time);
      return [playerIdx, { ...player, [partIdx]: updatedPart }];
    });

    dispatch(updateActionTable(Object.fromEntries(updatedEntries)));
  };

  const [open, setOpen] = useState(true);

  return (
    <div className={`accessory-sidebar${open ? "" : " collapsed"}`}>
      <div className="sidebar-header" onClick={() => setOpen((v) => !v)}>
        <span className="sidebar-title-text">
          {selectedDancerId !== null
            ? `舞者 ${selectedDancerId + 1} — 裝備編輯`
            : "裝備編輯"}
        </span>
        <span className="sidebar-toggle-icon">{open ? "▲" : "▼"}</span>
      </div>

      {open && selectedDancerId === null && (
        <div className="sidebar-hint">點擊舞者以查看裝備</div>
      )}

      {open && selectedDancerId !== null && !config && (
        <div className="sidebar-hint">此舞者無配件</div>
      )}

      {open && config && (
        <div className="sidebar-content">
          <div className="sidebar-accessory-name">{config.name}</div>
          {config.groups.map((group) => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              <div className="sidebar-dots">
                {group.indices.map((partIdx) => (
                  <div
                    key={partIdx}
                    className={`sidebar-dot${isSelected(partIdx) ? " selected" : ""}`}
                    style={{ backgroundColor: getColor(partIdx) }}
                    onClick={() => handleClick(partIdx)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(AccessoryPanel);
