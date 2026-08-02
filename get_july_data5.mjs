import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: users } = await supabase.from('users').select('*');
  const tingYu = users.find(u => u.name.includes('詹庭'));
  if (tingYu) {
    const { data: dailyStats, error: dErr } = await supabase.from('radiographer_daily_workload')
      .select('*')
      .limit(1);
    console.log(JSON.stringify({dErr, dailyStats}, null, 2));
  }
}
run();
