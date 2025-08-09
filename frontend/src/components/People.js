import React, { useEffect } from "react";
import Armor from "./Armor.js";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable } from "../redux/actions";

function People() {
  const components = Array(5).fill(null);
  const actionTable = useSelector((state) => state.profiles.actionTable);
  const dispatch = useDispatch();

  // 初始化 actionTable
  useEffect(() => {
    if (!actionTable || actionTable.length === 0) {
      const initialData = Array.from({ length: 5 }, () =>
        Array.from({ length: 9 }, () => [
          { time: 0, color: { R: 0, G: 0, B: 0, A: 1 } },
        ])
      );

      console.log("Initializing actionTable:", initialData);
      dispatch(updateActionTable(initialData));
    }
  }, [dispatch, actionTable]);

  return (
    <div>
      {components.map((_, index) => (
        <div className="personBackGround" key={index}>
          <Armor index={index} />
        </div>
      ))}
    </div>
  );
}

export default People;
