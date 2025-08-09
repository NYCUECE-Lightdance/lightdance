import "./App.css";
import { useEffect, useState } from "react";

function Block(props) {
  const [showDetailed, setShowDetailed] = useState(false);

  /**
   * 按下格子時改變格子的顏色
   * @param {*} lineId 第幾行
   * @param {*} squareId 每一行的第幾格
   */
  const handleClickSquare = (lineId, squareId) => {
    props.handleChangeBlockColor(props.id, lineId, squareId);
  };

  const outputColor = () => {
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        let encode =
          4 * (props.colorArray[i][j].R !== 0) +
          2 * (props.colorArray[i][j].G !== 0) +
          (props.colorArray[i][j].B !== 0);
        console.log(encode);
        //console.log(props.colorArray[i][j].B);
      }
      console.log("\n");
    }
  };

  return (
    <div>
      {showDetailed ? (
        <div className="box" style={{ backgroundColor: "lightblue" }}>
          {props.colorArray.map((lineColors, lineId) => (
            <div key={lineId} className="line">
              {lineColors.map((square, squareId) => (
                <div
                  key={squareId}
                  className="square"
                  style={{
                    backgroundColor: `rgb(${square.R}, ${square.G}, ${square.B})`,
                  }}
                  onClick={() => handleClickSquare(lineId, squareId)}
                ></div>
              ))}
            </div>
          ))}
          <div className="outputButton">
            <button onClick={() => setShowDetailed(false)}>關閉</button>
            <button onClick={() => outputColor()}>輸出</button>
          </div>
        </div>
      ) : (
        <div
          className="box mini"
          style={{
            width: "200px",
            height: "200px",
            backgroundColor: "lightblue",
            borderRadius: "10px",
          }}
          onClick={() => setShowDetailed(true)}
        >
          {props.colorArray.map((lineColors, lineId) => (
            <div key={lineId} className="line mini">
              {lineColors.map((square, squareId) => (
                <div
                  key={squareId}
                  className="square-mini"
                  style={{
                    backgroundColor: `rgb(${square.R}, ${square.G}, ${square.B})`,
                  }}
                ></div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Block;
