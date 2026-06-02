import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data: usersData } = await supabase.from("users").select("id, name, alias, learning_capabilities");
  
  const validNamesMap = {};
  const userIdToName = {};
  usersData.forEach((u) => {
    validNamesMap[u.name.trim()] = u.name.trim();
    if (u.alias) validNamesMap[u.alias.trim()] = u.name.trim();
    userIdToName[u.id] = u.name.trim();
  });

  const getModalityFromStation = (station) => {
    const s = String(station || "").toUpperCase();
    if (s.includes("MR")) return "mr";
    if (s.includes("US")) return "us";
    if (s.includes("CT")) return "ct";
    if (s.includes("BMD") || s.includes("DX")) return "bmd";
    return null;
  };

  const { data: shiftsData } = await supabase
    .from("shifts")
    .select("date, station, specialRoles, userId")
    .gte("date", "2026-05-20")
    .lte("date", "2026-05-31");
  
  const dailyTeachers = {}; 
  if (shiftsData) {
    const shiftsByDateStation = {};
    shiftsData.forEach(s => {
      if (!s.station) return;
      if (!shiftsByDateStation[s.date]) shiftsByDateStation[s.date] = {};
      if (!shiftsByDateStation[s.date][s.station]) shiftsByDateStation[s.date][s.station] = [];
      shiftsByDateStation[s.date][s.station].push(s);
    });
    for (const [date, stations] of Object.entries(shiftsByDateStation)) {
      dailyTeachers[date] = {};
      for (const [station, stShifts] of Object.entries(stations)) {
        if (stShifts.length >= 2) {
          const learners = stShifts.filter(s => {
            const u = usersData.find(usr => usr.id === s.userId);
            return u && u.learning_capabilities && u.learning_capabilities.some(cap => station.includes(cap));
          });
          const teachers = stShifts.filter(s => {
            const u = usersData.find(usr => usr.id === s.userId);
            return !u || !u.learning_capabilities || !u.learning_capabilities.some(cap => station.includes(cap));
          });
          if (learners.length > 0 && teachers.length > 0) {
            const modality = getModalityFromStation(station);
            if (modality) {
              if (!dailyTeachers[date][modality]) dailyTeachers[date][modality] = {};
              learners.forEach(l => {
                const lUser = usersData.find(u => u.id === l.userId);
                if (lUser) {
                  const lName = validNamesMap[lUser.name] || lUser.name;
                  if (!dailyTeachers[date][modality][lName]) dailyTeachers[date][modality][lName] = [];
                  teachers.forEach(t => {
                    const tUser = usersData.find(u => u.id === t.userId);
                    if (tUser) {
                      const tName = validNamesMap[tUser.name] || tUser.name;
                      dailyTeachers[date][modality][lName].push(tName);
                    }
                  });
                }
              });
            }
          }
        }
      }
    }
  }
  
  console.log("Teacher mappings for late May CT:");
  for (const date in dailyTeachers) {
    if (dailyTeachers[date]["ct"]) {
      console.log(`[${date}] CT:`, dailyTeachers[date]["ct"]);
    }
  }
}
main();
