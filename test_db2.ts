import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('radiographer_workload').select('radiographerName, date, us_cca, us_neck').eq('date', '2026-06').limit(5);
  console.log(data);
}
test();
