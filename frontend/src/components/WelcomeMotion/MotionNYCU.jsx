import { motion, useAnimate } from "framer-motion";
import { useEffect } from "react";
import "./style.css";

const MotionNYCU = () => {
  const [scope, animate] = useAnimate();

  const myAnimation = async () => {
    try {
      await animate(
        "line",
        {
          pathLength: 1,
          opacity: 1,
          transition: {
            pathLength: { type: "spring", duration: 1.5, bounce: 0 },
            opacity: { duration: 0.01 },
          },
        },
        { duration: 0.7, delay: 0.3 }
      );
      animate(
        "line",
        {
          y: -160,
        },
        { duration: 1, delay: 0.3 }
      );
    } catch {
      // 動畫只是裝飾，元素還沒掛上或已經卸載時直接略過
    }
  };

  useEffect(() => {
    myAnimation();
  });

  const startingX = 10;
  const startingY = 270;
  const height = 44;
  const letterWidth = 35;

  return (
    <>
      <motion.svg
        width="510px"
        height="600px"
        style={{ position: "relative" }}
        ref={scope}
      >
        {/* N */}
        <motion.line
          x1={startingX}
          y1={startingY}
          x2={startingX}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX}
          y1={startingY}
          x2={startingX + letterWidth}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + letterWidth}
          y1={startingY + height}
          x2={startingX + letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        {/* Y */}
        <motion.line
          x1={startingX + 2.5 * letterWidth}
          y1={startingY + height}
          x2={startingX + 2.5 * letterWidth}
          y2={startingY + 0.5 * letterWidth}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 2 * letterWidth}
          y1={startingY}
          x2={startingX + 2.5 * letterWidth}
          y2={startingY + 0.5 * letterWidth}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 3 * letterWidth}
          y1={startingY}
          x2={startingX + 2.5 * letterWidth}
          y2={startingY + 0.5 * letterWidth}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        {/* C */}
        <motion.line
          x1={startingX + 4 * letterWidth}
          y1={startingY}
          x2={startingX + 5 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 4 * letterWidth}
          y1={startingY + height}
          x2={startingX + 4 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 4 * letterWidth}
          y1={startingY + height}
          x2={startingX + 5 * letterWidth}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />

        {/* U */}
        <motion.line
          x1={startingX + 6 * letterWidth}
          y1={startingY}
          x2={startingX + 6 * letterWidth}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 7 * letterWidth}
          y1={startingY + height}
          x2={startingX + 6 * letterWidth}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 7 * letterWidth}
          y1={startingY + height}
          x2={startingX + 7 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        {/* E */}
        <motion.line
          x1={startingX + 9 * letterWidth}
          y1={startingY + height}
          x2={startingX + 9 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 9 * letterWidth}
          y1={startingY + height}
          x2={startingX + 10 * letterWidth}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 9 * letterWidth}
          y1={startingY}
          x2={startingX + 10 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 9.8 * letterWidth}
          y1={startingY + 0.5 * height}
          x2={startingX + 9 * letterWidth}
          y2={startingY + 0.5 * height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        {/* C */}
        <motion.line
          x1={startingX + 11 * letterWidth}
          y1={startingY}
          x2={startingX + 12 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 11 * letterWidth}
          y1={startingY + height}
          x2={startingX + 11 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 11 * letterWidth}
          y1={startingY + height}
          x2={startingX + 12 * letterWidth}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        {/* E */}
        <motion.line
          x1={startingX + 13 * letterWidth}
          y1={startingY + height}
          x2={startingX + 13 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 13 * letterWidth}
          y1={startingY + height}
          x2={startingX + 14 * letterWidth}
          y2={startingY + height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 13 * letterWidth}
          y1={startingY}
          x2={startingX + 14 * letterWidth}
          y2={startingY}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
        <motion.line
          x1={startingX + 13.8 * letterWidth}
          y1={startingY + 0.5 * height}
          x2={startingX + 13 * letterWidth}
          y2={startingY + 0.5 * height}
          stroke="yellow"
          initial={{ opacity: 0, pathLength: 0 }}
        />
      </motion.svg>
      
      {/* moving light spot */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            width: "3px",
            height: "3px",
            background: "yellow",
            borderRadius: "50%",
            left: `${20 + Math.random() * 60}%`,
            top: `${30 + Math.random() * 40}%`,
          }}
          animate={{
            scale: [0, 1, 0],
            opacity: [0, 0.8, 0],
            y: [0, -30, -60],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </>
  );
};

export default MotionNYCU;