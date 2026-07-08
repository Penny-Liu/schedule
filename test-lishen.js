import fs from 'fs';
import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://sfeyvjeiqgvnketbcujm.supabase.co", "sb_publishable_LubB60pKdYRP_pU-Bpoc-g_3OyY59Oo");

async function run() {
  const { data } = await supabase.from("radiographer_daily_workload").select("*").eq("date", "2026-07-08").eq("radiographer_name", "紀力慎");
  console.log("Lishen dData:", data);
}
run();
