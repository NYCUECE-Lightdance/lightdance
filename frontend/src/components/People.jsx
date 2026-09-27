import React, { useEffect } from "react";
import Armor from "./Armor.jsx";
import { useDispatch, useSelector } from "react-redux";
import { updateActionTable } from "../redux/actions.js";
import { PLAYER_INDICES, createEmptyActionTable } from "../constants/parts.js";

function People() {
  const actionTable = useSelector(
    (state) => state.profiles.data?.actionTable || [],
  );
  const dancerVisibility = useSelector(
    (state) => state.profiles.dancerVisibility,
  );
  const dispatch = useDispatch();

  // 初始化 actionTable。segment 模型的「全部熄滅」就是每個部位一個空陣列——
  // 沒有段就是沒有光，不需要放一個 time 0 的黑點。
  useEffect(() => {
    if (!actionTable || actionTable.length === 0) {
      const initialData = createEmptyActionTable();

      console.log("Initializing actionTable:", initialData);
      // skipHistory：這是初始化不是編輯，不該佔用一格 undo。
      // （Phase 4 前是靠 reducer 裡「第一個部位只有 1 個元素」的形狀猜測達成，
      //   那條判斷在 segment 世界會誤判正常編輯，已改為由呼叫端明示。）
      dispatch(updateActionTable(initialData, { skipHistory: true }));
    }
  }, [dispatch, actionTable]);

  return (
    <>
      {/*
        光衣自成一列。舞者顯示開關（DancerToggle）原本是 position: absolute
        浮在這一區上面，實測蓋住 12 個部位（好幾位舞者的腿與鞋），那些部位
        根本點不到、沒辦法上色。包成一列之後開關排在下方、各佔各的空間。
      */}
      <div className="people-row">
        {PLAYER_INDICES.map((index) => {
          if (!dancerVisibility[index]) {
            return null;
          }
          return (
            <div className="personBackGround" key={index}>
              <Armor index={index} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export default People;
