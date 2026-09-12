import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";

import "./WorksetBar.css";
import { useWorksets } from "../hooks/useWorksets.js";
import {
  addWorkset,
  removeWorkset,
  renameWorkset,
  switchWorkset,
  updateRowHeight,
} from "../redux/actions.js";
import { MAX_ROW_H, MIN_ROW_H } from "../utils/tracks.js";

/**
 * 工作集列 —— 切換「現在要看哪幾軌」。
 *
 * 154 條時間軸不可能同時擺在畫面上，所以軌道一直是使用者自己挑的。這一列
 * 讓那組挑選有名字、存得起來、一鍵切換：「舞者 3 全身」和「所有人的帽子」
 * 是兩種完全不同的編法，先前每次換編法都要把軌道一條條拆掉再加回來。
 *
 * 加軌 / 移除 / 上下移的按鈕都沒有變，只是它們現在作用在**目前這一組**上。
 */
function WorksetBar() {
  const dispatch = useDispatch();
  const { sets, current } = useWorksets();
  const rowHeight = useSelector((state) => state.profiles.rowHeight);

  const promptRename = (set) => {
    const name = window.prompt("工作集名稱：", set.name);
    if (name !== null && name.trim()) {
      dispatch(renameWorkset(set.id, name.trim()));
    }
  };

  const promptAdd = () => {
    const name = window.prompt(
      "新工作集的名稱（會複製目前這一組的軌道）：",
      `工作集 ${sets.length + 1}`,
    );
    if (name !== null) dispatch(addWorkset(name.trim()));
  };

  return (
    <div className="workset-bar">
      <span className="workset-bar__label">工作集</span>

      <div className="workset-bar__list">
        {sets.map((set) => {
          const isCurrent = set.id === current?.id;
          return (
            <button
              key={set.id}
              type="button"
              className={`workset-chip${isCurrent ? " is-current" : ""}`}
              aria-pressed={isCurrent}
              onClick={() => dispatch(switchWorkset(set.id))}
              onDoubleClick={() => promptRename(set)}
            >
              {set.name}
              <span className="workset-chip__count">{set.tracks.length}</span>
            </button>
          );
        })}
      </div>

      <button className="workset-bar__action" type="button" onClick={promptAdd}>
        <FontAwesomeIcon icon={faPlus} />
        <span className="tooltip">新增工作集（複製目前這一組）</span>
      </button>

      <button
        className="workset-bar__action"
        type="button"
        onClick={() => current && promptRename(current)}
      >
        <FontAwesomeIcon icon={faPen} />
        <span className="tooltip">重新命名（也可以直接雙擊名稱）</span>
      </button>

      {/* 只剩一組時不給刪——沒有工作集的話畫面上一條軌道都沒有 */}
      <button
        className="workset-bar__action"
        type="button"
        disabled={sets.length <= 1}
        onClick={() => current && dispatch(removeWorkset(current.id))}
      >
        <FontAwesomeIcon icon={faTrash} />
        <span className="tooltip">刪除目前這一組</span>
      </button>

      <label className="workset-bar__rowh" htmlFor="row-height">
        行高
        <input
          id="row-height"
          type="range"
          min={MIN_ROW_H}
          max={MAX_ROW_H}
          step="4"
          value={rowHeight}
          onChange={(e) => dispatch(updateRowHeight(e.target.value))}
        />
        <span className="workset-bar__rowh-value">{rowHeight}px</span>
      </label>
    </div>
  );
}

export default React.memo(WorksetBar);
