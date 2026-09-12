import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import AudioPlayer from "./audio/audioplayer.jsx";
import "./ControlPanel.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrash,
  faRotate,
  faPlus,
  faReply,
  faShare,
  faSliders,
  faAngleUp,
  faAngleDown,
  faArrowsLeftRight,
} from "@fortawesome/free-solid-svg-icons";
import {
  updateRedo,
  updateUndo,
  updateShowPart,
  updateMultiSelectedBlocks,
  toggleMoveMode,
  addWorkset,
  removeWorkset,
  renameWorkset,
  switchWorkset,
} from "../redux/actions.js";
import { isPartAllowed } from "../config/accessoryConfig.js";
import { findNearestSegment } from "../utils/segments/core.js";
import { makeSelection } from "../utils/selection.js";
import {
  PART_LABELS,
  PLAYER_INDICES,
  PART_INDICES,
} from "../constants/parts.js";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts.js";
import { useWorksets } from "../hooks/useWorksets.js";
import {
  clampRowHeight,
  isCompactHeight,
  trackHeight,
  withTrackHeight,
} from "../utils/tracks.js";
import WorksetBar from "./WorksetBar.jsx";

function ControlPanel({ setButtonState }) {
  const [timelineHeight, setTimelineHeight] = useState(0); // 儲存計算後的高度
  const timelineRefs = useRef([]); // 用來同步每個 timeline 設定區
  const timelineRef = useRef(null); // Timeline 的容器
  const settingRef = useRef(null); // 左側設定區容器
  const [selectedTimelines, setSelectedTimelines] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const multiSelectedBlocks = useSelector(
    (state) => state.profiles.multiSelectedBlocks,
  );
  const moveMode = useSelector((state) => state.profiles.moveMode);
  const segmentTable = useSelector(
    (state) => state.profiles.data?.actionTable || [],
  );
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const { sets, current, tracks: showPart } = useWorksets();
  const rowHeight = useSelector((state) => state.profiles.rowHeight);
  const dispatch = useDispatch();
  const partName = PART_LABELS;

  useEffect(() => {
    if (showPart.length > 0) {
      const initialSelections = showPart.map((setting) => ({
        armorIndex: setting.armorIndex,
        partIndex: setting.partIndex,
      }));
      setSelectedTimelines(initialSelections);
      // console.log("showPart", showPart);
    }
  }, [showPart]);

  // WASD 移動選取的色塊。和 audioplayer 的快捷鍵各自有獨立的 100ms 防彈跳，
  // 與拆件前的兩個 listener 行為相同。
  useKeyboardShortcuts([
    { key: "a", handler: () => moveSelectedBlockLeft() },
    { key: "d", handler: () => moveSelectedBlockRight() },
    { key: "w", handler: () => moveSelectedBlockUp() },
    { key: "s", handler: () => moveSelectedBlockDown() },
  ]);

  /**
   * 跨軌導航（W/S）與同軌導航（A/D）。
   *
   * 舊版是在 keyframe 陣列上做索引加減，再判斷「選到的是不是黑色、
   * 要往左還往右閃」——四個函式各一份，約 200 行。segment 世界裡
   * 「色塊」本來就是一級物件，導航就是在 segments 陣列上走一格。
   */

  /** 目前選取的部位與 segment（找不到時回傳 null） */
  const currentSelection = () => {
    const selection = multiSelectedBlocks[0];
    if (!selection) return null;

    const { armorIndex, partIndex } = selection;
    const segments = segmentTable?.[armorIndex]?.[partIndex] ?? [];
    const index = segments.findIndex((s) => s.id === selection.segmentId);
    if (index === -1) return null;

    return { armorIndex, partIndex, segments, index };
  };

  const selectSegmentAt = (armorIndex, partIndex, segment) => {
    if (!segment) return;
    dispatch(
      updateMultiSelectedBlocks([
        makeSelection({ armorIndex, partIndex, segment }),
      ]),
    );
  };

  /** 移到 showPart 順序上相鄰的那一條軌道，選同一個時間點附近的色塊 */
  const moveToNeighbourTrack = (offset) => {
    const current = currentSelection();
    if (!current) return;

    const currentIndex = showPart.findIndex(
      (p) =>
        p.armorIndex === current.armorIndex &&
        p.partIndex === current.partIndex,
    );
    const target = showPart[currentIndex + offset];
    if (currentIndex === -1 || !target) return;

    const segments =
      segmentTable?.[target.armorIndex]?.[target.partIndex] ?? [];
    selectSegmentAt(
      target.armorIndex,
      target.partIndex,
      findNearestSegment(segments, current.segments[current.index].start),
    );
  };

  const moveSelectedBlockUp = () => moveToNeighbourTrack(-1);
  const moveSelectedBlockDown = () => moveToNeighbourTrack(1);

  /** 在同一條軌道上移到前/後一個色塊 */
  const moveWithinTrack = (offset) => {
    const current = currentSelection();
    if (!current) return;

    const next = current.segments[current.index + offset];
    if (!next) return; // 已經在頭/尾，維持原選取

    selectSegmentAt(current.armorIndex, current.partIndex, next);
  };

  const moveSelectedBlockLeft = () => moveWithinTrack(-1);
  const moveSelectedBlockRight = () => moveWithinTrack(1);

  // 处理复选框选择变化
  const handleCheckboxChange = (armorIndex, partIndex, isChecked) => {
    const selection = { armorIndex, partIndex };
    setSelectedTimelines((prev) =>
      isChecked
        ? [...prev, selection]
        : prev.filter(
            (item) =>
              !(item.armorIndex === armorIndex && item.partIndex === partIndex),
          ),
    );
  };
  // 全选/取消全选某列（所有人物的某种部件）
  const toggleColumnSelect = (partIndex) => {
    const isColumnFullySelected = PLAYER_INDICES.every((armorIndex) =>
      selectedTimelines.some(
        (item) =>
          item.armorIndex === armorIndex && item.partIndex === partIndex,
      ),
    );

    setSelectedTimelines((prev) => {
      const updated = [...prev];
      PLAYER_INDICES.forEach((armorIndex) => {
        const exists = updated.some(
          (item) =>
            item.armorIndex === armorIndex && item.partIndex === partIndex,
        );
        if (!isColumnFullySelected && !exists) {
          updated.push({ armorIndex, partIndex });
        } else if (isColumnFullySelected && exists) {
          const index = updated.findIndex(
            (item) =>
              item.armorIndex === armorIndex && item.partIndex === partIndex,
          );
          if (index !== -1) updated.splice(index, 1);
        }
      });
      return updated;
    });
  };

  // 切换行全选/取消全选
  const toggleRowSelect = (armorIndex) => {
    const isRowFullySelected = PART_INDICES.every((partIndex) =>
      selectedTimelines.some(
        (item) =>
          item.armorIndex === armorIndex && item.partIndex === partIndex,
      ),
    );

    setSelectedTimelines((prev) => {
      const updated = [...prev];
      PART_INDICES.forEach((partIndex) => {
        const exists = updated.some(
          (item) =>
            item.armorIndex === armorIndex && item.partIndex === partIndex,
        );
        if (!isRowFullySelected && !exists) {
          updated.push({ armorIndex, partIndex });
        } else if (isRowFullySelected && exists) {
          const index = updated.findIndex(
            (item) =>
              item.armorIndex === armorIndex && item.partIndex === partIndex,
          );
          if (index !== -1) updated.splice(index, 1);
        }
      });
      return updated;
    });
  };
  // 应用选中的 Timeline 设置
  const applySelection = () => {
    dispatch(
      updateShowPart(
        selectedTimelines.map((selection, index) => ({
          id: index + 1,
          armorIndex: selection.armorIndex,
          partIndex: selection.partIndex,
        })),
      ),
    );
    setShowModal(false); // 关闭模态框
  };

  /*
   * 讓左側軌名列與右側時間軸的**每一列落在同一條水平線上**。
   *
   * 兩欄上方擋著的東西不一樣：右邊有工具列與時間刻度尺，左邊只有五顆工具鈕。
   * CSS 裡先用 `--ruler-h` 讓出一段當預設值，但那只在工具列排成一行時才對——
   * 1280 寬時工具列會換兩行，實測整欄差 49px。差多少只有版面自己知道，
   * 所以量第一列的落差再補上去。
   *
   * 用「第一列的落差」而不是「容器的落差」是因為前者會收斂：補上 delta 之後
   * 左側第一列就落在右側第一列上，下一次量到的 delta 是 0。容器的 top 不受
   * 自己的 padding 影響，拿它當基準會一直往下加。
   */
  useEffect(() => {
    const align = () => {
      const setting = settingRef.current;
      const label = setting?.querySelector(".timeline-settings-block");
      const track = document.querySelector(".timeline");
      if (!setting || !label || !track) return;

      const current = parseFloat(getComputedStyle(setting).paddingTop) || 0;
      const delta =
        track.getBoundingClientRect().top - label.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) return;

      setting.style.paddingTop = `${Math.max(0, current + delta)}px`;
    };

    align();

    // 工具列換行、視窗改變、軌道增減都會讓落差變掉
    const observer = new ResizeObserver(align);
    const controls = document.querySelector(".controls");
    if (controls) observer.observe(controls);
    if (settingRef.current) observer.observe(settingRef.current);
    window.addEventListener("resize", align);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", align);
    };
    // 軌道清單與行高變了要重算；其餘的變動（工具列換行、視窗縮放）由
    // ResizeObserver 接手。不留空依賴是因為換工作集時整批列會被換掉。
  }, [showPart, rowHeight]);

  useEffect(() => {
    const scrollContainer = document.querySelector(".timeline-container");
    const settingContainer = settingRef.current;

    if (scrollContainer && settingContainer) {
      const syncScroll = () => {
        settingContainer.scrollTop = scrollContainer.scrollTop; // 同步左側滾動
      };

      const syncScrollBack = () => {
        scrollContainer.scrollTop = settingContainer.scrollTop; // 同步右側滾動
      };

      scrollContainer.addEventListener("scroll", syncScroll);
      settingContainer.addEventListener("scroll", syncScrollBack);

      return () => {
        scrollContainer.removeEventListener("scroll", syncScroll);
        settingContainer.removeEventListener("scroll", syncScrollBack);
      };
    }
  }, []);

  useEffect(() => {
    if (timelineRef.current) {
      setTimelineHeight(timelineRef.current.offsetHeight); // 設定高度
    }
  }, [timelineRef]);

  // 復原/重做刻意**不防彈跳**：按住 Ctrl+Z 要能連續復原（拆件前這條也沒有 latch）
  useKeyboardShortcuts(
    [
      { key: "z", ctrl: true, handler: () => undo() },
      { key: "y", ctrl: true, handler: () => redo() },
    ],
    { debounceMs: 0 },
  );

  const handleSettingChange = (index, key, value) => {
    let tmp = JSON.parse(JSON.stringify(showPart));
    tmp = tmp.map((setting, i) =>
      i === index ? { ...setting, [key]: value } : setting,
    );
    // console.log("new array : ", tmp);
    dispatch(updateShowPart(tmp));
    // console.log("showPart : ", showPart);
  };

  // 增加新的 timeline
  const addTimeline = () => {
    let tmp = JSON.parse(JSON.stringify(showPart));
    tmp.push({
      id: showPart.length + 1, // 新增的 Timeline ID
      armorIndex: 0, // 預設 armorIndex
      partIndex: 0, // 預設 partIndex
    });
    dispatch(updateShowPart(tmp));
  };
  const moveTimelineUp = (index) => {
    if (index > 0) {
      let tmp = JSON.parse(JSON.stringify(showPart));
      [tmp[index], tmp[index - 1]] = [tmp[index - 1], tmp[index]];
      dispatch(updateShowPart(tmp));
    }
  };

  const moveTimelineDown = (index) => {
    if (index < showPart.length - 1) {
      let tmp = JSON.parse(JSON.stringify(showPart));
      [tmp[index], tmp[index + 1]] = [tmp[index + 1], tmp[index]];
      dispatch(updateShowPart(tmp));
    }
  };
  const undo = () => {
    // console.log("Undo...");
    dispatch(updateUndo());
  };

  const redo = () => {
    dispatch(updateRedo());
  };

  const choosetimeline = () => {
    setShowModal(true); // 打开选择模态框
  };

  const deleteTimeline = (id) => {
    const updatedShowPart = showPart.filter((setting) => setting.id !== id);
    dispatch(updateShowPart(updatedShowPart));
  };

  /**
   * 逐軌拖曳把手：按住往下拉高、往上壓扁。
   *
   * 只在放開時 dispatch 一次——拖曳過程每一格像素都寫 redux 的話，
   * 154 條 Timeline 會跟著重繪，手感會變成一格一格跳。
   */
  const startHeightDrag = (event, setting) => {
    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startHeight = trackHeight(setting, rowHeight);
    const block = event.currentTarget.closest(".timeline-settings-block");
    let latest = startHeight;

    const onMove = (moveEvent) => {
      latest = startHeight + (moveEvent.clientY - startY);
      // 拖曳中只改自己的 DOM，放開才進 redux
      if (block) block.style.height = `${clampRowHeight(latest)}px`;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (block) block.style.height = "";
      dispatch(updateShowPart(withTrackHeight(showPart, setting.id, latest)));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return (
    <div className="control-panel">
      {showModal &&
        createPortal(
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Armor</th>
                      {PLAYER_INDICES.map((armorIndex) => (
                        <th key={armorIndex}>
                          <button
                            className={`allsel-button ${
                              PART_INDICES.every((partIndex) =>
                                selectedTimelines.some(
                                  (item) =>
                                    item.armorIndex === armorIndex &&
                                    item.partIndex === partIndex,
                                ),
                              )
                                ? "selected"
                                : ""
                            }`}
                            onClick={() => toggleRowSelect(armorIndex)}
                          >
                            All
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PART_INDICES.map((partIndex) => (
                      <tr key={partIndex}>
                        <td>
                          <button
                            className={`allsel-button ${
                              PLAYER_INDICES.every((armorIndex) =>
                                selectedTimelines.some(
                                  (item) =>
                                    item.armorIndex === armorIndex &&
                                    item.partIndex === partIndex,
                                ),
                              )
                                ? "selected"
                                : ""
                            }`}
                            onClick={() => toggleColumnSelect(partIndex)}
                          >
                            All
                          </button>
                        </td>
                        {PLAYER_INDICES.map((armorIndex) => {
                          const allowed = isPartAllowed(armorIndex, partIndex);
                          const isSelected =
                            allowed &&
                            selectedTimelines.some(
                              (item) =>
                                item.armorIndex === armorIndex &&
                                item.partIndex === partIndex,
                            );

                          return (
                            <td key={armorIndex}>
                              <button
                                className={`checkbox-button ${
                                  isSelected ? "selected" : ""
                                } ${!allowed ? "disabled-part" : ""}`}
                                disabled={!allowed}
                                onClick={() =>
                                  allowed &&
                                  handleCheckboxChange(
                                    armorIndex,
                                    partIndex,
                                    !isSelected,
                                  )
                                }
                              >
                                {partName[partIndex]}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-buttons">
                <button onClick={() => setShowModal(false)}>Cancel</button>
                <button onClick={applySelection}>Apply</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      <WorksetBar />
      <div className="downpart-container">
        <div className="lefttool-container">
          <div className="leftupcorner">
            <button className="choosetimeline" onClick={choosetimeline}>
              <span className="tooltip">選擇要顯示的軌道</span>
              <FontAwesomeIcon icon={faSliders} size="lg" />
            </button>
            <button className="undo" onClick={undo}>
              <FontAwesomeIcon icon={faReply} size="lg" />
              <span className="tooltip">復原<kbd>Ctrl+Z</kbd></span>
            </button>
            <button className="redo" onClick={redo}>
              <FontAwesomeIcon icon={faShare} size="lg" />
              <span className="tooltip">重做<kbd>Ctrl+Y</kbd></span>
            </button>
            <button className="add-timeline" onClick={addTimeline}>
              <FontAwesomeIcon icon={faPlus} size="lg" />
              <span className="tooltip">新增軌道</span>
            </button>
            <button
              className={`move-mode-button ${moveMode ? "active" : ""}`}
              onClick={() => dispatch(toggleMoveMode())}
            >
              <FontAwesomeIcon icon={faArrowsLeftRight} size="lg" />
              <span className="tooltip">移動模式<kbd>M</kbd></span>
            </button>
          </div>
          <div
            className="timeline-setting-container"
            ref={settingRef} // 左側設定區的 ref
            style={{
              height: `${timelineHeight}px`, // 動態設置高度
              paddingBottom: "10px",
            }}
          >
            {showPart.map((setting, index) => (
              <div
                key={setting.id}
                ref={(el) => (timelineRefs.current[index] = el)}
                className={`timeline-settings-block${
                  isCompactHeight(trackHeight(setting, rowHeight))
                    ? " is-compact"
                    : ""
                }`}
                style={{ flex: `0 0 ${trackHeight(setting, rowHeight)}px` }}
              >
                {/* 逐軌調整高度：正在細修的那一條拉高，其他縮成一條輪廓 */}
                <span
                  className="track-height-grip"
                  onMouseDown={(e) => startHeightDrag(e, setting)}
                  title="上下拖曳調整這一軌的高度（雙擊回到預設）"
                  onDoubleClick={() =>
                    dispatch(
                      updateShowPart(withTrackHeight(showPart, setting.id, null)),
                    )
                  }
                />
                {/* Armor Index Selector */}
                <label>
                  <select
                    value={setting.armorIndex}
                    style={{ width: "30px" }} // 設定較小的寬度
                    onChange={(e) =>
                      handleSettingChange(
                        index,
                        "armorIndex",
                        Number(e.target.value),
                      )
                    }
                  >
                    {PLAYER_INDICES.map((i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Part Index Selector */}
                <label>
                  <select
                    value={setting.partIndex}
                    onChange={(e) =>
                      handleSettingChange(
                        index,
                        "partIndex",
                        Number(e.target.value),
                      )
                    }
                  >
                    {PART_INDICES.map((i) => {
                      const allowed = isPartAllowed(setting.armorIndex, i);
                      return (
                        <option key={i} value={i} disabled={!allowed}>
                          {partName[i]}
                          {!allowed ? "x" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <div className="move-timeline-buttons">
                  <button
                    className="move-timeline-up-button"
                    onClick={() => moveTimelineUp(index)}
                  >
                    <FontAwesomeIcon icon={faAngleUp} />
                  </button>
                  <button
                    className="move-timeline-down-button"
                    onClick={() => moveTimelineDown(index)}
                  >
                    <FontAwesomeIcon icon={faAngleDown} />
                  </button>
                </div>
                <button
                  className="delete-timeline-button"
                  onClick={() => deleteTimeline(setting.id)}
                >
                  <FontAwesomeIcon icon={faTrash} size="lg" />
                </button>
              </div>
            ))}
          </div>
          <div className="waveform-setting-block"></div>
        </div>

        <AudioPlayer
          setButtonState={setButtonState}
          timelineRef={timelineRef}
        />
      </div>
    </div>
  );
}

export default React.memo(ControlPanel);
