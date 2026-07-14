import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://sfeyvjeiqgvnketbcujm.supabase.co", "sb_publishable_LubB60pKdYRP_pU-Bpoc-g_3OyY59Oo");
async function run() {
  const { data } = await supabase.from("shifts_new").select("station, user_id, date, users(name)").eq("date", "2026-07-14");
  console.log("Shifts:", JSON.stringify(data, null, 2));
}
run();
