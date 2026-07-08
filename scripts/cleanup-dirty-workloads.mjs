import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanup() {
  console.log("Fetching users...");
  const { data: users, error: err1 } = await supabase.from("users").select("name, is_radiographer");
  if (err1) throw err1;
  
  const validNames = new Set(users.filter(u => u.is_radiographer).map(u => u.name.trim()));

  // 1. radiographer_workload
  const { data: workloads, error: err2 } = await supabase.from("radiographer_workload").select("id, radiographerName");
  if (err2) {
    console.error(err2);
  } else {
    const invalidWorkloadIds = (workloads || []).filter(w => !validNames.has(w.radiographerName)).map(w => w.id);
    if (invalidWorkloadIds.length > 0) {
      console.log(`Deleting ${invalidWorkloadIds.length} dirty records from radiographer_workload...`);
      for(let i=0; i<invalidWorkloadIds.length; i+=100) {
        const batch = invalidWorkloadIds.slice(i, i+100);
        await supabase.from("radiographer_workload").delete().in("id", batch);
      }
    } else {
      console.log("No dirty records in radiographer_workload.");
    }
  }
}

cleanup().catch(console.error);
