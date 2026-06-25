import "dotenv/config";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Mock Supabase
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const startDate = '2026-06-20';
const endDate = '2026-06-30';

// We just copy the logic to see what dates are produced
async function main() {
  const session = await getSalesforceSession();
  
  const ctDxSoql = `SELECT Radiologist__r.Name person, ResourceCategory__c category, Order__r.ReserveDate__c date
                    FROM CheckupReservation__c 
                    WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                    AND Radiologist__c != null 
                    AND ResourceCategory__c IN ('CT','BMD','MG','DX') 
                    AND (NOT Name LIKE '%報到%') 
                    AND Checkup_Status__c = '10'`;
                    
  const ctDxData = await runSoqlQuery({ ...session, soql: ctDxSoql });
  const dates = new Set();
  ctDxData.records.forEach(rec => {
    if (rec.date || rec.Order__r?.ReserveDate__c) {
      dates.add((rec.date || rec.Order__r?.ReserveDate__c).split("T")[0]);
    }
  });
  console.log("ctDx dates:", Array.from(dates));
}
main();
