import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function getSalesforceSession() {
  const url = `${process.env.SALESFORCE_LOGIN_BASE_URL}/services/oauth2/token`;
  const params = new URLSearchParams();
  params.append("grant_type", "password");
  params.append("client_id", process.env.SALESFORCE_CLIENT_ID);
  params.append("client_secret", process.env.SALESFORCE_CLIENT_SECRET);
  params.append("username", process.env.SALESFORCE_USERNAME);
  params.append("password", process.env.SALESFORCE_PASSWORD);
  const response = await fetch(url, { method: "POST", body: params });
  if (!response.ok) {
    const text = await response.text();
    console.error("Login failed response:", text);
    throw new Error("SF login failed");
  }
  return response.json();
}

async function runSoqlQuery({ instanceUrl, accessToken, soql }) {
  const url = `${instanceUrl}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("SOQL failed");
  return response.json();
}

async function main() {
  try {
    const session = await getSalesforceSession();
    const soql = `
      SELECT ReserveDate__c date, Image_Proofreader__r.Name person, COUNT(Id) cnt 
      FROM Order__c 
      WHERE ReserveDate__c >= 2026-06-25 AND ReserveDate__c <= 2026-08-10 
      AND Image_Proofreader__c != null 
      AND Image_Proofreader__r.Name LIKE '%詹庭%'
      GROUP BY ReserveDate__c, Image_Proofreader__r.Name
    `;
    console.log("Running SOQL:", soql);
    const data = await runSoqlQuery({
      instanceUrl: session.instance_url,
      accessToken: session.access_token,
      soql,
    });
    console.log(JSON.stringify(data.records, null, 2));
  } catch (err) {
    console.error(err);
  }
}
main();
