import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://sfeyvjeiqgvnketbcujm.supabase.co", "sb_publishable_LubB60pKdYRP_pU-Bpoc-g_3OyY59Oo");

async function run() {
  const { data: dData } = await supabase.from("radiographer_daily_workload").select("*").eq("date", "2026-07-08").eq("radiographer_name", "陳力慎");
  
  const totalOrders = 222;
  const pct = 0.13;
  const floorControlScore = Math.round(totalOrders * pct);
  
  const wToUse = { ...dData[0] };
  
  let stats = { ct: wToUse.ct, floorControlScore };
  
  let sum = 0;
  sum += stats.floorControlScore;
  sum += stats.ct * 0.5;
  
  console.log("Lishen onsiteUnits before round:", sum);
  console.log("Lishen onsiteUnits after round:", Math.round(sum));
}
run();
