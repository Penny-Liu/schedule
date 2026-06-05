import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1];
const SUPABASE_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data: shifts } = await supabase.from('shifts').select('*').eq('date', '2026-06-05');
  const workingUserIds = shifts.filter(s => s.station !== '休假' && s.station !== 'OFF' && s.station !== '未排班').map(s => s.userId);
  
  const { data: workloads } = await supabase.from('radiographer_workload').select('*').eq('year', 2026).eq('month', 5);
  const { data: users } = await supabase.from('users').select('id, name');
  const { data: settingsRow } = await supabase.from('settings').select('data').limit(1).single();
  
  const weights = settingsRow?.data?.radiographerWorkloadWeights || {
    "mr": 0.5, "mrLargeMale": 0.5, "mrLargeFemale": 0.5, "mrMedium": 0.5, "mrSmall": 0.5,
    "us": 0.3, "usA": 0.3, "usBreast": 0.3, "usHeart": 0.3, "usThy": 0.3, "usCCA": 0.3, "usNeck": 0.3,
    "usPelvisFemale": 0.3, "usPelvisMale": 0.3, "ct": 0.2, "dx": 0.1, "mg": 0.1, "bmd": 0.1, "cta": 0.2,
    "ctaPostProcessing": 0.1, "floorControl": 1, "assist": 1, "scheduler": 1,
    "reportTyping": 0.1, "proofreader": 0.1, "tsmcReport": 0.1, "mrTeaching": 0.1, "usTeaching": 0.1,
    "ctTeaching": 0.1, "dxTeaching": 0.1, "mgTeaching": 0.1, "bmdTeaching": 0.1, "ctaTeaching": 0.1,
    "mrLargeMaleTeaching": 0.1, "mrLargeFemaleTeaching": 0.1, "mrMediumTeaching": 0.1, "mrSmallTeaching": 0.1,
    "usATeaching": 0.1, "usBreastTeaching": 0.1, "usHeartTeaching": 0.1, "usThyTeaching": 0.1, "usCCATeaching": 0.1,
    "usNeckTeaching": 0.1, "usPelvisFemaleTeaching": 0.1, "usPelvisMaleTeaching": 0.1
  };

  let sumDailyAvg = 0;
  let userDetails = [];
  
  const { data: allShifts } = await supabase.from('shifts').select('*').gte('date', '2026-05-07').lte('date', '2026-06-05');
  
  for (const uid of workingUserIds) {
    const user = users.find(u => u.id === uid);
    if (!user) continue;
    const wl = workloads.find(w => w.radiographerName === user.name || w.radiographer_name === user.name);
    if (!wl) continue;
    
    const myShifts = allShifts.filter(s => s.userId === uid && s.station !== '休假' && s.station !== 'OFF' && s.station !== '未排班');
    const workDays = myShifts.length;
    
    let units = 0;
    Object.keys(weights).forEach(k => {
      const dbK = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      let v = wl[dbK] !== undefined ? wl[dbK] : (wl[k] || 0);
      units += v * weights[k];
    });
    
    let floorControl = myShifts.filter(s => s.station.includes('場控')).length;
    let assist = myShifts.filter(s => s.station.includes('輔控') || s.station === '輔' || (s.specialRoles || []).includes('ASSIST')).length;
    let scheduler = myShifts.filter(s => s.station.includes('排班') || (s.specialRoles || []).includes('SCHEDULER')).length;
    
    units += floorControl * weights.floorControl;
    units += assist * weights.assist;
    units += scheduler * weights.scheduler;
    
    if (workDays > 0) {
      const dailyAvg = units / workDays;
      sumDailyAvg += dailyAvg;
      userDetails.push(`${user.name}: ${dailyAvg.toFixed(1)} 單位/天 (當月累積總單位: ${units.toFixed(1)}, 上班天數: ${workDays})`);
    }
  }
  
  console.log(`Today's expected total units: ${sumDailyAvg.toFixed(1)}`);
  console.log(userDetails.join('\n'));
}
test();
