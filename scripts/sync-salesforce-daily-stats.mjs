import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'salesforce-daily-stats.config.json');

function getTargetDate() {
  const argDate = process.argv[2];
  if (argDate) return argDate;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readConfig() {
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    throw new Error(`找不到設定檔 ${DEFAULT_CONFIG_PATH}，請先複製 salesforce-daily-stats.config.example.json`);
  }

  const raw = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);

  if (!config.objectApiName || !config.dateField || !config.fieldMap) {
    throw new Error('設定檔缺少 objectApiName / dateField / fieldMap');
  }

  return config;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

async function fetchSalesforceStats(targetDate, config) {
  const session = await getSalesforceSession();
  const fieldNames = [config.dateField, ...Object.values(config.fieldMap)];
  const soql = `SELECT ${fieldNames.join(', ')} FROM ${config.objectApiName} WHERE ${config.dateField} = '${targetDate}' LIMIT 1`;

  console.log(`SOQL: ${soql}`);
  const result = await runSoqlQuery({ ...session, soql });

  if (!result.records || result.records.length === 0) {
    throw new Error(`Salesforce 查無 ${targetDate} 的資料`);
  }

  const record = result.records[0];
  const mapped = {};

  for (const [appField, salesforceField] of Object.entries(config.fieldMap)) {
    mapped[appField] = toNumber(record[salesforceField]);
  }

  return mapped;
}

async function saveDailyStats(targetDate, mappedStats) {
  const supabase = getSupabaseAdmin();
  const { data: settingsRow, error: fetchError } = await supabase
    .from('settings')
    .select('id, data')
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const settingsId = settingsRow?.id || 1;
  const settingsData = settingsRow?.data || {};
  const dailyStats = settingsData.dailyStats || {};
  const previous = dailyStats[targetDate] || {};

  settingsData.dailyStats = {
    ...dailyStats,
    [targetDate]: {
      ...previous,
      ...mappedStats,
    },
  };

  const { error: upsertError } = await supabase
    .from('settings')
    .upsert({ id: settingsId, data: settingsData });

  if (upsertError) throw upsertError;
}

async function main() {
  const targetDate = getTargetDate();
  const config = readConfig();

  console.log(`開始同步 ${targetDate} 的 Salesforce daily stats...`);
  const mappedStats = await fetchSalesforceStats(targetDate, config);
  console.log('Salesforce -> App 欄位對應結果:');
  console.log(JSON.stringify(mappedStats, null, 2));

  await saveDailyStats(targetDate, mappedStats);
  console.log(`✅ 已寫入 settings.data.dailyStats.${targetDate}`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
