const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data: users } = await supabase.from('users').select('id, name, is_learning_us');
  const students = users.filter(u => u.is_learning_us);
  console.log("正在學習超音波的學生:", students.map(u => u.name));
}

run();
