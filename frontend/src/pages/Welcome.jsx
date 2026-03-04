import MotionNYCU from "../components/WelcomeMotion/MotionNYCU.jsx";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import "./style.css";

const Welcome = () => {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      <MotionNYCU />
      <motion.h1
        style={{ color: "white", position: "absolute", top: "auto" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 1, duration: 0.5 } }}
      >
        光舞設計
      </motion.h1>

      <motion.button
        className="pass-button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 1, duration: 0.5 } }}
        onClick={() => navigate("/home")}
      >
        開始
      </motion.button>

      <motion.button
        className="signup-button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 1, duration: 0.5 } }}
        onClick={() => navigate("/login")}
      >
        登入
      </motion.button>
    </div>
  );
};

export default Welcome;
