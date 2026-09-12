import "./App.css";
import "typeface-kanit";
import Home from "./pages/Home.jsx";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { Suspense, lazy, useState, useEffect } from "react";
import Login from "./pages/Login.jsx";
import "bootstrap/dist/css/bootstrap.min.css";
import { useDispatch } from "react-redux";
import { updateCurrentTime } from "./redux/actions"; //

/*
 * 只有編輯器（`/home`）與登入是一開始就載入的，其他頁面按需求才抓。
 *
 * 分割線畫在**路由**上而不是靠 `manualChunks` 手動分組，因為路由本來就是
 * 「使用者現在需要哪些程式碼」的天然邊界，不必維護一份會過期的模組清單。
 *
 * 實測（用 sourcemap 逐套件統計 1772KB 的初始 chunk）：
 *
 * | 頁面 | 帶進來的東西 | 大小 |
 * |---|---|---|
 * | `/model` | `three` + `@google/model-viewer` | **746 KB** |
 * | `/`（Welcome） | `framer-motion` | 99 KB |
 * | `/edit`、`/dashboard` | 各自的表格與清單 | 小 |
 *
 * `/model` 一頁就佔了整包的 42%，而排燈的人從頭到尾不會打開它。
 *
 * ⚠️ `Home` **不要** lazy —— 它是這個 app 唯一的熱路徑，切出去只會讓每次
 * 進編輯器多一趟往返。分割的目的是把「用不到的」移走，不是把所有東西都切開。
 */
const Welcome = lazy(() => import("./pages/Welcome.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const EditActionTable = lazy(() => import("./pages/EditActionTable.jsx"));
const ModelViewerComponent = lazy(() => import("./pages/model.jsx"));

function App() {
  const [rgba, setRgba] = useState({ R: 0, G: 0, B: 0, A: 1 });
  const [buttonState, setButtonState] = useState(false);
  const dispatch = useDispatch();
  function setCurrentTime(time) {
    dispatch(updateCurrentTime(time));
  }
  useEffect(() => {
    setCurrentTime(0);
  }, []);

  return (
    <Router basename={import.meta.env.BASE_URL}>
      {/* fallback 刻意留空：這幾頁的 chunk 都很小，閃一下載入字樣比空白更吵 */}
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route
            path="/home"
            element={
              <Home
                rgba={rgba}
                setRgba={setRgba}
                buttonState={buttonState}
                setButtonState={setButtonState}
              />
            }
          />
          <Route path="/edit" element={<EditActionTable />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/model" element={<ModelViewerComponent />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
