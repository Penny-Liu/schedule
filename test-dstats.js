import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1];
const SUPABASE_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data: settingsRow } = await supabase.from('settings').select('data').limit(1).single();
  const dStats = settingsRow?.data?.dailyStats?.['2026-06-05'];
  
  if (dStats && typeof dStats.total_weighted_orders === "number") {
    const pct = (settingsRow?.data?.radiographerWorkloadWeights?.floorControlPercentage ?? 12) / 100;
    const score = Math.round(dStats.total_weighted_orders * pct);
    console.log(`Found dailyStats for today! total_weighted_orders: ${dStats.total_weighted_orders}`);
    console.log(`pct: ${pct}`);
    console.log(`Expected floorControl units today: ${score}`);
  } else {
    console.log("No dailyStats for today. Fallback to fixed 30 units.");
  }
}
test();
