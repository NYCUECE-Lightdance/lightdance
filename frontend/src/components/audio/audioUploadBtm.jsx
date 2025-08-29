import React from "react";
import { useState, useEffect } from "react";

function UploadBottom() {
  // useEffect(() => {
  //   let uploader = document.getElementById("uploader");
  //   uploader.addEventListener("change", (event) => {
  //     console.log(event.target.files[0]);
  //   });
  // }, []);
  return (
    <div>
      <input
        type="file"
        id="uploader"
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          zIndex: "10",
        }}
      />
    </div>
  );
}
export default UploadBottom;
