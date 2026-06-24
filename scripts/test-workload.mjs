import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: users } = await supabase.from("users").select("*");
  const { data: shifts } = await supabase.from("shifts").select("*");
  const { data: workloads } = await supabase.from("radiographer_workload").select("*").eq("date", "2026-06");
  
  const student = users.find(u => u.name === "張庭榕");
  if (!student) return console.log("Student not found");
  
  const currentMonth = "2026-06";
  const generalDates = [];
  for (let i = 6; i <= 30; i++) generalDates.push(`2026-06-${String(i).padStart(2, '0')}`);
  for (let i = 1; i <= 5; i++) generalDates.push(`2026-07-${String(i).padStart(2, '0')}`);
  
  const studentShifts = shifts.filter(
    (s) =>
      s.userId === student.id &&
      generalDates.includes(s.date) &&
      s.station !== "UNASSIGNED" &&
      s.station !== "OFF" &&
      s.station !== "休假"
  );
  
  const studentWorkloads = workloads.filter(
    (w) => w.radiographerName === student.name && w.date === currentMonth
  );
  if (studentWorkloads.length === 0) return console.log("No workloads for student");

  const learningDates = {};

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

  const stationCategories = ["MR", "CT", "超音波", "DX", "MG", "BMD"];
  stationCategories.forEach(cat => {
    studentShifts.forEach(shift => {
      if (isStationCat(shift.station, cat)) {
        const isLearning = isLearningCat(student, cat, shift.date);
        if (isLearning) {
          if (!learningDates[student.id]) learningDates[student.id] = {};
          if (!learningDates[student.id][cat]) learningDates[student.id][cat] = new Set();
          learningDates[student.id][cat].add(shift.date);
        }
      }
    });
  });

  console.log("learningDates:", learningDates);
}
main();
