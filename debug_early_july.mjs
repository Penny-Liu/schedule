import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('radiographer_daily_workload')
    .select('radiographer_name, date, total')
    .in('date', ['2026-07-01', '2026-07-02', '2026-07-03']);
  console.log("Found records:", data?.length);
  if (data) {
    const ting = data.filter(d => d.radiographer_name.includes('庭') || d.radiographer_name.includes('詹'));
    console.log("Records for Ting:", ting);
  }
}
run();
