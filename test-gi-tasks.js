import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('health_mgmt_shifts').select('station, task');
  const giTasks = new Set();
  (data||[]).forEach(d => {
    if (d.task) {
        d.task.split('@@').forEach(t => giTasks.add(t));
    }
  });
  console.log("All Tasks:", Array.from(giTasks));
}
run();
