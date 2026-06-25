import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function main() {
  const { data } = await supabase.from('billing_cycles').select('*').in('name', ['2026/06', '2026/07']).order('name');
  console.log("Cycles:", data);
}
main();
