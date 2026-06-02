import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data: users } = await supabase.from("users").select("id, name, alias, learning_capabilities");
  const zhuang = users.find(u => u.name === "莊荷青");
  const zhang = users.find(u => u.name === "張詠晴");
  
  console.log("張詠晴 Learning:", zhang?.learning_capabilities);
  
  if (zhuang && zhang) {
    const { data: shifts } = await supabase.from("shifts")
      .select("*")
      .in("userId", [zhuang.id, zhang.id])
      .gte("date", "2026-05-20")
      .lte("date", "2026-05-31")
      .order("date");
      
    console.log("Shifts (Late May):");
    let byDate = {};
    shifts.forEach(s => {
      if (!byDate[s.date]) byDate[s.date] = [];
      const name = s.userId === zhuang.id ? "莊荷青" : "張詠晴";
      byDate[s.date].push(`${name}: ${s.station} ${s.specialRoles ? JSON.stringify(s.specialRoles) : '[]'}`);
    });
    console.log(byDate);
  }
}
main();
