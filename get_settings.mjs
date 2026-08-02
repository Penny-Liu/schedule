import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: settings } = await supabase.from('settings').select('*');
  console.log(Object.keys(settings[0]));
  console.log(settings[0].radiographer_cycles);
}
run();
