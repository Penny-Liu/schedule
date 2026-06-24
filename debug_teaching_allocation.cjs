const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data: users } = await supabase.from('users').select('*');
  const { data: shifts } = await supabase.from('shifts').select('*').gte('date', '2026-06-01').lte('date', '2026-06-30');
  const { data: dailyData } = await supabase.from('radiographer_daily_workload').select('*').gte('date', '2026-06-01').lte('date', '2026-06-30');

  const radiographers = users.filter(u => u.isRadiographer);
  const teachingAllocations = {};
  
  const isLearningCat = (user, cat, date) => {
    if (!user) return false;
    if (cat === "MR") return user.is_learning_mr;
    if (cat === "CT") return user.is_learning_ct;
    if (cat === "超音波") return user.is_learning_us;
    if (cat === "DX") return user.is_learning_dx;
    if (cat === "MG") return user.is_learning_mg;
    if (cat === "BMD") return user.is_learning_bmd;
    return false;
  };

  const isStationCat = (station, cat) => {
    if (!station) return false;
    if (cat === "超音波") return station.startsWith("US") || station.includes("超音波");
    if (cat === "MR") return station.startsWith("MR");
    if (cat === "CT") return station.startsWith("CT");
    return station.includes(cat);
  };

  radiographers.forEach(student => {
    const studentShifts = shifts.filter(s => s.userId === student.id);
    const cat = "超音波";
    
    const processedDates = new Set();
    studentShifts.forEach(shift => {
      if (isStationCat(shift.station, cat)) {
        if (processedDates.has(shift.date)) return;
        processedDates.add(shift.date);
        
        if (isLearningCat(student, cat, shift.date)) {
          const studentStations = studentShifts.filter(s => s.date === shift.date && isStationCat(s.station, cat)).map(s => s.station);
          
          const teachersOnSameDay = radiographers.filter(r => {
            if (r.id === student.id) return false;
            const tShifts = shifts.filter(s => s.userId === r.id && s.date === shift.date);
            if (tShifts.length === 0) return false;
            if (!tShifts.some(ts => studentStations.includes(ts.station))) return false;
            return !isLearningCat(r, cat, shift.date);
          });
          
          if (teachersOnSameDay.length > 0) {
            const weight = 1 / teachersOnSameDay.length;
            const dData = dailyData.find(d => d.radiographer_name === student.name && d.date === shift.date);
            const actualPoints = dData ? (dData.us_pelvis_male || 0) : 0;
            
            if (actualPoints > 0) {
              teachersOnSameDay.forEach(t => {
                if (!teachingAllocations[t.name]) teachingAllocations[t.name] = { total: 0, from: [] };
                teachingAllocations[t.name].total += actualPoints * weight;
                teachingAllocations[t.name].from.push(`${student.name}(${shift.date}): ${actualPoints * weight}`);
              });
            }
          }
        }
      }
    });
  });

  console.log("Teacher p男 points:", JSON.stringify(teachingAllocations, null, 2));
}
run();
