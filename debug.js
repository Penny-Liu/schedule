const r = (val) => Math.round(val || 0);
const calcDxSlots = (st) => r(st.dx * 0.5);
const calcMgSlots = (st) => r(st.mg * 1.5);

const stats = {
  dazhi_ultrasound: 31,
  dazhi_bmd: 10,
  dazhi_dx: 11,
  dazhi_mg: 1
};
const rawDailyStats = stats || {};
const dazhiStats = {
  dx: rawDailyStats.dazhi_dx || 0,
  mg: rawDailyStats.dazhi_mg || 0
};
console.log("dx slots:", calcDxSlots(dazhiStats));
console.log("mg slots:", calcMgSlots(dazhiStats));
console.log("dx > 0?", calcDxSlots(dazhiStats) > 0);
console.log("mg > 0?", calcMgSlots(dazhiStats) > 0);
