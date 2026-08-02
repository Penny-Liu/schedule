const r = (val) => Math.round(val || 0);
const rawDailyStats = { dazhi_dx: 11, dazhi_mg: 1 };
const dazhiStats = { dx: rawDailyStats.dazhi_dx || 0, mg: rawDailyStats.dazhi_mg || 0 };
const calcDxSlots = (st) => r(st.dx * 0.5);
const calcMgSlots = (st) => r(st.mg * 1.5);
const buildLine = (station, names, stats, slots) => {
  if (names) {
    return `${station}｜${names}：${stats}  🎯 ${slots} Slot`;
  }
  return `${station}｜ ${stats}  🎯 ${slots} Slot`;
};
const out = [];
if (calcDxSlots(dazhiStats) > 0) {
  out.push(buildLine("DX", "", `${r(dazhiStats.dx)}位`, calcDxSlots(dazhiStats)));
}
if (calcMgSlots(dazhiStats) > 0) {
  out.push(buildLine("MG", "", `${r(dazhiStats.mg)}位`, calcMgSlots(dazhiStats)));
}
console.log(out);
