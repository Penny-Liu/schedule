import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  // First insert a dummy record
  await supabase.from('radiographer_daily_workload').upsert({
    date: '2020-01-01',
    radiographer_name: 'TestUser',
    mr: 10,
    us: 5,
    ct: 2
  }, { onConflict: "date,radiographer_name" });
  
  // Now upsert only mr
  await supabase.from('radiographer_daily_workload').upsert({
    date: '2020-01-01',
    radiographer_name: 'TestUser',
    mr: 20
  }, { onConflict: "date,radiographer_name" });
  
  // Fetch to check if us and ct were preserved
  const { data } = await supabase.from('radiographer_daily_workload')
    .select('mr, us, ct')
    .eq('date', '2020-01-01')
    .eq('radiographer_name', 'TestUser');
    
  console.log("After upserting only mr:", data);
  
  // Clean up
  await supabase.from('radiographer_daily_workload')
    .delete()
    .eq('date', '2020-01-01')
    .eq('radiographer_name', 'TestUser');
}
run();
