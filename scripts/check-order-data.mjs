import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

async function run() {
  try {
    const session = await getSalesforceSession();
    const soql = `SELECT Id, Image_Proofreader__r.Name, Image_Assistant__r.Name, Image_Report_FinishDate__c, ReportInterpret_Date__c, ReportUIDesigner_Date__c
                  FROM Order__c 
                  WHERE Image_Proofreader__c != null OR Image_Assistant__c != null
                  LIMIT 5`;
    const result = await runSoqlQuery({
      instanceUrl: session.instanceUrl,
      accessToken: session.accessToken,
      soql
    });
    
    console.log(JSON.stringify(result.records, null, 2));
  } catch(e) {
    console.error(e);
  }
}

run();
