import "dotenv/config";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function main() {
  const session = await getSalesforceSession();
  const soql = `SELECT Radiologist__r.Name, ResourceCategory__c, CheckupName__c, Order__r.ReserveDate__c, CheckStartDate__c, Checkup_Status__c 
                FROM CheckupReservation__c 
                WHERE Order__r.ReserveDate__c >= 2026-06-20 
                AND Order__r.ReserveDate__c <= 2026-06-26 
                AND Radiologist__c != null 
                AND ResourceCategory__c IN ('CT','US','BMD','MG','DX','MR') 
                AND (NOT Name LIKE '%報到%') 
                AND Checkup_Status__c = '10' 
                LIMIT 50`;
  const result = await runSoqlQuery({ ...session, soql });
  console.log("Found:", result.records.length, result.records);
}
main().catch(console.error);
