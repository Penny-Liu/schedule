import { runSoqlQuery } from "./salesforce-utils.mjs";

async function main() {
  const query = `
    SELECT Id, Order__c, MedicalRecordNo__c, CheckupName__c, Location__c
    FROM CheckupProcess__c
    WHERE CheckStartDate__c = '2026-06-03' AND Location__c = '大直'
  `;
  const result = await runSoqlQuery({ query });
  const records = result.records || [];
  const giRecords = records.filter(r => r.CheckupName__c && (r.CheckupName__c.includes('腸鏡') || r.CheckupName__c.includes('胃鏡') || r.CheckupName__c.includes('內視鏡')));
  console.log("Found GI-like records for Dazhi on 6/3:", giRecords.length);
  giRecords.forEach(r => {
    console.log(`Order: ${r.Order__c}, MedRec: ${r.MedicalRecordNo__c}, Name: ${r.CheckupName__c}`);
  });
}
main();
