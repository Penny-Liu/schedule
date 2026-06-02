import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const sql = `
  ALTER TABLE radiographer_workload
  ADD COLUMN IF NOT EXISTS mr_large_male_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_large_female_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_medium_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_small_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_a_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_breast_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_heart_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_thy_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_cca_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_neck_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_pelvis_female_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_pelvis_male_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dx_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mg_teaching int4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cta_teaching int4 DEFAULT 0;
`;

async function main() {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    console.log("Error running via RPC, trying a raw REST query or please manually add columns.");
    console.error(error);
  } else {
    console.log("Migration executed.");
  }
}
main();
