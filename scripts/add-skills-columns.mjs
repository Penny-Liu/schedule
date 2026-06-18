import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const sql = `
  ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS unlocked_skills JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS learning_skills JSONB DEFAULT '[]'::jsonb;
`;

async function main() {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    console.log("Error running via RPC:");
    console.error(error);
  } else {
    console.log("Migration executed successfully.");
  }
}
main();
