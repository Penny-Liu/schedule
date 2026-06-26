import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('users').update({ learning_capabilities: [] }).in('name', ['劉歡葶', '薛惠方', '陳盈穎', '甘慧雯', '賴鈺婷', '雷采霖']);
  if (error) {
    console.error(error);
    return;
  }
  console.log("Fixed learning_capabilities to array []");
}
run();
