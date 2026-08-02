import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: users } = await supabase.from('users').select('*');
  const tingYu = users.find(u => u.name.includes('詹庭'));
  if (tingYu) {
    const { data: shifts, error: sErr } = await supabase.from('shifts')
      .select('*')
      .eq('user_id', tingYu.id)
      .gte('date', '2026-07-01')
      .lte('date', '2026-07-31');
    const { data: dailyStats, error: dErr } = await supabase.from('daily_workload_details')
      .select('*')
      .eq('radiographer_name', tingYu.name)
      .gte('date', '2026-07-01')
      .lte('date', '2026-07-31');
    const { data: workloads, error: wErr } = await supabase.from('radiographer_workload')
      .select('*')
      .eq('radiographer_name', tingYu.name)
      .eq('date', '2026-07');
    console.log(JSON.stringify({
      shiftsErr: sErr, dailyStatsErr: dErr, workloadsErr: wErr,
      shifts: shifts, dailyStats: dailyStats, workloads
    }, null, 2));
  }
}
run();
