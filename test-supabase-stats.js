import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('settings').select('data').single();
  const dStats = data.data.dailyStats;
  const sampleDate = Object.keys(dStats).find(d => dStats[d] && Object.keys(dStats[d]).some(k => k.includes('nutri')));
  if (sampleDate) {
    console.log("Stats for", sampleDate, ":");
    console.log(Object.keys(dStats[sampleDate]).filter(k => k.includes('nutri')));
  } else {
    console.log("No nutri keys found in any date");
    const anyDate = Object.keys(dStats)[0];
    console.log("Sample keys:", Object.keys(dStats[anyDate]));
  }
}
run();
