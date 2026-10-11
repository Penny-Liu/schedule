import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";

const CATEGORIES = ["MR", "CT", "US", "BMD", "DX", "MG"];
const LOCATIONS = ["北投", "大直"];

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(token.slice(2), next && !next.startsWith("--") ? next : true);
  if (next && !next.startsWith("--")) index += 1;
}

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;
const fromYear = Number(args.get("from-year") || currentYear);
const toYear = Number(args.get("to-year") || currentYear);
const force = args.get("force") === true;
const requestedLocation = args.get("location");
const locations = requestedLocation ? [String(requestedLocation)] : LOCATIONS;

if (fromYear > toYear || !locations.every((value) => LOCATIONS.includes(value))) {
  throw new Error("參數錯誤：年份區間或院區不正確。院區只能是北投或大直。");
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("設備人次同步需要 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pad = (value) => String(value).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const percentile = (values, ratio = 0.9) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
};

const buildMetric = (values) => ({
  average: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0,
  p90: percentile(values),
  peak: values.length ? Math.max(...values) : 0,
  activeDays: values.filter((value) => value > 0).length,
  values,
});

async function loadMonth(session, year, month, location) {
  const firstDay = `${year}-${pad(month)}-01`;
  const naturalEnd = new Date(year, month, 0);
  const end = year === currentYear && month === currentMonth && today < naturalEnd ? today : naturalEnd;
  const lastDay = dateKey(end);
  const soql = `
    SELECT CheckStartDate__c, ResourceCategory__c, Order__c, CheckupName__c
    FROM CheckupReservation__c
    WHERE Location__c = '${location}'
      AND CheckStartDate__c >= ${firstDay}
      AND CheckStartDate__c <= ${lastDay}
      AND ResourceCategory__c IN ('MR','CT','US','BMD','DX','MG')
      AND Checkup_Status__c = '10'
      AND End__c = true
      AND MedicalRecordNo__c != null
  `.trim();

  const { records } = await runSoqlQuery({ ...session, soql });
  const categoryVisits = Object.fromEntries(CATEGORIES.map((category) => [category, new Set()]));
  const clients = new Set();
  const dailyCategory = {};
  const dailyClients = {};

  for (const record of records) {
    if (String(record.CheckupName__c || "").includes("報到")) continue;
    const day = String(record.CheckStartDate__c || "").slice(0, 10);
    const category = String(record.ResourceCategory__c || "").trim().toUpperCase();
    const order = String(record.Order__c || "").trim();
    if (!day || !order || !CATEGORIES.includes(category)) continue;
    const visitKey = `${day}|${order}`;
    categoryVisits[category].add(visitKey);
    clients.add(visitKey);
    dailyCategory[day] ||= Object.fromEntries(CATEGORIES.map((item) => [item, new Set()]));
    dailyClients[day] ||= new Set();
    dailyCategory[day][category].add(order);
    dailyClients[day].add(order);
  }

  const daysInRange = end.getDate();
  const metrics = {};
  for (const category of CATEGORIES) {
    const values = Array.from({ length: daysInRange }, (_, index) => {
      const day = `${year}-${pad(month)}-${pad(index + 1)}`;
      return dailyCategory[day]?.[category]?.size || 0;
    }).filter((value) => value > 0);
    metrics[category] = buildMetric(values);
  }
  const totalValues = Array.from({ length: daysInRange }, (_, index) => {
    const day = `${year}-${pad(month)}-${pad(index + 1)}`;
    return dailyClients[day]?.size || 0;
  }).filter((value) => value > 0);
  metrics.TOTAL_CLIENTS = buildMetric(totalValues);

  return {
    year,
    month,
    location,
    mr_count: categoryVisits.MR.size,
    ct_count: categoryVisits.CT.size,
    us_count: categoryVisits.US.size,
    bmd_count: categoryVisits.BMD.size,
    dx_count: categoryVisits.DX.size,
    mg_count: categoryVisits.MG.size,
    total_clients: clients.size,
    active_days: Object.keys(dailyClients).length,
    demand_metrics: metrics,
    source_start_date: firstDay,
    source_end_date: lastDay,
    is_finalized: year < currentYear || (year === currentYear && month < currentMonth),
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const session = await getSalesforceSession();
  const { data: existingRows, error: existingError } = await supabase
    .from("equipment_visit_monthly")
    .select("year,month,location,is_finalized")
    .gte("year", fromYear)
    .lte("year", toYear);
  if (existingError) throw existingError;
  const existing = new Map(existingRows.map((row) => [`${row.year}-${row.month}-${row.location}`, row]));

  let written = 0;
  let skipped = 0;
  for (let year = fromYear; year <= toYear; year += 1) {
    const lastMonth = year === currentYear ? currentMonth : 12;
    if (year > currentYear) continue;
    for (let month = 1; month <= lastMonth; month += 1) {
      for (const location of locations) {
        const key = `${year}-${month}-${location}`;
        if (!force && existing.get(key)?.is_finalized) {
          skipped += 1;
          continue;
        }
        console.log(`[equipment-visits] ${location} ${year}/${pad(month)}...`);
        const row = await loadMonth(session, year, month, location);
        const { error } = await supabase
          .from("equipment_visit_monthly")
          .upsert(row, { onConflict: "year,month,location" });
        if (error) throw error;
        written += 1;
      }
    }
  }
  console.log(`[equipment-visits] 完成：寫入 ${written} 筆，略過已結算 ${skipped} 筆。`);
}

main().catch((error) => {
  console.error("[equipment-visits] 同步失敗：", error?.message || error);
  process.exitCode = 1;
});
