const NON_MEDICAL_BMD_ITEMS = ["流程報到"];

export const isBmdMedicalOrder = (record = {}) => {
  const category = String(record.ResourceCategory__c || "")
    .trim()
    .toLowerCase();
  const name = String(record.CheckupName__c || "").trim();
  const isBmdCategory = category === "bmd" || category.includes("骨質");

  return (
    isBmdCategory &&
    !NON_MEDICAL_BMD_ITEMS.some((itemName) => name.includes(itemName))
  );
};

export const countBmdMedicalOrders = (records = []) =>
  records.filter(isBmdMedicalOrder).length;

export const isUltrasoundOrder = (record = {}) =>
  String(record.CheckupName__c || "").includes("超音波");

export const isDazhiNutritionConsultation = (record = {}) => {
  const location = String(record.Location__c || "").trim();
  const name = String(record.CheckupName__c || "").trim();
  const category = String(record.ResourceCategory__c || "")
    .trim()
    .toUpperCase();

  return (
    location === "大直" &&
    name.includes("營養諮詢") &&
    (category === "NUTR" || name === "健檢營養諮詢")
  );
};

export const isHealthCheckExplanation = (record = {}) => {
  const location = String(record.Location__c || "").trim();
  return (
    (location === "北投" || location === "大直") &&
    String(record.CheckupName__c || "").trim() === "體檢總評"
  );
};

export const isDazhiMetabolismExplanation = (record = {}) =>
  String(record.Location__c || "").trim() === "大直" &&
  String(record.CheckupName__c || "").trim() === "代謝總評";

export const isHealthCheckInterview = (record = {}) => {
  const location = String(record.Location__c || "").trim();
  const name = String(record.CheckupName__c || "").trim();
  const category = String(record.ResourceCategory__c || "").trim();
  return (
    (location === "北投" || location === "大直") &&
    name === "護理諮詢" &&
    category === "檢備"
  );
};

export const isBeitouHealthCheckClientAnchor = (record = {}) =>
  String(record.Location__c || "").trim() === "北投" &&
  (isHealthCheckInterview(record) || isHealthCheckExplanation(record));

export const isDazhiHealthCheckClientAnchor = (record = {}) =>
  String(record.Location__c || "").trim() === "大直" &&
  String(record.CheckupName__c || "").trim() ===
    "身高、體重、脈搏呼吸、體溫、腰圍、臀圍" &&
  String(record.ResourceCategory__c || "").trim() === "檢備";

export const isDazhiMetabolismClientAnchor = (record = {}) =>
  String(record.Location__c || "").trim() === "大直" &&
  String(record.CheckupName__c || "").trim() === "流程報到" &&
  String(record.ResourceCategory__c || "").trim() === "NutrC";

export const getDatedClientKey = (record = {}) =>
  `${record.CheckStartDate__c || ""}_${record.MedicalRecordNo__c || record.Order__c || ""}`;

export const addDatedClientIfNew = (seenClientKeys, record = {}) => {
  const clientKey = getDatedClientKey(record);
  if (seenClientKeys.has(clientKey)) return false;
  seenClientKeys.add(clientKey);
  return true;
};

export const mergeSynchronizedDailyStats = (
  existingDailyStats = {},
  synchronizedDailyStats = {},
) => ({
  ...existingDailyStats,
  ...Object.fromEntries(
    Object.entries(synchronizedDailyStats).map(([date, synchronizedStats]) => [
      date,
      {
        ...(existingDailyStats[date] || {}),
        ...synchronizedStats,
      },
    ]),
  ),
});
