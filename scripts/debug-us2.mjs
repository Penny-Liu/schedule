import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
async function run() {
  const session = await getSalesforceSession();
  const soql = `SELECT CheckupName__c, COUNT(Id) cnt FROM CheckupReservation__c WHERE ResourceCategory__c = 'US' GROUP BY CheckupName__c ORDER BY COUNT(Id) DESC LIMIT 20`;
  const result = await runSoqlQuery(soql, session);
  console.log(result.records);
}
run();
