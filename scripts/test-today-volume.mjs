import "dotenv/config";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function getStatsForDate(session, dateStr) {
  const soql = `
    SELECT 
      Image_assignment__r.Name, 
      Order__r.Image_assignment__r.Name,
      Order__c,
      MedicalRecordNo__c,
      Image_Report__c, 
      ResourceCategory__c, 
      CheckupName__c,
      CheckStartDate__c,
      Location__c,
      CTAUseTime__c
    FROM CheckupReservation__c 
    WHERE CheckStartDate__c = ${dateStr}
      AND Checkup_Status__c = '10'
      AND (Location__c LIKE '北投%' OR Location__c LIKE '大直%')
  `.trim();

  const result = await runSoqlQuery({ ...session, soql });
  
  let stats = {
    mr: 0,
    ct: 0,
    dx: 0,
    mg: 0,
    us: 0,
    cta: 0,
    bmd: 0
  };

  result.records.forEach((r) => {
    const name = r.CheckupName__c || "";
    const loc = r.Location__c || "";
    
    if (name.includes("磁振造影") || name.includes("MR")) {
      stats.mr++;
    } else if (name.includes("電腦斷層")) {
      if (name.includes("顯影") || name.includes("CTA") || r.CTAUseTime__c) {
        stats.cta++;
      } else {
        stats.ct++;
      }
    } else if (name.includes("X光") || name.includes("DX") || name.includes("數位攝影")) {
      stats.dx++;
    } else if (name.includes("乳房攝影") || name.includes("MG")) {
      stats.mg++;
    } else if (name.includes("骨質密度") || name.includes("BMD")) {
      stats.bmd++;
    } else if (name.includes("超音波") || name.includes("US")) {
      stats.us++;
    }
  });

  // Calculate weighted total where CTA counts as 3
  const weightedTotal = stats.mr + stats.ct + stats.dx + stats.mg + stats.us + (stats.cta * 3) + stats.bmd;
  const twelvePercent = Math.round(weightedTotal * 0.12);

  console.log(`\n=== ${dateStr} ===`);
  console.log(`各項統計:`, stats);
  console.log(`總醫令量 (CTA 算 3 份): ${weightedTotal}`);
  console.log(`場控加權估算 (12%): ${twelvePercent}`);
}

async function main() {
  const session = await getSalesforceSession();
  await getStatsForDate(session, "2026-06-02");
  await getStatsForDate(session, "2026-06-03");
}

main().catch(console.error);
