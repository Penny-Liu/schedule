import "dotenv/config";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function main() {
  const session = await getSalesforceSession();
  const soql = `SELECT CheckupName__c, Order__r.ReserveDate__c, CheckStartDate__c, Checkup_Status__c 
                FROM CheckupReservation__c 
                WHERE Order__r.ReserveDate__c >= 2026-06-21 
                AND Order__r.ReserveDate__c <= 2026-06-26 
                LIMIT 5`;
  const result = await runSoqlQuery({ ...session, soql });
  console.log("Found:", result.records.length, result.records);
}
main().catch(console.error);
