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
  const { data: shifts } = await supabase.from('shifts').select('*').eq('date', '2026-07-30');
  const { data: users } = await supabase.from('users').select('*');
  
  shifts.forEach(s => {
      const u = users.find(u => u.id === s.userId);
      if (u && s.station.includes('遠')) {
         console.log(`${u.name}: ${s.station}, roles: ${JSON.stringify(s.specialRoles)}`);
      }
  });
}
main();
