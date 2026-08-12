import { describe, expect, it } from "vitest";
import {
  countBmdMedicalOrders,
  isBmdMedicalOrder,
} from "./daily-stats-counting.mjs";

describe("daily stats BMD medical-order counting", () => {
  it("counts every valid BMD medical order, including multiple orders for one patient", () => {
    const records = [
      {
        MedicalRecordNo__c: "P001",
        ResourceCategory__c: "BMD",
        CheckupName__c: "骨質密度檢查",
      },
      {
        MedicalRecordNo__c: "P001",
        ResourceCategory__c: "BMD",
        CheckupName__c: "身體脂肪組成分析",
      },
      {
        MedicalRecordNo__c: "P002",
        ResourceCategory__c: "骨質密度",
        CheckupName__c: "骨質密度檢查",
      },
    ];

    expect(countBmdMedicalOrders(records)).toBe(3);
  });

  it("excludes workflow rows and non-BMD items", () => {
    expect(
      isBmdMedicalOrder({
        ResourceCategory__c: "BMD",
        CheckupName__c: "流程報到",
      }),
    ).toBe(false);
    expect(
      isBmdMedicalOrder({
        ResourceCategory__c: "US",
        CheckupName__c: "骨盆腔超音波(女)",
      }),
    ).toBe(false);
  });
});
