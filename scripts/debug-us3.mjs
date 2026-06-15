import { getSalesforceEnv, getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
import 'dotenv/config';

async function run() {
  console.log("LOGIN BASE: ", process.env.SALESFORCE_LOGIN_BASE_URL);
  const session = await getSalesforceSession();
  const soql = `SELECT CheckupName__c, COUNT(Id) cnt FROM CheckupReservation__c WHERE ResourceCategory__c = 'US' GROUP BY CheckupName__c ORDER BY COUNT(Id) DESC LIMIT 20`;
  const result = await runSoqlQuery(soql, session);
  console.log(result.records);
}
run();
