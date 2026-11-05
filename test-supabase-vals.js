import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('settings').select('data').single();
  const dStats = data.data.dailyStats;
  for (const date of Object.keys(dStats).sort()) {
    if (dStats[date].dazhi_nutrition_consultations) {
      console.log(date, ":", dStats[date].dazhi_nutrition_consultations);
    }
  }
}
run();
