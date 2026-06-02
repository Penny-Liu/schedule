import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function main() {
  const { data } = await supabase.from("radiographer_workload")
    .select("*")
    .eq("year", 2026)
    .eq("month", 5)
    .in("radiographerName", ["莊荷青", "張詠晴"]);
  console.log(data);
}
main();
