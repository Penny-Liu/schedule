import { config } from 'dotenv';
config({ path: '.env' });
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function run() {
  const session = await getSalesforceSession();
  const soql = `SELECT CheckupName__c, COUNT(Id) cnt FROM CheckupReservation__c WHERE ResourceCategory__c = 'US' AND (CheckupName__c LIKE '%cca%' OR CheckupName__c LIKE '%neck%' OR CheckupName__c LIKE '%頸%') GROUP BY CheckupName__c ORDER BY COUNT(Id) DESC`;
  const result = await runSoqlQuery(soql, session);
  console.log(result.records);
}
run();
