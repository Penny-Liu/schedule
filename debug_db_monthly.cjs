const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase
    .from('radiographer_workload')
    .select('radiographerName, us_pelvis_male_teaching')
    .eq('year', 2026)
    .eq('month', 6)
    .gt('us_pelvis_male_teaching', 0);
    
  console.log("DB 中已存檔的教學點數:", data);
}

run();
