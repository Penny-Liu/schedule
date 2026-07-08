import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://sfeyvjeiqgvnketbcujm.supabase.co", "sb_publishable_LubB60pKdYRP_pU-Bpoc-g_3OyY59Oo");

async function run() {
  const { data } = await supabase.from("radiographer_daily_workload").select("*").eq("date", "2026-07-08");
  let total = 0;
  data.forEach(d => {
    total += (d.mr || 0);
    total += (d.us || 0);
    total += (d.ct || 0);
    total += (d.dx || 0);
    total += (d.mg || 0);
    total += (d.bmd || 0);
    total += (d.cta || 0);
  });
  console.log("Total orders on 7/8:", total);
}
run();
