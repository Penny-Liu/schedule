const dStats = { dazhi_nutrition_consultations: 14 };
const currentLoc = "大直";
const valStr = currentLoc === "大直" ? (dStats.dazhi_nutrition_consultations || 0).toString() : "0";
console.log(valStr);
