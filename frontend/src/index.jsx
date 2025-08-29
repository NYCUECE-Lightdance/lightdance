import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux"; // 引入 Redux Provider
import { PersistGate } from "redux-persist/integration/react"; // 引入 PersistGate
import { store, persistor } from "./redux/store"; // 引入 store 和 persistor
import App from "./App.jsx";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <App />
    </PersistGate>
  </Provider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
