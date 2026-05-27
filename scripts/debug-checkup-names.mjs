import "dotenv/config";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function main() {
  const session = await getSalesforceSession();
  console.log("✅ Salesforce 認證成功\n");

  const today = new Date();
  const past = new Date(today);
  past.setDate(past.getDate() - 30);
  const startDate = past.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  // 抓 MR 醫令，帶 Order__c、Radiologist、Gender
  const soql = `SELECT Radiologist__r.Name, Order__c, Order__r.Gender__c
                FROM CheckupReservation__c
                WHERE Order__r.ReserveDate__c >= ${startDate}
                  AND Order__r.ReserveDate__c <= ${endDate}
                  AND ResourceCategory__c = 'MR'
                  AND Checkup_Status__c = '10'
                  AND (NOT Name LIKE '%報到%')
                  AND Radiologist__c != null`;

  console.log(`📋 查詢最近 30 天 MR 醫令（帶 Order 數量與性別）...\n`);

  const result = await runSoqlQuery({ ...session, soql });
  const records = result.records || [];
  console.log(`找到 ${records.length} 筆 MR 醫令\n`);

  // === 確認 Gender 欄位的實際值 ===
  const genderValues = new Set();
  records.forEach((r) => genderValues.add(r.Order__r?.Gender__c));
  console.log("Gender__c 的值集合:", [...genderValues], "\n");

  // === 以 Order__c 分組，計算每張 order 的 MR 醫令數 ===
  const orderMap = {}; // orderId -> { count, gender, radiologists: Set }
  records.forEach((r) => {
    const orderId = r.Order__c;
    const gender = r.Order__r?.Gender__c || "";
    const radiologist = r.Radiologist__r?.Name;
    if (!orderId) return;
    if (!orderMap[orderId]) {
      orderMap[orderId] = { count: 0, gender, radiologists: new Set() };
    }
    orderMap[orderId].count++;
    if (radiologist) orderMap[orderId].radiologists.add(radiologist);
  });

  // === 依照規則分類 ===
  const classifyCounts = { mrLargeMale: 0, mrLargeFemale: 0, mrMedium: 0, mrSmall: 0 };
  const perOrder = Object.entries(orderMap).slice(0, 20); // 只印前20筆

  console.log("=== 前 20 張 Order 分類預覽 ===");
  perOrder.forEach(([orderId, { count, gender, radiologists }]) => {
    let category;
    if (count >= 7) {
      category = gender === "F" || gender === "女" ? "mrLargeFemale" : "mrLargeMale";
    } else if (count >= 4) {
      category = "mrMedium";
    } else {
      category = "mrSmall";
    }
    classifyCounts[category]++;
    console.log(
      `  Order ${orderId.slice(-6)} | MR醫令數=${count} | 性別=${gender} | 分類=${category} | 放射師=${[...radiologists].join(",")}`
    );
  });

  console.log("\n=== 全體統計 ===");
  Object.values(orderMap).forEach(({ count, gender }) => {
    let category;
    if (count >= 7) {
      category = gender === "F" || gender === "女" ? "mrLargeFemale" : "mrLargeMale";
    } else if (count >= 4) {
      category = "mrMedium";
    } else {
      category = "mrSmall";
    }
    classifyCounts[category]++;
  });
  // 扣掉前20筆重複計算
  Object.keys(classifyCounts).forEach((k) => (classifyCounts[k] -= perOrder.length > 0 ? Math.round(classifyCounts[k] * perOrder.length / Object.keys(orderMap).length) : 0));
  console.log("  MR大男:", classifyCounts.mrLargeMale);
  console.log("  MR大女:", classifyCounts.mrLargeFemale);
  console.log("  MR中  :", classifyCounts.mrMedium);
  console.log("  MR小  :", classifyCounts.mrSmall);
  console.log("  總 Order 數:", Object.keys(orderMap).length);
}

main().catch((err) => {
  console.error("❌ 失敗:", err.message);
  process.exit(1);
});
