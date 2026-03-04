import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDoctorsSpecialty() {
  const { data, error } = await supabase
    .from('doctors')
    .select('name, specialty')
    .limit(10);
    
  if (error) {
    console.error("Error reading doctors:", error);
  } else {
    console.log("Doctors Sample:", data);
  }
}

checkDoctorsSpecialty();
