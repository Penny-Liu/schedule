import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: users } = await supabase.from('users').select('*');
  const tingYu = users.find(u => u.name.includes('詹庭'));
  if (tingYu) {
    const { data: shifts } = await supabase.from('shifts')
      .select('*')
      .eq('userId', tingYu.id)
      .gte('date', '2026-07-01')
      .lte('date', '2026-07-31');
    const { data: workloads } = await supabase.from('radiographer_workload')
      .select('*')
      .eq('radiographerName', tingYu.name)
      .eq('date', '2026-07');
    console.log(JSON.stringify({ shifts, workloads }, null, 2));
  }
}
run();
