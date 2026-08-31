import { describe, expect, it } from "vitest";
import {
  addDatedClientIfNew,
  countBmdMedicalOrders,
  getDatedClientKey,
  isBmdMedicalOrder,
  isUltrasoundOrder,
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

  it("identifies ultrasound orders and builds a daily client deduplication key", () => {
    const firstOrder = {
      CheckStartDate__c: "2026-08-31",
      MedicalRecordNo__c: "P001",
      Order__c: "O001",
      CheckupName__c: "腹部超音波",
    };
    const secondOrderForSameClient = {
      ...firstOrder,
      Order__c: "O002",
      CheckupName__c: "甲狀腺超音波",
    };

    expect(isUltrasoundOrder(firstOrder)).toBe(true);
    expect(getDatedClientKey(firstOrder)).toBe("2026-08-31_P001");
    expect(getDatedClientKey(secondOrderForSameClient)).toBe(
      getDatedClientKey(firstOrder),
    );

    const seenClients = new Set();
    expect(addDatedClientIfNew(seenClients, firstOrder)).toBe(true);
    expect(addDatedClientIfNew(seenClients, secondOrderForSameClient)).toBe(
      false,
    );
  });
});
