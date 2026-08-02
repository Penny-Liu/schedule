import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: settings } = await supabase.from('settings').select('*');
  const dStats = settings[0].data.dailyStats || {};
  
  // dailyStats keys are like "2026-07-01", etc.
  // We want to see the daily stats for dates where tingYu had a shift
  const julyStats = Object.keys(dStats)
    .filter(k => k.startsWith('2026-07'))
    .reduce((acc, k) => { acc[k] = dStats[k]; return acc; }, {});
    
  console.log("July dailyStats sample:", JSON.stringify(Object.values(julyStats).slice(0, 1), null, 2));
}
run();
