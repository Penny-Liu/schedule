import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: settings } = await supabase.from('settings').select('*');
  const data = settings[0].data;
  const cycles = data.radiographerCycles || data.radiographer_cycles || [];
  console.log("Cycles:", cycles);
  
  const cycle7 = cycles.find(c => c.name === '2026/07');
  console.log("Cycle 7:", cycle7);
  
  if (cycle7) {
    const { data: users } = await supabase.from('users').select('*');
    const tingYu = users.find(u => u.name.includes('詹庭'));
    
    const { data: shifts } = await supabase.from('shifts')
      .select('*')
      .eq('user_id', tingYu.id)
      .gte('date', cycle7.startDate)
      .lte('date', cycle7.endDate);
      
    // I need daily workload details. In supabase it might be daily_workload_details
    const { data: dailyStats } = await supabase.from('daily_workload_details')
      .select('*')
      .gte('date', cycle7.startDate)
      .lte('date', cycle7.endDate);
      
    console.log(JSON.stringify({tingYu: tingYu.name, shifts, dailyStats}, null, 2));
  }
}
run();
