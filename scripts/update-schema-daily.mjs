import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const sql = `
  ALTER TABLE radiographer_daily_workload
  ADD COLUMN IF NOT EXISTS mr_large_male_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_large_female_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_medium_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_small_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_a_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_breast_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_heart_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_thy_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_cca_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_neck_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_pelvis_female_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_pelvis_male_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dx_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mg_teaching FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cta_teaching FLOAT DEFAULT 0;
`;

async function main() {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    console.log("Error running via RPC, please manually add columns via dashboard.");
    console.error(error);
  } else {
    console.log("Migration executed.");
  }
}
main();
