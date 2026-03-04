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

async function testSubmit() {
  console.log("Attempting to insert dummy test data...");
  const dummyEntry = {
    date: '1999-01-01',
    doctor_id: 'test_doc_123',
    assistant_ids: [],
    proofreader_user_id: null
  };
  
  const { data, error } = await supabase
    .from('cloud_schedule_entries')
    .upsert(dummyEntry, { onConflict: 'date, doctor_id' });
    
  if (error) {
    console.error("Supabase Save Error:", error);
  } else {
    console.log("Supabase Save Success!");
    
    // Test fetch
    const { data: fetchRes, error: fetchErr } = await supabase
      .from('cloud_schedule_entries')
      .select('*')
      .eq('doctor_id', 'test_doc_123');
      
    if (fetchErr) {
        console.error("Fetch Error:", fetchErr);
    } else {
        console.log("Fetch Result:", fetchRes);
        // Clean up
        await supabase.from('cloud_schedule_entries').delete().eq('doctor_id', 'test_doc_123');
    }
  }
}

testSubmit();
