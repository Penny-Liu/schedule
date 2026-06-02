import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function main() {
  const session = await getSalesforceSession();
  const query = `
    SELECT Id, Order__c, MedicalRecordNo__c, CheckupName__c, Location__c
    FROM CheckupReservation__c
    WHERE CheckStartDate__c = 2026-06-03 AND Location__c = '大直'
  `;
  const result = await runSoqlQuery({
    accessToken: session.accessToken,
    instanceUrl: session.instanceUrl,
    soql: query
  });
  const records = result.records || [];
  const targetRecords = records.filter(r => r.CheckupName__c && (r.CheckupName__c.includes('解說') || r.CheckupName__c.includes('總評')));
  
  const uniqueClients = new Set();
  const clientDetails = {};

  targetRecords.forEach(r => {
    const clientId = r.MedicalRecordNo__c || r.Order__c;
    uniqueClients.add(clientId);
    if (!clientDetails[clientId]) clientDetails[clientId] = new Set();
    clientDetails[clientId].add(r.CheckupName__c);
  });

  console.log("Unique Dazhi Clients on 6/3:", uniqueClients.size);
  Array.from(uniqueClients).forEach(cId => {
    console.log(`Client ${cId}: ${Array.from(clientDetails[cId]).join(', ')}`);
  });
}
main();
