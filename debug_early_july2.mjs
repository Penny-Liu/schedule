import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('radiographer_daily_workload')
    .select('radiographer_name, date')
    .in('date', ['2026-07-02', '2026-07-03']);
  console.log("Records on 7/2 and 7/3:", data?.length);
  if (data && data.length > 0) {
    console.log("Sample names:", [...new Set(data.map(d => d.radiographer_name))].slice(0, 5));
  }
}
run();
