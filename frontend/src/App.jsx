import "./App.css";
import ModelViewerComponent from "./pages/model.jsx";
import "typeface-kanit";
import EditActionTable from "./pages/EditActionTable.jsx";
import Home from "./pages/Home.jsx";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useState, useEffect } from "react";
import Welcome from "./pages/Welcome.jsx";
import Login from "./pages/Login.jsx";
import "bootstrap/dist/css/bootstrap.min.css";
import { useDispatch } from "react-redux";
import { updateCurrentTime } from "./redux/actions"; //

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
    <Router>
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
        <Route path="/model" element={<ModelViewerComponent />} />
      </Routes>
    </Router>
  );
}

export default App;
