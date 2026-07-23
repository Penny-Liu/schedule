import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function getTomorrowWorkload() {
  try {
    const session = await getSalesforceSession();
    const today = new Date();
    today.setDate(today.getDate() + 1); // Tomorrow
    const targetDate = today.toISOString().split('T')[0];
    
    console.log(`✅ 登入 Salesforce 成功，正在查詢 ${targetDate} 的工作量...`);

    const soql = `
      SELECT Order__c, Order__r.Gender__c, Location__c, ResourceCategory__c, CheckupName__c
      FROM CheckupReservation__c 
      WHERE Order__r.ReserveDate__c = ${targetDate}
      AND Checkup_Status__c != '90'
      AND ResourceCategory__c IN ('MR','US','CT','BMD','DX','MG')
      AND Location__c != null
    `;

    const data = await runSoqlQuery({ ...session, soql });
    
    const stats = {
      "北投": { mrOrders: {}, usOrders: new Set(), ctOrders: new Set(), bmdOrders: new Set(), dxOrders: new Set(), mgOrders: new Set(), usCheckups: 0, usHeart: 0, cta: 0 },
      "大直": { usOrders: new Set(), bmdOrders: new Set(), dxOrders: new Set(), mgOrders: new Set(), usCheckups: 0, usHeart: 0 }
    };

    (data.records || []).forEach((rec) => {
      const locRaw = rec.Location__c || "";
      const loc = locRaw.startsWith("北投") ? "北投" : locRaw.startsWith("大直") ? "大直" : null;
      if (!loc) return;
      
      const category = rec.ResourceCategory__c;
      const orderId = rec.Order__c;
      if (!orderId) return;

      if (category === "MR" && loc === "北投") {
        if (!stats[loc].mrOrders[orderId]) {
            stats[loc].mrOrders[orderId] = { count: 0, gender: rec.Order__r?.Gender__c || "" };
        }
        stats[loc].mrOrders[orderId].count++;
      } else if (category === "US") {
        stats[loc].usOrders.add(orderId);
        stats[loc].usCheckups++;
        const checkupName = rec.CheckupName__c || "";
        if (checkupName.includes("心臟") || checkupName.includes("心超") || checkupName.toLowerCase().includes("heart")) {
            stats[loc].usHeart++;
        }
      } else if (category === "CT" && loc === "北投") {
        stats[loc].ctOrders.add(orderId);
        const checkupName = rec.CheckupName__c || "";
        if (checkupName.toLowerCase().includes("cta")) {
            stats[loc].cta++;
        }
      } else if (category === "BMD") {
        stats[loc].bmdOrders.add(orderId);
      } else if (category === "DX") {
        stats[loc].dxOrders.add(orderId);
      } else if (category === "MG") {
        stats[loc].mgOrders.add(orderId);
      }
    });

    let mrMaleLarge = 0, mrFemaleLarge = 0, mrMedium = 0, mrSmall = 0;
    Object.values(stats["北投"].mrOrders).forEach(mr => {
        if (mr.count >= 7) {
            if (mr.gender === "女" || mr.gender === "F") mrFemaleLarge++;
            else mrMaleLarge++;
        } else if (mr.count >= 4) {
            mrMedium++;
        } else {
            mrSmall++;
        }
    });

    const totalMr = Object.keys(stats["北投"].mrOrders).length;

    console.log(`\n📅 日期: ${targetDate}`);
    console.log(`\n【北投客戶數】`);
    console.log(`MR數量：${totalMr} 客戶；男大套：${mrMaleLarge}，女大套：${mrFemaleLarge}，中套：${mrMedium}，小套：${mrSmall}`);
    console.log(`US：${stats["北投"].usOrders.size} 客戶；醫令數：${stats["北投"].usCheckups}，心超數：${stats["北投"].usHeart}`);
    console.log(`CT：${stats["北投"].ctOrders.size} 客戶；CTA：${stats["北投"].cta}`);
    console.log(`BMD：${stats["北投"].bmdOrders.size} 客戶`);
    console.log(`DX：${stats["北投"].dxOrders.size} 客戶`);
    console.log(`MG：${stats["北投"].mgOrders.size} 客戶`);

    console.log(`\n【大直客戶數】`);
    console.log(`大直US：${stats["大直"].usOrders.size} 客戶；醫令數：${stats["大直"].usCheckups}，心超數：${stats["大直"].usHeart}`);
    console.log(`BMD：${stats["大直"].bmdOrders.size} 客戶`);
    console.log(`DX：${stats["大直"].dxOrders.size} 客戶`);
    console.log(`MG：${stats["大直"].mgOrders.size} 客戶`);

  } catch (error) {
    console.error("執行失敗:", error);
  }
}

getTomorrowWorkload();
