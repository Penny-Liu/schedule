export const VALID_MEDICAL_ORDER_STATUS = "10";

export const VALID_MEDICAL_ORDER_STATUS_SOQL =
  `Checkup_Status__c = '${VALID_MEDICAL_ORDER_STATUS}'`;

export const isValidMedicalOrderStatus = (record = {}) =>
  String(record.Checkup_Status__c || "").trim() ===
  VALID_MEDICAL_ORDER_STATUS;
