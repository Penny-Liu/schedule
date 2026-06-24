import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: users } = await supabase.from("users").select("*");
  const { data: shifts } = await supabase.from("shifts").select("*");
  
  const student = users.find(u => u.name === "張庭榕");
  if (!student) return console.log("Student not found");
  
  const studentShifts = shifts.filter(s => s.userId === student.id && s.date >= "2026-06-01" && s.date <= "2026-07-05");
  
  const isLearningCat = (user, cat, shiftDate) => {
    if (!user.learning_capabilities) return false;
    let matches = [];
    if (cat === "超音波") matches = user.learning_capabilities.filter(c => c.startsWith("US") || c === "超音波");
    else if (cat === "MR") matches = user.learning_capabilities.filter(c => c.startsWith("MR"));
    else matches = user.learning_capabilities.filter(c => c === cat);
    
    return matches.some(cap => {
      const schedules = user.learning_schedules || {};
      return !schedules[cap] || shiftDate <= schedules[cap];
    });
  };

  const isStationCat = (station, cat) => {
    if (!station) return false;
    if (cat === "超音波") return station.startsWith("US") || station.includes("超音波");
    if (cat === "MR") return station.startsWith("MR");
    if (cat === "CT") return station.startsWith("CT");
    return station.includes(cat);
  };

  studentShifts.forEach(shift => {
    if (isStationCat(shift.station, "超音波")) {
      const isLearning = isLearningCat(student, "超音波", shift.date);
      console.log(`Shift date: ${shift.date}, Station: ${shift.station}, isLearning: ${isLearning}`);
    }
    if (isStationCat(shift.station, "MR")) {
      const isLearning = isLearningCat(student, "MR", shift.date);
      console.log(`Shift date: ${shift.date}, Station: ${shift.station}, isLearning: ${isLearning}`);
    }
  });
}
main();
