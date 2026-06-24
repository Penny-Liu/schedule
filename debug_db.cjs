const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase
    .from('radiographer_daily_workload')
    .select('*')
    .eq('radiographer_name', '張庭榕')
    .gte('date', '2026-06-01')
    .lte('date', '2026-06-30');
    
  console.log("張庭榕 週期6 (2026-06) 每日明細:", JSON.stringify(data, null, 2));
}

run();
