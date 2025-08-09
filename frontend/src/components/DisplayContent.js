import React from "react";
import "./DisplayContent.css";



const DisplayContent = ({ position }) => {
  return (
    <div className="display-content">
      <p>Current Position: {position}px</p>
      {/* 根據位置顯示不同內容 */}
      {position < 100 ? (
        <p>內容A</p>
      ) : position < 200 ? (
        <p>內容B</p>
      ) : (
        <p>內容C</p>
      )}
    </div>
  );
};

export default DisplayContent;
