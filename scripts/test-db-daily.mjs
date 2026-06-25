import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function main() {
  const { data, error } = await supabase.from('radiographer_daily_workload')
                                        .select('date')
                                        .gte('date', '2026-06-06')
                                        .order('date', { ascending: false })
                                        .limit(5);
  console.log(data);
}
main();
