import React, { useEffect } from "react";
import "./TransparentButton.css";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateChosenColor } from "../redux/actions";

function TransparentButton({ rgba, setRgba }) {
  const dispatch = useDispatch();
  const chosenColor = useSelector((state) => state.profiles.chosenColor);

  // let maximum = 5;
  // const [num, setNum] = useState(1);

  useEffect(() => {
    console.log("Updated Trans:", chosenColor);
    // let transPercent = Json.parse(JSON.stringify(chosenColor.A));
    // 當 Redux 的透明度更新時同步 num 狀態
    // setNum(chosenColor.A * maximum);
    // }, [chosenColor.A, maximum]);
  }, []);

  function setTrans(transPercent) {
    // setRgba({ R: rgba.R, G: rgba.G, B: rgba.B, A: transPercent });
    // console.log("settrans", transPercent);
    dispatch(updateChosenColor({ ...chosenColor, A: transPercent }));
  }

  function minusNum() {
    if (chosenColor.A > 0) {
      dispatch(
        updateChosenColor({
          ...chosenColor,
          A: (parseInt(chosenColor.A * 10) - 2) / 10,
        })
      );
      // setNum((prevNum) => prevNum - 1);
      // setTrans((num - 1) / maximum);
    }
  }
  function addNum() {
    if (chosenColor.A < 1) {
      dispatch(
        updateChosenColor({
          ...chosenColor,
          A: (parseInt(chosenColor.A * 10) + 2) / 10,
        })
      );
      // setNum((prevNum) => prevNum + 1);
      // setTrans((num + 1) / maximum);
    }
  }

  return (
    <div className="box">
      <div className="minus" onClick={minusNum}>
        -
      </div>
      <div className="num">{parseInt(chosenColor?.A * 100)}%</div>
      <div className="add" onClick={addNum}>
        +
      </div>
    </div>
  );
}

export default TransparentButton;
