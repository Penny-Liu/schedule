import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function main() {
  const { data, error } = await supabase.from('radiographer_daily_workload')
                                        .select('date, radiographer_name, total')
                                        .gte('date', '2026-06-19')
                                        .order('date', { ascending: true });
  console.log(data);
}
main();
