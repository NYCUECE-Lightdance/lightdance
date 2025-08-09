import React, { useState, useEffect, useRef, act } from "react";
import { useDispatch, useSelector } from "react-redux";
import AudioPlayer from "./audio/audioplayer.js";
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
  faEyeSlash,
  faEye,
} from "@fortawesome/free-solid-svg-icons";
import {
  updateRedo,
  updateUndo,
  updateShowPart,
  updateSelectedBlock,
} from "../redux/actions.js";

function ControlPanel({ setButtonState }) {
  const [timelineHeight, setTimelineHeight] = useState(0); // 儲存計算後的高度
  const timelineRefs = useRef([]); // 用來同步每個 timeline 設定區
  const timelineRef = useRef(null); // Timeline 的容器
  const settingRef = useRef(null); // 左側設定區容器
  const [selectedTimelines, setSelectedTimelines] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const selectedBlock = useSelector((state) => state.profiles.selectedBlock);
  const actionTable = useSelector((state) => state.profiles.actionTable);
  const currentTime = useSelector((state) => state.profiles.currentTime);
  const showPart = useSelector((state) => state.profiles.showPart);
  const dispatch = useDispatch();
  const partName = [
    "頭",
    "肩甲",
    "胸甲",
    "手腰",
    "腿上",
    "腿下",
    "鞋",
    "棍內",
    "棍外",
  ];

  useEffect(() => {
    if (showPart.length > 0) {
      const initialSelections = showPart.map((setting) => ({
        armorIndex: setting.armorIndex,
        partIndex: setting.partIndex,
        hidden: setting.hidden,
      }));
      setSelectedTimelines(initialSelections);
      // console.log("showPart", showPart);
    }
  }, [showPart]);

  const keyPress = useRef(false);
  const handleKeyDown = (event) => {
    if (keyPress.current) return; // 避免重複觸發

    keyPress.current = true;
    setTimeout(() => (keyPress.current = false), 100);

    if (event.key === "a") {
      event.preventDefault();
      moveSelectedBlockLeft();
    }
    if (event.key === "d") {
      event.preventDefault();
      moveSelectedBlockRight();
    }
    if (event.key === "w") {
      event.preventDefault();
      moveSelectedBlockUp();
    }
    if (event.key === "s") {
      event.preventDefault();
      moveSelectedBlockDown();
    }
  };
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedBlock, currentTime]);

  const moveSelectedBlockUp = () => {
    console.log("moveSelectedBlockUp");
    if (!selectedBlock) return;

    const { armorIndex, partIndex } = selectedBlock;
    const currentTime =
      actionTable?.[armorIndex]?.[partIndex]?.[selectedBlock.blockIndex]?.time;

    if (currentTime === undefined) return;

    // 找到 showPart 裡目前選擇的 timeline 的索引
    const currentIndex = showPart.findIndex(
      (p) => p.armorIndex === armorIndex && p.partIndex === partIndex
    );

    if (currentIndex <= 0) return; // 如果已經是第一個 timeline，就不往上

    // 找到前一個 timeline
    const previousTimeline = showPart[currentIndex - 1];
    const { armorIndex: prevArmor, partIndex: prevPart } = previousTimeline;

    if (!actionTable?.[prevArmor]?.[prevPart]) return;

    // 在新 timeline 找到時間 <= `currentTime` 的最大 `blockIndex`
    let newBlockIndex = -1;
    actionTable[prevArmor][prevPart].forEach((block, index) => {
      if (block.time <= currentTime) {
        newBlockIndex = index;
      }
    });

    if (newBlockIndex === -1) return; // 沒找到合適的 block，則不改變 selectedBlock

    // 如果選到的 block 是黑色，嘗試往左移動，如果左邊無效則往右移動
    const selectedBlockColor =
      actionTable[prevArmor][prevPart][newBlockIndex]?.color;
    if (
      selectedBlockColor?.R === 0 &&
      selectedBlockColor?.G === 0 &&
      selectedBlockColor?.B === 0
    ) {
      if (newBlockIndex > 0) {
        newBlockIndex -= 1; // 往左選一格
      } else if (newBlockIndex < actionTable[prevArmor][prevPart].length - 1) {
        newBlockIndex += 1; // 往右選一格
      } else {
        return; // 如果左右都無效，直接 return
      }
    }

    dispatch(
      updateSelectedBlock({
        armorIndex: prevArmor,
        partIndex: prevPart,
        blockIndex: newBlockIndex,
      })
    );
  };
  const moveSelectedBlockDown = () => {
    console.log("moveSelectedBlockDown");
    if (!selectedBlock) return;

    const { armorIndex, partIndex } = selectedBlock;
    const currentTime =
      actionTable?.[armorIndex]?.[partIndex]?.[selectedBlock.blockIndex]?.time;

    if (currentTime === undefined) return;

    // 找到 showPart 裡目前選擇的 timeline 的索引
    const currentIndex = showPart.findIndex(
      (p) => p.armorIndex === armorIndex && p.partIndex === partIndex
    );

    if (currentIndex === -1 || currentIndex >= showPart.length - 1) return; // 如果已經是最後一個 timeline，就不往下

    // 找到下一個 timeline
    const nextTimeline = showPart[currentIndex + 1];
    const { armorIndex: nextArmor, partIndex: nextPart } = nextTimeline;

    if (!actionTable?.[nextArmor]?.[nextPart]) return;

    // 在新 timeline 找到時間 <= `currentTime` 的最大 `blockIndex`
    let newBlockIndex = -1;
    actionTable[nextArmor][nextPart].forEach((block, index) => {
      if (block.time <= currentTime) {
        newBlockIndex = index;
      }
    });

    if (newBlockIndex === -1) return; // 沒找到合適的 block，則不改變 selectedBlock

    // 如果選到的 block 是黑色，嘗試往左移動，如果左邊無效則往右移動
    const selectedBlockColor =
      actionTable[nextArmor][nextPart][newBlockIndex]?.color;
    if (
      selectedBlockColor?.R === 0 &&
      selectedBlockColor?.G === 0 &&
      selectedBlockColor?.B === 0
    ) {
      if (newBlockIndex > 0) {
        newBlockIndex -= 1; // 往左選一格
      } else if (newBlockIndex < actionTable[nextArmor][nextPart].length - 1) {
        newBlockIndex += 1; // 往右選一格
      } else {
        return; // 如果左右都無效，直接 return
      }
    }

    dispatch(
      updateSelectedBlock({
        armorIndex: nextArmor,
        partIndex: nextPart,
        blockIndex: newBlockIndex,
      })
    );
  };
  const moveSelectedBlockLeft = () => {
    console.log("moveSelectedBlockLeft");
    if (!selectedBlock) return;

    const { armorIndex, partIndex, blockIndex } = selectedBlock;
    if (
      !actionTable?.[armorIndex]?.[partIndex] ||
      !actionTable[armorIndex][partIndex][blockIndex]
    ) {
      return;
    }
    let newBlockIndex = blockIndex;
    if (blockIndex > 0) {
      newBlockIndex = blockIndex - 1; // 預設向左移動 1 格
      // 如果 blockIndex - 1 的顏色是黑色，且與當前區塊時間差 10ms，則跳過
      const previousBlock = actionTable[armorIndex][partIndex][newBlockIndex];
      if (
        previousBlock?.color?.R === 0 &&
        previousBlock?.color?.G === 0 &&
        previousBlock?.color?.B === 0
      ) {
        if (blockIndex > 1) {
          newBlockIndex = blockIndex - 2; // 跳過黑色區塊
        }
        if (blockIndex === 1) {
          newBlockIndex = 1; // 如果黑色區塊是第一個，則直接跳過
        }
      }
    }
    dispatch(
      updateSelectedBlock({
        armorIndex,
        partIndex,
        blockIndex: newBlockIndex,
      })
    );
  };

  const moveSelectedBlockRight = () => {
    console.log("moveSelectedBlockRight");
    if (!selectedBlock) return;

    const { armorIndex, partIndex, blockIndex } = selectedBlock;
    if (
      !actionTable?.[armorIndex]?.[partIndex] ||
      !actionTable[armorIndex][partIndex][blockIndex]
    ) {
      return;
    }
    let newBlockIndex = blockIndex + 1; // 預設向右移動 1 格

    const nextBlock = actionTable[armorIndex][partIndex][newBlockIndex];
    const nextNextBlock = actionTable[armorIndex][partIndex][newBlockIndex + 1];

    if (
      nextBlock?.color?.R === 0 &&
      nextBlock?.color?.G === 0 &&
      nextBlock?.color?.B === 0
    ) {
      if (nextNextBlock) {
        newBlockIndex = blockIndex + 2;
      } else {
        newBlockIndex = blockIndex;
      }
    }
    dispatch(
      updateSelectedBlock({
        armorIndex,
        partIndex,
        blockIndex: newBlockIndex,
      })
    );
  };
  // 处理复选框选择变化
  const handleCheckboxChange = (armorIndex, partIndex, isChecked) => {
    const selection = { armorIndex, partIndex };
    setSelectedTimelines((prev) =>
      isChecked
        ? [...prev, selection]
        : prev.filter(
            (item) =>
              !(item.armorIndex === armorIndex && item.partIndex === partIndex)
          )
    );
  };
  // 全选/取消全选某列（所有人物的某种部件）
  const toggleColumnSelect = (partIndex) => {
    const isColumnFullySelected = Array.from({ length: 5 }).every(
      (_, armorIndex) =>
        selectedTimelines.some(
          (item) =>
            item.armorIndex === armorIndex && item.partIndex === partIndex
        )
    );

    setSelectedTimelines((prev) => {
      const updated = [...prev];
      Array.from({ length: 5 }).forEach((_, armorIndex) => {
        const exists = updated.some(
          (item) =>
            item.armorIndex === armorIndex && item.partIndex === partIndex
        );
        if (!isColumnFullySelected && !exists) {
          updated.push({ armorIndex, partIndex });
        } else if (isColumnFullySelected && exists) {
          const index = updated.findIndex(
            (item) =>
              item.armorIndex === armorIndex && item.partIndex === partIndex
          );
          if (index !== -1) updated.splice(index, 1);
        }
      });
      return updated;
    });
  };

  // 切换行全选/取消全选
  const toggleRowSelect = (armorIndex) => {
    const isRowFullySelected = Array.from({ length: 9 }).every((_, partIndex) =>
      selectedTimelines.some(
        (item) => item.armorIndex === armorIndex && item.partIndex === partIndex
      )
    );

    setSelectedTimelines((prev) => {
      const updated = [...prev];
      Array.from({ length: 9 }).forEach((_, partIndex) => {
        const exists = updated.some(
          (item) =>
            item.armorIndex === armorIndex && item.partIndex === partIndex
        );
        if (!isRowFullySelected && !exists) {
          updated.push({ armorIndex, partIndex });
        } else if (isRowFullySelected && exists) {
          const index = updated.findIndex(
            (item) =>
              item.armorIndex === armorIndex && item.partIndex === partIndex
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
        }))
      )
    );
    setShowModal(false); // 关闭模态框
  };

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

  useEffect(() => {
    const handleKeyDown = (event) => {
      // 檢查是否按下 Ctrl+Z（Undo）
      if (event.ctrlKey && event.key === "z") {
        event.preventDefault(); // 阻止默認行為
        undo();
      }

      // 檢查是否按下 Ctrl+Y（Redo）
      if (event.ctrlKey && event.key === "y") {
        event.preventDefault(); // 阻止默認行為
        redo();
      }
    };

    // 添加全局鍵盤事件監聽器
    document.addEventListener("keydown", handleKeyDown);

    // 清除事件監聽器
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSettingChange = (index, key, value) => {
    let tmp = JSON.parse(JSON.stringify(showPart));
    tmp = tmp.map((setting, i) =>
      i === index ? { ...setting, [key]: value } : setting
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
      hidden: false, // 預設不隱藏
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

  const handleToggleTimelineVisibility = (id) => {
    const updatedShowPart = showPart.map((setting) =>
      setting.id === id ? { ...setting, hidden: !setting.hidden } : setting
    );
    dispatch(updateShowPart(updatedShowPart));
  };

  const height = showPart?.length <= 7 ? 100 / showPart?.length : 14;
  return (
    <div className="control-panel">
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <table>
              <thead>
                <tr>
                  <th>Armor</th>
                  {Array.from({ length: 5 }).map((_, armorIndex) => (
                    <th key={armorIndex}>
                      <button
                        className={`allsel-button ${
                          Array.from({ length: 9 }).every((_, partIndex) =>
                            selectedTimelines.some(
                              (item) =>
                                item.armorIndex === armorIndex &&
                                item.partIndex === partIndex
                            )
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
                {Array.from({ length: 9 }).map((_, partIndex) => (
                  <tr key={partIndex}>
                    <td>
                      <button
                        className={`allsel-button ${
                          Array.from({ length: 5 }).every((_, armorIndex) =>
                            selectedTimelines.some(
                              (item) =>
                                item.armorIndex === armorIndex &&
                                item.partIndex === partIndex
                            )
                          )
                            ? "selected"
                            : ""
                        }`}
                        onClick={() => toggleColumnSelect(partIndex)}
                      >
                        All
                      </button>
                    </td>
                    {Array.from({ length: 5 }).map((_, armorIndex) => {
                      const isSelected = selectedTimelines.some(
                        (item) =>
                          item.armorIndex === armorIndex &&
                          item.partIndex === partIndex
                      );

                      return (
                        <td key={armorIndex}>
                          <button
                            className={`checkbox-button ${
                              isSelected ? "selected" : ""
                            }`}
                            onClick={() =>
                              handleCheckboxChange(
                                armorIndex,
                                partIndex,
                                !isSelected
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
            <div className="modal-buttons">
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button onClick={applySelection}>Apply</button>
            </div>
          </div>
        </div>
      )}
      <div className="downpart-container">
        <div className="lefttool-container">
          <div className="leftupcorner">
            <button className="choosetimeline" onClick={choosetimeline}>
              <span className="tooltip">Choose-Timeline</span>
              <FontAwesomeIcon icon={faSliders} size="lg" />
            </button>
            <button className="undo" onClick={undo}>
              <FontAwesomeIcon icon={faReply} size="lg" />
              <span className="tooltip">Undo ( Ctrl+Z )</span>
            </button>
            <button className="redo" onClick={redo}>
              <FontAwesomeIcon icon={faShare} size="lg" />
              <span className="tooltip">Redo ( Ctrl+Y )</span>
            </button>
            <button className="add-timeline" onClick={addTimeline}>
              <FontAwesomeIcon icon={faPlus} size="lg" />
              <span className="tooltip">Add-Timeline</span>
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
                className="timeline-settings-block"
                style={{
                  height: `${height}%`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  border: "1px solid rgb(63, 63, 63)",
                  gap: "10px",
                }}
              >
                {/* Armor Index Selector */}
                <label>
                  <select
                    value={setting.armorIndex}
                    style={{ width: "30px" }} // 設定較小的寬度
                    onChange={(e) =>
                      handleSettingChange(
                        index,
                        "armorIndex",
                        Number(e.target.value)
                      )
                    }
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
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
                        Number(e.target.value)
                      )
                    }
                  >
                    {Array.from({ length: 9 }).map((_, i) => (
                      <option key={i} value={i}>
                        {partName[i]}
                      </option>
                    ))}
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

                <button
                  className="toggle-timeline-visibility-button"
                  onClick={() => handleToggleTimelineVisibility(setting.id)} // 切換隱藏狀態
                >
                  <FontAwesomeIcon
                    icon={setting.hidden ? faEyeSlash : faEye}
                    size="lg"
                  />
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

export default ControlPanel;
