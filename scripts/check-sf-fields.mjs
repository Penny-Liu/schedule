import { getSalesforceSession } from "./salesforce-utils.mjs";

async function run() {
  try {
    const session = await getSalesforceSession();
    const url = `${session.instanceUrl}/services/data/v58.0/sobjects/Order__c/describe`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      }
    });
    
    if (!response.ok) {
      console.error("Failed to describe Order__c:", response.status, await response.text());
      return;
    }
    
    const data = await response.json();
    console.log("Fields in Order__c related to date/time:");
    data.fields.forEach(f => {
      if (f.type === "date" || f.type === "datetime" || f.name.toLowerCase().includes("date") || f.name.toLowerCase().includes("time")) {
        console.log(`- ${f.name} (${f.type}): ${f.label}`);
      }
    });
  } catch(e) {
    console.error(e);
  }
}

run();
