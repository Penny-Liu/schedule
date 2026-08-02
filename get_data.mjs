import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('*');
  const tingYu = users.find(u => u.name.includes('庭') || u.name.includes('詹'));
  console.log('User:', tingYu?.name);
  
  const { data: cycles } = await supabase.from('settings').select('*');
  const allCycles = cycles[0]?.radiographer_cycles || [];
  const cycle7 = allCycles.find(c => c.name === '2026/07');
  console.log('Cycle 7:', cycle7);
  
  if (tingYu && cycle7) {
    const { data: shifts } = await supabase.from('shifts')
      .select('*')
      .eq('user_id', tingYu.id)
      .gte('date', cycle7.startDate)
      .lte('date', cycle7.endDate);
      
    const { data: dailyStats } = await supabase.from('daily_workload_details')
      .select('*')
      .gte('date', cycle7.startDate)
      .lte('date', cycle7.endDate);
      
    console.log('Shifts count:', shifts.length);
    console.log('Daily stats count:', dailyStats.length);
    
    // Output a few shifts
    shifts.sort((a,b)=>a.date.localeCompare(b.date)).forEach(s => {
      console.log(`${s.date}: ${s.station}`);
    });
  }
}
run();
