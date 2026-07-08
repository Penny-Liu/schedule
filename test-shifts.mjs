import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/liuyaping/Downloads/schedule/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('*').in('name', ['雅萍', '佳郁']);
  const userIds = users.map(u => u.id);
  const { data: shifts } = await supabase.from('shifts').select('*').in('user_id', userIds).eq('date', '2026-07-08');
  console.log(users.map(u => ({ name: u.name, id: u.id })));
  console.log(shifts);
}
run();
