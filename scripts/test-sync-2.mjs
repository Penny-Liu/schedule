import "dotenv/config";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const startDate = '2026-06-01';
const endDate = '2026-06-30';

async function main() {
  const session = await getSalesforceSession();
  const ctDxSoql = `SELECT Radiologist__r.Name person, ResourceCategory__c category, CheckupName__c checkupName, COUNT(Id) cnt 
                    FROM CheckupReservation__c 
                    WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                    AND Radiologist__c != null 
                    AND ResourceCategory__c IN ('CT','BMD','MG','DX') 
                    AND (NOT Name LIKE '%報到%') 
                    AND Checkup_Status__c = '10'
                    GROUP BY Radiologist__r.Name, ResourceCategory__c, CheckupName__c`;
  const res = await runSoqlQuery({ ...session, soql: ctDxSoql });
  console.log("ctDxSoql returned:", res.records.length, "records");
}
main();
