import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { flushPersist } from "../redux/store.js";
import { useDispatch } from "react-redux";
import {
  updateAccessToken,
  updateUser,
  updateUserName,
  updateAutoRefresh,
} from "../redux/actions";
import { API_ENDPOINTS } from "../config/api.js";

/**
 * 登入 / 建立帳號。
 *
 * 兩個模式共用同一張表單——欄位幾乎一樣（帳號、密碼），註冊多兩個
 * （確認密碼、邀請碼）。拆成兩個頁面的話「切過去要重打一次帳號」，
 * 而多數人是先試登入、發現沒帳號才去註冊的。
 *
 * ## 錯誤是行內顯示，不用 alert
 *
 * 註冊的失敗原因有好幾種（帳號格式、密碼太短、名字被用了、邀請碼錯），
 * 而且後端會回一句具體的 `detail`。彈窗會蓋住表單、看不出是哪一欄有問題，
 * 而且按掉之後那句話就消失了。
 */

/** 兩條路徑共用：把權杖寫進 store 並落地，然後導頁 */
const useEnterApp = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  return useCallback(
    async (token, username) => {
      dispatch({ type: "REFRESH" });
      dispatch(updateAccessToken(token));
      dispatch(updateUser(username));
      dispatch(updateUserName(username));
      dispatch(updateAutoRefresh(2));

      /*
       * 登入狀態要立刻落地再導頁。persist 的寫入有 2 秒 debounce，不等它的話，
       * 使用者在這 2 秒內重新整理或直接開 /home 會因為讀不到 token 而被彈回
       * 首頁——看起來就像剛剛那次登入沒生效。
       */
      await flushPersist();
      navigate("/dashboard");
    },
    [dispatch, navigate],
  );
};

/** 從回應裡取出後端寫的原因。FastAPI 的驗證錯誤 detail 會是一個陣列 */
const readDetail = async (response) => {
  try {
    const body = await response.json();
    const { detail } = body ?? {};
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join("、");
  } catch {
    /* 回應不是 JSON（例如 proxy 掛掉回了 HTML），下面用預設訊息 */
  }
  return null;
};

const Login = () => {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const enterApp = useEnterApp();
  const isRegister = mode === "register";

  // 送出中不要讓 Enter 或連點再送一次：註冊重複送出會拿到 409，
  // 而使用者看到的是「帳號已經有人用了」——用了那個名字的正是他自己
  const busyRef = useRef(false);

  /*
   * 改任何一欄就把錯誤收掉。不收的話「請填寫邀請碼」會在使用者填好之後
   * 繼續掛在那一欄底下——欄位是滿的、訊息說它是空的，看起來像壞掉
   * （實際上只是要等下一次送出才更新）。
   */
  const edit = (setter) => (event) => {
    setter(event.target.value);
    if (error) setError("");
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setConfirm("");
    setInviteCode("");
  };

  const handleLogin = async () => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    const response = await fetch(API_ENDPOINTS.LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    if (!response.ok) {
      setError((await readDetail(response)) ?? "帳號或密碼不正確");
      return;
    }

    const data = await response.json();
    if (!data.access_token) {
      setError("帳號或密碼不正確");
      return;
    }
    await enterApp(data.access_token, username);
  };

  const handleRegister = async () => {
    // 確認密碼在前端擋就好——後端沒有這個欄位，它是「怕你打錯」不是安全性
    if (password !== confirm) {
      setError("兩次輸入的密碼不一樣");
      return;
    }

    /*
     * 邀請碼是必填的。空白在後端一樣會被擋（compare_digest 對不上空字串），
     * 但那要繞一趟網路才換到「邀請碼不正確」——而使用者其實是根本沒填。
     * 前端先擋是為了那句訊息說得準，真正的把關仍然在後端。
     */
    if (!inviteCode.trim()) {
      setError("請填寫邀請碼");
      return;
    }

    const response = await fetch(API_ENDPOINTS.REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        invite_code: inviteCode.trim(),
      }),
    });

    if (!response.ok) {
      setError((await readDetail(response)) ?? `建立帳號失敗（${response.status}）`);
      return;
    }

    // 後端建完直接回權杖，不必再打一次登入
    const data = await response.json();
    await enterApp(data.access_token, data.username);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await (isRegister ? handleRegister() : handleLogin());
    } catch (e) {
      console.error(isRegister ? "建立帳號失敗" : "登入失敗", e);
      setError("連不上伺服器，請確認網路或稍後再試");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "linear-gradient(black, rgb(10, 10, 51))",
        width: "100%",
      }}
      className="d-flex align-items-center justify-content-center"
    >
      {/*
        用真的 <form> 包起來，送出走 onSubmit——這樣 Enter 鍵是瀏覽器原生行為，
        不必自己在 document 上掛 keydown。舊版掛在 document 上而且相依於每次
        重新建立的 handleLogin，等於每一次 render 都拆掉再裝一次。
      */}
      <Form onSubmit={handleSubmit} style={{ width: "300px" }}>
        <h4 className="text-white mb-4">
          {isRegister ? "建立帳號" : "登入"}
        </h4>

        <Form.Group className="mb-3">
          <Form.Label className="text-white">帳號</Form.Label>
          <Form.Control
            type="text"
            value={username}
            onChange={edit(setUsername)}
            autoFocus
            autoComplete="username"
            style={{ fontSize: "18px" }}
          />
          {isRegister && (
            <Form.Text className="text-white-50">
              3~32 個字，英文、數字、底線、句點、連字號
            </Form.Text>
          )}
        </Form.Group>

        <Form.Group className={isRegister ? "mb-3" : "mb-4"}>
          <Form.Label className="text-white">密碼</Form.Label>
          <Form.Control
            type="password"
            value={password}
            onChange={edit(setPassword)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            style={{ fontSize: "18px" }}
          />
          {isRegister && (
            <Form.Text className="text-white-50">至少 8 個字</Form.Text>
          )}
        </Form.Group>

        {isRegister && (
          <>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">確認密碼</Form.Label>
              <Form.Control
                type="password"
                value={confirm}
                onChange={edit(setConfirm)}
                autoComplete="new-password"
                style={{ fontSize: "18px" }}
              />
            </Form.Group>

            {/* 必填。值來自後端的 REGISTER_CODE，沒設的話那支端點回 503 */}
            <Form.Group className="mb-4">
              <Form.Label className="text-white">邀請碼</Form.Label>
              <Form.Control
                type="text"
                value={inviteCode}
                onChange={edit(setInviteCode)}
                autoComplete="off"
                style={{ fontSize: "18px" }}
              />
              <Form.Text className="text-white-50">向負責人索取</Form.Text>
            </Form.Group>
          </>
        )}

        {/* 錯誤留在表單裡，按掉彈窗就消失的話使用者要重試才知道剛剛錯在哪 */}
        {error && (
          <div className="alert alert-danger py-2" role="alert">
            {error}
          </div>
        )}

        <Button
          variant="primary"
          type="submit"
          className="mb-3 w-100"
          disabled={busy}
          data-testid="auth-submit"
        >
          {busy ? "處理中…" : isRegister ? "建立帳號" : "登入"}
        </Button>

        <Button
          variant="link"
          className="mb-3 w-100"
          onClick={() => switchMode(isRegister ? "login" : "register")}
          data-testid="auth-switch"
        >
          {isRegister ? "已經有帳號了？改用登入" : "還沒有帳號？建立一個"}
        </Button>

        <Button variant="danger" className="w-100" href="/">
          返回
        </Button>
      </Form>
    </div>
  );
};

export default Login;
