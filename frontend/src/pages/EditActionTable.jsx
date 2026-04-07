import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable } from "../redux/actions";
import { useNavigate } from "react-router-dom"; // 🔹 加入 useNavigate

function EditActionTable() {
  const dispatch = useDispatch();
  const navigate = useNavigate(); // 🔹 用來做頁面跳轉
  const actionTable = useSelector((state) => state.profiles.data?.actionTable || []);

  const partName = [
    "帽子",      // 0
    "臉",        // 1
    "左胸",      // 2
    "右胸",      // 3
    "左手臂",    // 4
    "右手臂",    // 5
    "領帶",      // 6
    "腰帶",      // 7
    "左手套",    // 8
    "右手套",    // 9
    "左腿",      // 10
    "右腿",      // 11
    "左鞋",      // 12
    "右鞋",      // 13
    "板子",    // 14
  ];

  // 選擇 Armor & Part
  const [selectedArmor, setSelectedArmor] = useState(
    Object.keys(actionTable)[0] || ""
  );
  const [selectedPart, setSelectedPart] = useState(
    selectedArmor ? Object.keys(actionTable[selectedArmor])[0] : ""
  );

  // Undo / Redo 機制
  const [history, setHistory] = useState([
    JSON.parse(JSON.stringify(actionTable)),
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const saveToHistory = (newTable) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newTable)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      dispatch(updateActionTable(history[historyIndex - 1]));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      dispatch(updateActionTable(history[historyIndex + 1]));
    }
  };

  const handleChange = (armorIndex, partIndex, blockIndex, key, value) => {
    const updatedTable = JSON.parse(JSON.stringify(history[historyIndex]));
    updatedTable[armorIndex][partIndex][blockIndex][key] = value;
    saveToHistory(updatedTable);
    dispatch(updateActionTable(updatedTable));
  };

  const handleAddBlock = () => {
    if (!selectedArmor || !selectedPart) return;
    const updatedTable = JSON.parse(JSON.stringify(history[historyIndex]));
    updatedTable[selectedArmor][selectedPart].push({
      time: 0,
      color: { R: 255, G: 255, B: 255, A: 1 },
    });
    saveToHistory(updatedTable);
    dispatch(updateActionTable(updatedTable));
  };

  const handleDeleteBlock = (blockIndex) => {
    if (!selectedArmor || !selectedPart) return;
    const updatedTable = JSON.parse(JSON.stringify(history[historyIndex]));
    updatedTable[selectedArmor][selectedPart].splice(blockIndex, 1);
    saveToHistory(updatedTable);
    dispatch(updateActionTable(updatedTable));
  };

  const handleSave = () => {
    if (!selectedArmor || !selectedPart) return;
    const updatedTable = JSON.parse(JSON.stringify(history[historyIndex]));
    updatedTable[selectedArmor][selectedPart] = updatedTable[selectedArmor][
      selectedPart
    ]
      .map((block) => ({
        ...block,
        time: block.time,
      }))
      .sort((a, b) => a.time - b.time);
    saveToHistory(updatedTable);
    dispatch(updateActionTable(updatedTable));
    alert("ActionTable updated with fixed times!");
  };

  return (
    <div
      className="edit-container"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        width: "100%",
      }}
    >
      <h2>Edit Action Table</h2>
      {/* 返回按鈕 🔹 */}
      <button onClick={() => navigate(-1)} className="back-button">
        ← 返回
      </button>
      {/* 選擇 Armor & Part */}
      <div className="select-container">
        <label>Select Armor:</label>
        <select
          value={selectedArmor}
          onChange={(e) => setSelectedArmor(e.target.value)}
        >
          {Object.keys(actionTable).map((armorIndex) => (
            <option key={armorIndex} value={armorIndex}>
              Armor {armorIndex}
            </option>
          ))}
        </select>

        {selectedArmor && (
          <>
            <label>Select Part:</label>
            <select
              value={selectedPart}
              onChange={(e) => setSelectedPart(e.target.value)}
            >
              {Object.keys(actionTable[selectedArmor] || {}).map(
                (partIndex) => (
                  <option key={partIndex} value={partIndex}>
                    {partName[partIndex]}
                  </option>
                )
              )}
            </select>
          </>
        )}
      </div>

      {/* Undo / Redo 按鈕 */}
      <div className="history-buttons">
        <button onClick={handleUndo} disabled={historyIndex === 0}>
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={historyIndex === history.length - 1}
        >
          Redo
        </button>
      </div>

      {/* 顯示選擇的 Armor & Part */}
      {selectedArmor &&
        selectedPart &&
        actionTable[selectedArmor][selectedPart] && (
          <div className="table-wrapper">
            <PartEditor
              armorIndex={selectedArmor}
              partIndex={selectedPart}
              blocks={actionTable[selectedArmor][selectedPart]}
              onUpdate={handleChange}
              onDeleteBlock={handleDeleteBlock}
            />
          </div>
        )}

      {/* 新增和儲存按鈕 */}
      <div className="button-container">
        <button onClick={handleAddBlock}>+ Add Block</button>
        <button onClick={handleSave}>Save Changes</button>
      </div>
    </div>
  );
}

function PartEditor({
  armorIndex,
  partIndex,
  blocks,
  onUpdate,
  onDeleteBlock,
}) {
  const partName = [
    "帽子",      // 0
    "臉",        // 1
    "左胸",      // 2
    "右胸",      // 3
    "左手臂",    // 4
    "右手臂",    // 5
    "領帶",      // 6
    "腰帶",      // 7
    "左手套",    // 8
    "右手套",    // 9
    "左腿",      // 10
    "右腿",      // 11
    "左鞋",      // 12
    "右鞋",      // 13
  ];
  return (
    <div
      className="table-container"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <h3>
        Armor {armorIndex} - {partName[partIndex]}
      </h3>
      <div
        className="scrollable-table"
        style={{ display: "flex", justifyContent: "center" }}
      >
        <table>
          <thead>
            <tr>
              <th>Block Index</th>
              <th>Time</th>
              <th>Color</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, blockIndex) => (
              <tr key={blockIndex}>
                <td>{blockIndex}</td>
                <td>
                  <input
                    type="number"
                    value={block.time || ""}
                    onChange={(e) =>
                      onUpdate(
                        armorIndex,
                        partIndex,
                        blockIndex,
                        "time",
                        Number(e.target.value)
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={rgbToHex(block.color)}
                    onChange={(e) =>
                      onUpdate(
                        armorIndex,
                        partIndex,
                        blockIndex,
                        "color",
                        hexToRgb(e.target.value)
                      )
                    }
                  />
                </td>
                <td>
                  <button onClick={() => onDeleteBlock(blockIndex)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 轉換 RGB 到 Hex
const rgbToHex = (color) => {
  if (!color) return "#ffffff";
  const { R, G, B } = color;
  return `#${[R, G, B].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

// 轉換 Hex 到 RGB
const hexToRgb = (hex) => {
  const bigint = parseInt(hex.slice(1), 16);
  return {
    R: (bigint >> 16) & 255,
    G: (bigint >> 8) & 255,
    B: bigint & 255,
    A: 1,
  };
};

export default EditActionTable;
