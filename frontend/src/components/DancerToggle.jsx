import { useDispatch, useSelector } from "react-redux";
import { updateDancerVisibility } from "../redux/actions";
import { FaUser } from "react-icons/fa";
import "./DancerToggle.css";

const DancerToggle = () => {
  const dispatch = useDispatch();
  const dancerVisibility = useSelector(
    (state) => state.profiles.dancerVisibility
  );

  /**
   * 切換特定舞者的顯示狀態
   * @param {number} index - 舞者索引 (0-6)
   */
  
  const toggleDancer = (index) => {
    const newVisibility = [...dancerVisibility];
    newVisibility[index] = !newVisibility[index];
    dispatch(updateDancerVisibility(newVisibility));
  };

  return (
    <div className="dancer-toggle-container">
      {dancerVisibility.map((isVisible, index) => (
        <div
          key={index}
          className={`dancer-toggle-item ${isVisible ? "active" : ""}`}
          onClick={() => toggleDancer(index)}
          title={`舞者 ${index + 1}${isVisible ? " (顯示中)" : " (已隱藏)"}`}
        >
          <FaUser className="dancer-icon" />
          <span className="dancer-number">{index + 1}</span>
        </div>
      ))}
    </div>
  );
};

export default DancerToggle;