import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('users').select('*');
  const ting = data.find(u => u.name.includes('庭') || u.name.includes('詹'));
  console.log("Found users matching 庭 or 詹:");
  data.filter(u => u.name.includes('庭') || u.name.includes('詹')).forEach(u => console.log(u.name, u.id));
}
run();
