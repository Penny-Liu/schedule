import { describe, expect, it } from "vitest";
import {
  isValidMedicalOrderStatus,
  VALID_MEDICAL_ORDER_STATUS,
  VALID_MEDICAL_ORDER_STATUS_SOQL,
} from "./medical-order-status.mjs";

describe("Salesforce medical-order status filtering", () => {
  it("counts only status 10 as a valid medical order", () => {
    expect(VALID_MEDICAL_ORDER_STATUS).toBe("10");
    expect(VALID_MEDICAL_ORDER_STATUS_SOQL).toBe(
      "Checkup_Status__c = '10'",
    );
    expect(isValidMedicalOrderStatus({ Checkup_Status__c: "10" })).toBe(true);
  });

  it.each(["20", "70", "90", "", null, undefined])(
    "excludes invalid or unknown status %s",
    (status) => {
      expect(isValidMedicalOrderStatus({ Checkup_Status__c: status })).toBe(
        false,
      );
    },
  );
});
