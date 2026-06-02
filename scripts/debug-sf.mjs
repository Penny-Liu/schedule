import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function main() {
  const session = await getSalesforceSession();
  const soql = `SELECT Radiologist__r.Name, ResourceCategory__c, Order__r.ReserveDate__c 
                FROM CheckupReservation__c 
                WHERE Order__r.ReserveDate__c = 2026-05-20 
                AND Radiologist__r.Name = '張詠晴' 
                AND ResourceCategory__c = 'CT' 
                AND Checkup_Status__c = '10'`;
  const data = await runSoqlQuery({ instanceUrl: session.instanceUrl, accessToken: session.accessToken, soql });
  console.log("CT/DX Query returned:", JSON.stringify(data.records, null, 2));
}
main();
