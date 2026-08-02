import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('*');
  const matchingUsers = users.filter(u => u.name.includes('詹') || u.name.includes('庭'));
  console.log('Matching Users:', matchingUsers.map(u => u.name));
  
  const { data: settings } = await supabase.from('settings').select('*');
  const allCycles = settings[0]?.radiographer_cycles || [];
  console.log('All Cycles:', allCycles.map(c => c.name));
}
run();
