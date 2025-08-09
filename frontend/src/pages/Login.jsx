import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { persistor } from "../redux/store.js"; // Assuming you have a persistor configured
import { useDispatch, useSelector } from "react-redux";
import {
  updateAccessToken,
  updateUserName,
  updateAutoRefresh,
} from "../redux/actions";

const Login = () => {
  const [idNumber, setIdNumber] = useState("");
  const [passwd, setPasswd] = useState("");
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const token = useSelector((state) => state.profiles.accessToken);

  // useEffect(() => {
  //   dispatch(updateAccessToken("your_token_here"));
  // }, [dispatch]);

  const handleLogin = async (e) => {
    console.log("Logging in...");
    e.preventDefault();
    const formData = new URLSearchParams();
    formData.append("username", idNumber); // idNumber should be the username input
    formData.append("password", passwd);
    try {
      console.log("Logging in...");
      const response = await fetch("http://140.113.160.136:8000/token", {
        method: "POST",
        headers: {
          // "Content-Type": "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        // body: JSON.stringify({ username: idNumber, password: passwd }),
        body: formData,
        mode: "cors",
      });

      if (!response.ok) {
        // throw new Error("Network response was not ok");
      }

      const data = await response.json();

      if (data.access_token) {
        console.log("login", data);
        console.log("Login successful!", data);
        dispatch({ type: "REFRESH" });

        dispatch(updateAccessToken(data.access_token));
        dispatch(updateUserName(idNumber));
        dispatch(updateAutoRefresh(2));
        navigate("/home"); // Redirect to /home if login is successful
      } else {
        console.error("Login failed: Incorrect username or password");
        alert("Login failed: Incorrect username or password");
      }
    } catch (error) {
      console.error("Login failed: Incorrect username or password");
      alert("Login failed: Incorrect username or password");
    }
  };

  useEffect(() => {
    const handleKeyDown = async (event) => {
      if (event.key === "Enter") {
        try {
          await handleLogin(event);
        } catch (error) {
          console.error("Error in handleLogin:", error);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleLogin]);

  return (
    <div
      style={{
        height: "100vh",
        background: "linear-gradient(black, rgb(10, 10, 51))",
        width: "100%",
      }}
      className="d-flex align-items-center justify-content-center"
    >
      <Form>
        <Form.Group className="mb-3">
          <Form.Label>帳號</Form.Label>
          <Form.Control
            type="text"
            onChange={(e) => setIdNumber(e.target.value)}
            autoFocus
            style={{ fontSize: "18px" }} // 這裡設置字體大小
          />
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>密碼</Form.Label>
          <Form.Control
            type="password"
            onChange={(e) => setPasswd(e.target.value)}
            style={{ fontSize: "18px" }} // 這裡設置字體大小
          />
        </Form.Group>

        <Button
          variant="primary"
          className="mb-4"
          style={{ width: "300px" }}
          onClick={handleLogin}
        >
          登入
        </Button>

        <Button
          variant="danger"
          className="mb-4"
          style={{ width: "300px" }}
          href="/"
        >
          返回
        </Button>
      </Form>
    </div>
  );
};

export default Login;
