const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase
    .from('radiographer_daily_workload')
    .select('radiographer_name, us_pelvis_male, date')
    .gte('date', '2026-06-01')
    .lte('date', '2026-06-30')
    .gt('us_pelvis_male', 0);
    
  console.log("週期6 產生過 us_pelvis_male 的放射師:", data);
}

run();
