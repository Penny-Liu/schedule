import { describe, expect, it } from "vitest";
import {
  addDatedClientIfNew,
  countBmdMedicalOrders,
  getDatedClientKey,
  isBmdMedicalOrder,
  isDazhiHealthExplanation,
  isDazhiMetabolismExplanation,
  isDazhiNutritionConsultation,
  isUltrasoundOrder,
  mergeSynchronizedDailyStats,
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

  it("identifies only the Dazhi health-check nutrition consultation order", () => {
    expect(
      isDazhiNutritionConsultation({
        Location__c: "大直",
        CheckupName__c: "健檢營養諮詢",
        ResourceCategory__c: "NUTR",
      }),
    ).toBe(true);
    expect(
      isDazhiNutritionConsultation({
        Location__c: "大直",
        CheckupName__c: "營養門診(30)",
        ResourceCategory__c: "NutrC",
      }),
    ).toBe(false);
    expect(
      isDazhiNutritionConsultation({
        Location__c: "北投",
        CheckupName__c: "健檢營養諮詢",
        ResourceCategory__c: "NUTR",
      }),
    ).toBe(false);
  });

  it("maps Dazhi explanation orders to health check and metabolism separately", () => {
    const base = { Location__c: "大直" };
    expect(
      isDazhiHealthExplanation({ ...base, CheckupName__c: "體檢總評" }),
    ).toBe(true);
    expect(
      isDazhiHealthExplanation({ ...base, CheckupName__c: "代謝總評" }),
    ).toBe(false);
    expect(
      isDazhiMetabolismExplanation({
        ...base,
        CheckupName__c: "代謝總評",
      }),
    ).toBe(true);
    expect(
      isDazhiMetabolismExplanation({
        Location__c: "北投",
        CheckupName__c: "代謝總評",
      }),
    ).toBe(false);
  });

  it("preserves manual fields while replacing synchronized daily counts", () => {
    expect(
      mergeSynchronizedDailyStats(
        {
          "2026-09-07": {
            dazhi_clients: 20,
            dazhi_max_capacity: 40,
          },
        },
        {
          "2026-09-07": {
            dazhi_clients: 28,
            dazhi_nutrition_consultations: 12,
          },
        },
      ),
    ).toEqual({
      "2026-09-07": {
        dazhi_clients: 28,
        dazhi_max_capacity: 40,
        dazhi_nutrition_consultations: 12,
      },
    });
  });
});
