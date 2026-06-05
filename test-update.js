import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1];
const SUPABASE_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const payload = {
    year: 2026,
    month: 12,
    radiographerName: 'testuser123',
    report_entry: 10
  };
  
  // insert twice to see if it violates unique constraint
  await supabase.from("radiographer_workload").insert(payload);
  const { error } = await supabase.from("radiographer_workload").insert(payload);
  
  console.log("Second insert error:", error);
  
  await supabase.from("radiographer_workload").delete().eq("radiographerName", "testuser123");
}
test();
