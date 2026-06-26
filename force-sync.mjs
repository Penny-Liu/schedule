import { syncRadiographerWorkload } from './scripts/sync-all-to-supabase.mjs';
import dotenv from 'dotenv';
dotenv.config();

const authParams = new URLSearchParams({
  grant_type: 'password',
  client_id: process.env.SALESFORCE_CLIENT_ID,
  client_secret: process.env.SALESFORCE_CLIENT_SECRET,
  username: process.env.SALESFORCE_USERNAME,
  password: process.env.SALESFORCE_PASSWORD
});

async function loginAndSync() {
  const loginUrl = `${process.env.SALESFORCE_LOGIN_BASE_URL}/services/oauth2/token`;
  const res = await fetch(loginUrl, { method: 'POST', body: authParams });
  const data = await res.json();
  if (!data.access_token) {
    console.error("Login failed!", data);
    return;
  }
  await syncRadiographerWorkload({ accessToken: data.access_token }, '2026-06-06', '2026-07-05', '2026-06-01', '2026-06-30');
  console.log("Done");
}
loginAndSync();
