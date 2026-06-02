import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data } = await supabase
    .from("radiographer_workload")
    .select("*")
    .eq("year", 2026)
    .in("month", [5, 6])
    .eq("radiographerName", "劉雅萍");
  
  console.log("Workload for Liu Ya-Ping in May and June:");
  console.log(data);
}
main();
