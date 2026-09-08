import { describe, expect, it } from "vitest";
import {
  formatPhysicianDazhiLineStaffBlock,
  formatPhysicianDazhiLineStats,
} from "./physicianDazhiLineSummary";

describe("physician Dazhi LINE summary", () => {
  it("formats the requested five-line block with existing daily statistics", () => {
    expect(
      formatPhysicianDazhiLineStats({
        beitou_clients: 0,
        beitou_cta: 0,
        dazhi_clients: 28,
        dazhi_metabolism_clients: 9,
        dazhi_nutrition_consultations: 12,
        dazhi_health_explanations: 27,
        dazhi_metabolism_explanations: 8,
        dazhi_gi: 14,
        dazhi_ultrasound_heart: 3,
      }),
    ).toBe(
      [
        "健檢/代謝總人數：28 位/9 位",
        "健檢/代謝解說：27 位/8 位",
        "營養諮詢：12位",
        "腸胃：14",
        "心超：3",
      ].join("\n"),
    );
  });

  it("leaves unavailable or zero counts blank for manual LINE entry", () => {
    expect(formatPhysicianDazhiLineStats()).toBe(
      [
        "健檢/代謝總人數： 位/ 位",
        "健檢/代謝解說： 位/ 位",
        "營養諮詢：位",
        "腸胃：",
        "心超：",
      ].join("\n"),
    );
  });

  it("formats Dazhi block two from combined health-management tasks", () => {
    const staff = [
      ["u1", "葉穎琦"],
      ["u2", "陳姵安"],
      ["u3", "葉乃菱"],
      ["u4", "徐珮芯"],
      ["u5", "梁蕙雯"],
      ["u6", "鍾佩君"],
      ["u7", "排班人員"],
      ["u8", "陳右婷"],
    ].map(([id, name]) => ({
      id,
      name,
      isActive: true,
      location: "大直",
    }));
    const shifts = [
      ["u1", "問診,CIS"],
      ["u2", "輔控,抽１,CIS"],
      ["u3", "抽2,CIS"],
      ["u4", "基礎Ａ"],
      ["u5", "晚班,基礎B"],
      ["u6", "主控"],
      ["u7", "排班"],
      ["u8", "基礎B"],
    ].map(([userId, task], index) => ({
      id: String(index),
      userId,
      date: "2026-09-07",
      station: "08:00-16:00 H",
      task,
    }));

    expect(
      formatPhysicianDazhiLineStaffBlock("2026-09-08", shifts, staff),
    ).toBe(
      [
        "9/8 （二） 點位分配",
        "問診：葉穎琦",
        "抽１：陳姵安(輔控)",
        "抽２：葉乃菱(若抽血有空，協助問診第一順位)",
        "基礎A (眼科＋鼻咽鏡)：徐珮芯(若基礎有空，協助問診第二順位)",
        "基礎Ｂ(聽肺、ABI、HRV)：梁蕙雯、陳右婷",
        "主控：鍾佩君",
        "排班：排班人員",
      ].join("\n"),
    );
  });

  it("does not include a same-day Beitou assignment", () => {
    expect(
      formatPhysicianDazhiLineStaffBlock(
        "2026-09-08",
        [
          {
            id: "s1",
            userId: "u1",
            date: "2026-09-07",
            station: "",
            task: "主控",
          },
        ],
        [
          {
            id: "u1",
            name: "北投人員",
            isActive: true,
            location: "北投",
          },
        ],
      ),
    ).toContain("主控：\n");
  });
});
