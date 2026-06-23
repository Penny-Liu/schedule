import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/liuyaping/Downloads/schedule/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: users } = await supabase.from("users").select("*");
  const { data: settingsRes } = await supabase.from("settings").select("*");
  const settings = settingsRes[0].data;
  
  const currentMonth = "2026-06"; // Cycle 6
  const cycles = settings.cycles || [];
  
  const [year, month] = currentMonth.split("-").map(Number);
  const cycleDef = cycles.find(c => c.month === month);
  let firstDay = `${currentMonth}-01`;
  let lastDay = `${currentMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  if (cycleDef) {
    const sDate = new Date(year, month - 1, cycleDef.startDay);
    if (cycleDef.startDay > cycleDef.endDay) {
        sDate.setMonth(sDate.getMonth() - 1);
    }
    const eDate = new Date(year, month - 1, cycleDef.endDay);
    
    firstDay = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}`;
    lastDay = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;
  }
  console.log("generalDates:", firstDay, "to", lastDay);

  const { data: shifts } = await supabase.from("shifts").select("*")
    .gte("date", firstDay).lte("date", lastDay);
    
  const { data: workloads } = await supabase.from("radiographer_workload").select("*")
    .eq("date", currentMonth);
    
  const radiographers = users.filter(u => u.is_radiographer && !u.is_part_time);
  const stationCategories = ["MR", "CT", "超音波", "DX", "MG", "BMD"];
  
  const teachingAllocations = {};
  
  radiographers.forEach((student) => {
    const capabilities = student.capabilities || [];
    const learningCapabilities = student.learning_capabilities || [];
    const learningSchedules = student.learning_schedules || {};
    
    const studentShifts = shifts.filter(
        (s) => s.user_id === student.id && s.station !== '未排班' && s.station !== '休假' && s.station !== 'OFF'
    );
    
    const studentWorkloads = workloads.filter(
        (w) => w.radiographer_name === student.name
    );
    if (studentWorkloads.length === 0) return;
    const sw = studentWorkloads[0];
    
    stationCategories.forEach(cat => {
        let learningShiftsCount = 0;
        let totalShiftsCount = 0;
        const teacherCounts = {};

        studentShifts.forEach(shift => {
          if (shift.station && shift.station.includes(cat)) {
            totalShiftsCount++;
            
            const isLearning = learningCapabilities.includes(cat) &&
              (!learningSchedules[cat] || shift.date <= learningSchedules[cat]);

            if (isLearning) {
              learningShiftsCount++;
              
              const teachersOnSameDay = radiographers.filter(r => {
                if (r.id === student.id) return false;
                const teacherShift = shifts.find(s => s.user_id === r.id && s.date === shift.date);
                if (!teacherShift) return false;
                if (!teacherShift.station.includes(cat)) return false;
                
                const teacherIsLearning = r.learning_capabilities?.includes(cat) &&
                  (!r.learning_schedules?.[cat] || shift.date <= r.learning_schedules[cat]);
                return !teacherIsLearning;
              });

              if (teachersOnSameDay.length > 0) {
                const weightPerTeacher = 1 / teachersOnSameDay.length;
                teachersOnSameDay.forEach(t => {
                  teacherCounts[t.name] = (teacherCounts[t.name] || 0) + weightPerTeacher;
                });
              }
            }
          }
        });

        if (totalShiftsCount > 0 && learningShiftsCount > 0) {
          const learningRatio = learningShiftsCount / totalShiftsCount;
          let fields = [];
          if (cat === "MR") fields = ["mr", "mrLargeMale", "mrLargeFemale", "mrMedium", "mrSmall"];
          else if (cat === "CT") fields = ["ct", "cta", "ctaPostProcessing"];
          else if (cat === "超音波") fields = ["us", "usA", "usBreast", "usHeart", "usThy", "usCCA", "usNeck", "usPelvisFemale", "usPelvisMale"];
          else if (cat === "DX") fields = ["dx"];
          else if (cat === "MG") fields = ["mg"];
          else if (cat === "BMD") fields = ["bmd"];

          fields.forEach(field => {
            const getVal = (w, k) => w[k] || w[k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] || 0;
            const studentTotalVal = getVal(sw, field);
            if (studentTotalVal > 0) {
              const teachingPool = studentTotalVal * learningRatio;
              const totalTeacherWeights = Object.values(teacherCounts).reduce((a, b) => a + b, 0);
              
              if (totalTeacherWeights > 0) {
                Object.entries(teacherCounts).forEach(([teacherName, weight]) => {
                  const assignedVal = teachingPool * (weight / totalTeacherWeights);
                  const teachingFieldKey = `${field}Teaching`;
                  
                  if (!teachingAllocations[teacherName]) teachingAllocations[teacherName] = {};
                  teachingAllocations[teacherName][teachingFieldKey] = (teachingAllocations[teacherName][teachingFieldKey] || 0) + assignedVal;
                  
                  if (teacherName === "莊荷菁" || teacherName === "王曉萍") {
                    console.log(`Teacher ${teacherName} got ${assignedVal.toFixed(2)} from ${student.name} for ${field} (Student total: ${studentTotalVal}, pool: ${teachingPool.toFixed(2)}, ratio: ${learningRatio.toFixed(2)}, t_weight: ${weight}, total_t_weights: ${totalTeacherWeights}, total_shifts: ${totalShiftsCount}, learning_shifts: ${learningShiftsCount})`);
                  }
                });
              }
            }
          });
        }
      });
  });
}

run();
// I need to modify the script to print the error.
