import React from "react";
import "./StartButton.css";
import { useState, useEffect } from "react";

function StartButton({
  currentTime,
  setCurrentTime,
  buttonState,
  setButtonState,
}) {
  const clickButton = () => {
    setButtonState(!buttonState);
  };
  const addOneTime = () => {
    if (buttonState === true) {
      setCurrentTime(currentTime + 10);
    }
  };
  if (buttonState === true) {
    setTimeout(addOneTime, 10);
  }
  return (
    <div className="start-button" onClick={clickButton}>
      Start
      <p> time : {currentTime}</p>
    </div>
  );
}

export default StartButton;
