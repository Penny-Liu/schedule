import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function main() {
  const { data } = await supabase.from("radiographer_workload")
    .select("radiographerName, ct, ct_teaching")
    .eq("year", 2026)
    .eq("month", 5)
    .in("radiographerName", ["張庭榕", "張詠晴", "莊荷青"]);
  console.log(data);
}
main();
