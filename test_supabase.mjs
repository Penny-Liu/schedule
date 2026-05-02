import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://sfeyvjeiqgvnketbcujm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_LubB60pKdYRP_pU-Bpoc-g_3OyY59Oo";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('radiographer_workload').select('*').limit(1);
  console.log("Data:", data);
  console.log("Error:", error);
}
test();
