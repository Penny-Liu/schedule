import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "YOUR_URL";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "YOUR_KEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('radiographer_workload').select('*').limit(1);
  console.log("Data:", data);
  console.log("Error:", error);
}
test();
