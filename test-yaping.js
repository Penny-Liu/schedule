import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://sfeyvjeiqgvnketbcujm.supabase.co", "sb_publishable_LubB60pKdYRP_pU-Bpoc-g_3OyY59Oo");

async function run() {
  const { data } = await supabase.from("radiographer_daily_workload").select("*").eq("date", "2026-07-08").eq("radiographer_name", "劉雅萍");
  const dData = data[0];
  console.log("DB dData:", dData);
  
  // mapFromDbFields simulation
  dData.proofreader = dData.image_proofing;
  dData.reportTyping = dData.report_entry;
  
  console.log("Mapped proofreader:", dData.proofreader);
  
  let wToUse = { proofreader: 0, reportTyping: 0 };
  wToUse = { ...wToUse, ...dData };
  
  console.log("wToUse proofreader:", wToUse.proofreader);
}
run();
