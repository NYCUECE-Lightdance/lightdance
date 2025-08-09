import React, { useEffect, useRef } from "react";
// 使用 Create React App (CRA) 或类似工具，file-loader 会处理 .glb 文件
import modelUrl from "../model/rigged.glb";
import "@google/model-viewer"; // 注册 custom element

/**
 * React 3D Model Viewer Component
 * 优化展示，确保模型完整可见。
 */
const ModelViewerComponent = () => {
  const viewerRef = useRef(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer) {
      viewer.addEventListener("load", () => console.log("✅ 模型加载成功"));
      viewer.addEventListener("error", (e) =>
        console.error("❌ 模型加载失败", e)
      );
    }
    return () => {
      if (viewer) {
        viewer.removeEventListener("load", () => {});
        viewer.removeEventListener("error", () => {});
      }
    };
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f0f0f0",
        overflow: "hidden",
      }}
    >
      <model-viewer
        ref={viewerRef}
        src={modelUrl}
        alt="从 Blender 导出的 3D 模型"
        auto-rotate
        camera-controls
        exposure="1"
        shadow-intensity="0.5"
        style={{ width: "100%", height: "100%" }}
        bounds="tight" // 使用紧密边界确保摄像机根据模型大小调整
        field-of-view="auto" // 自动设置视野以完整显示模型
        reveal="auto" // 页面加载/滚动时自动呈现
        min-camera-orbit="auto auto auto" // 自动调整相机轨道
      >
        <div slot="poster" style={{ color: "#555" }}>
          模型加载中...
        </div>
        <div slot="failure" style={{ color: "red" }}>
          模型加载失败，请检查路径或网络请求
        </div>
      </model-viewer>
    </div>
  );
};

export default ModelViewerComponent;
