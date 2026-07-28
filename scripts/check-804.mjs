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
  const targetDate = '2026-08-04';
  const { data: shifts } = await supabase.from('shifts').select('*').eq('date', targetDate);
  const { data: users } = await supabase.from('users').select('*');
  
  let supplySlots = 0;
  console.log(`Shifts for ${targetDate}:`);
  shifts.forEach(s => {
      if (s.station === "休假" || s.station === "未分配") return;
      const u = users.find(u => u.id === s.userId);
      if (!u) return;
      
      const isDazhiSupport = s.specialRoles?.includes("大直支援");
      const isDazhi = s.station.includes("大直") || isDazhiSupport;
      
      if (isDazhi) return; // Ignore Dazhi for Beitou calculation

      const isLeader = s.station.includes("場控");
      const isAdmin = s.station === "行政"; 
      const isLearning = s.station.includes("學習"); // Need to check if user learning is handled but simple check here
      const isRemote = s.station.includes("遠距") || s.station.includes("遠班");
      const isBmdStation = s.station.toLowerCase().includes("bmd") || s.station.includes("骨密") || s.station.includes("骨質") || (s.specialRoles || []).includes("兼BMD/DX");
      
      let counted = false;
      let reason = "一般站點 (48 slot)";
      
      if (!isLeader && !isAdmin && !isLearning) {
         if (isRemote && !isBmdStation) {
             reason = "遠班但非骨密/大直 (0 slot)";
         } else {
             supplySlots += 48;
             counted = true;
             if (isRemote && isBmdStation) reason = "遠班兼骨密 (48 slot)";
         }
      } else {
          if (isLeader) reason = "場控 (0 slot)";
          else if (isAdmin) reason = "行政 (0 slot)";
          else if (isLearning) reason = "學習 (0 slot)";
      }
      
      console.log(`- ${u.name}: ${s.station}, 角色: ${s.specialRoles?.join(",") || "無"} => ${reason}`);
  });
  console.log(`Total calculated Beitou supply slots: ${supplySlots}`);
  console.log(`Total t: ${supplySlots / 48}`);
}
main();
