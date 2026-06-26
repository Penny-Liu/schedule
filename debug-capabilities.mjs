import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('users').select('name, learning_capabilities, capabilities');
  if (error) {
    console.error(error);
    return;
  }
  const nonArrayLC = data.filter(u => u.learning_capabilities && !Array.isArray(u.learning_capabilities));
  const nonArrayC = data.filter(u => u.capabilities && !Array.isArray(u.capabilities));
  console.log("Non-array learningCapabilities:", nonArrayLC);
  console.log("Non-array capabilities:", nonArrayC);
}
run();
