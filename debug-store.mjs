import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const [usersRes, settingsRes] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("settings").select("*"),
  ]);
  if(usersRes.error) console.error("Users Error:", usersRes.error);
  else console.log("Users:", usersRes.data.length);
  if(settingsRes.error) console.error("Settings Error:", settingsRes.error);
  else console.log("Settings:", settingsRes.data.length);
}
run();
