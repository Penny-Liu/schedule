import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from("shifts").select("id, specialRoles, station").or('station.ilike.%輔%,specialRoles.cs.["輔班"]').limit(5);
  console.log("data:", data);
  console.log("error:", error);
}
test();
