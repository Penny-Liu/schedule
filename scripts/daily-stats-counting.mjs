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

export const getDatedClientKey = (record = {}) =>
  `${record.CheckStartDate__c || ""}_${record.MedicalRecordNo__c || record.Order__c || ""}`;

export const addDatedClientIfNew = (seenClientKeys, record = {}) => {
  const clientKey = getDatedClientKey(record);
  if (seenClientKeys.has(clientKey)) return false;
  seenClientKeys.add(clientKey);
  return true;
};
