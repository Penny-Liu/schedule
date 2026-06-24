import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
async function main() {
  const { data } = await supabase.from("users").select("name, learning_capabilities").eq("name", "庭榕");
  console.log(JSON.stringify(data, null, 2));
}
main();
