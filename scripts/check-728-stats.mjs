import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve('.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: settings } = await supabase.from('settings').select('data').limit(1).single();
  const dailyStats = settings.data?.dailyStats?.['2026-07-28'];
  
  if (!dailyStats) {
    console.log("No daily stats found for 2026-07-28");
    return;
  }
  
  console.log("Stats for 2026-07-28:");
  console.log("Beitou Ultrasound Total:", dailyStats.beitou_ultrasound || 0);
  console.log("Beitou Ultrasound Heart:", dailyStats.beitou_ultrasound_heart || 0);
  console.log("Beitou Ultrasound Fibrosis:", dailyStats.beitou_ultrasound_fibrosis || 0);
  console.log("Beitou Ultrasound Thyroid:", dailyStats.beitou_ultrasound_thyroid || 0);
  console.log("Beitou Ultrasound CCA:", dailyStats.beitou_ultrasound_cca || 0);
  console.log("Beitou Ultrasound Abdomen:", dailyStats.beitou_ultrasound_abdomen || 0);
  console.log("Beitou Ultrasound Breast:", dailyStats.beitou_ultrasound_breast || 0);
  console.log("Beitou Ultrasound Pelvic:", dailyStats.beitou_ultrasound_pelvic || 0);

  console.log("\nDazhi Ultrasound Total:", dailyStats.dazhi_ultrasound || 0);
  console.log("Dazhi Ultrasound Heart:", dailyStats.dazhi_ultrasound_heart || 0);
  console.log("Dazhi Ultrasound Fibrosis:", dailyStats.dazhi_ultrasound_fibrosis || 0);
  console.log("Dazhi Ultrasound Thyroid:", dailyStats.dazhi_ultrasound_thyroid || 0);
  console.log("Dazhi Ultrasound CCA:", dailyStats.dazhi_ultrasound_cca || 0);
  console.log("Dazhi Ultrasound Abdomen:", dailyStats.dazhi_ultrasound_abdomen || 0);
  console.log("Dazhi Ultrasound Breast:", dailyStats.dazhi_ultrasound_breast || 0);
  console.log("Dazhi Ultrasound Pelvic:", dailyStats.dazhi_ultrasound_pelvic || 0);
}
main();
