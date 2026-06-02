import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase
    .from("shifts")
    .select("date, station, specialRoles, userId, users!inner(name)")
    .limit(1);
    
  console.log(data || error);
}
main();
