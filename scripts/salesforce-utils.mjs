import "dotenv/config";

const DEFAULT_LOGIN_BASE = "https://login.salesforce.com";
const API_VERSION = "v59.0";

export function getSalesforceEnv() {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const username = process.env.SALESFORCE_USERNAME;
  const password = process.env.SALESFORCE_PASSWORD;
  let loginBase = (
    process.env.SALESFORCE_LOGIN_BASE_URL || DEFAULT_LOGIN_BASE
  ).replace(/\/$/, "");

  // 如果網址沒有包含 http:// 或 https://，自動補上 https://
  if (!loginBase.startsWith("http://") && !loginBase.startsWith("https://")) {
    loginBase = `https://${loginBase}`;
  }

  const missing = [
    ["SALESFORCE_CLIENT_ID", clientId],
    ["SALESFORCE_CLIENT_SECRET", clientSecret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`缺少必要環境變數: ${missing.join(", ")}`);
  }

  return {
    clientId,
    clientSecret,
    username,
    password,
    loginBase,
  };
}

export async function getSalesforceSession() {
  const { clientId, clientSecret, loginBase } = getSalesforceEnv();
  const loginUrl = `${loginBase}/services/oauth2/token`;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  const response = await fetch(loginUrl, {
    method: "POST",
    body: params,
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(
      data.error_description || data.error || "Salesforce 登入失敗",
    );
  }

  return {
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
    apiVersion: API_VERSION,
  };
}

export async function runSoqlQuery({
  instanceUrl,
  accessToken,
  apiVersion = API_VERSION,
  soql,
}) {
  const url = `${instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;

  let allRecords = [];
  let currentUrl = url;
  let done = false;

  while (!done) {
    const response = await fetch(currentUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.[0]?.message || data?.message || "SOQL 查詢失敗");
    }

    allRecords = allRecords.concat(data.records);
    done = data.done;
    if (!done) {
      currentUrl = `${instanceUrl}${data.nextRecordsUrl}`;
    }
  }

  return { records: allRecords, totalSize: allRecords.length };
}

export async function describeSObject({
  instanceUrl,
  accessToken,
  apiVersion = API_VERSION,
  objectApiName,
}) {
  const url = `${instanceUrl}/services/data/${apiVersion}/sobjects/${objectApiName}/describe`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.[0]?.message || data?.message || `Describe ${objectApiName} 失敗`,
    );
  }

  return data;
}

export async function listSObjects({
  instanceUrl,
  accessToken,
  apiVersion = API_VERSION,
}) {
  const url = `${instanceUrl}/services/data/${apiVersion}/sobjects/`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.[0]?.message || data?.message || "列出 Salesforce 物件失敗",
    );
  }

  return data.sobjects || [];
}
