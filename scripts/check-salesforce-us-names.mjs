import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  const session = await getSalesforceSession();
  const soql = `
      SELECT CheckupName__c, Location__c
      FROM CheckupReservation__c 
      WHERE (Location__c = '北投' OR Location__c = '大直')
        AND CheckStartDate__c >= 2026-07-28
        AND CheckStartDate__c <= 2026-07-28
        AND Checkup_Status__c != '90'
        AND CheckupName__c LIKE '%超音波%'
  `.trim();

  const result = await runSoqlQuery({ ...session, soql });
  const names = new Set(result.records.map(r => r.CheckupName__c));
  
  console.log("Unique Ultrasound Names on 7/28:");
  for (const name of names) {
    console.log(`- ${name}`);
  }
}
main();
