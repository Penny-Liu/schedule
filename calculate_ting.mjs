import fs from 'fs';

const rawShifts = JSON.parse(fs.readFileSync('output_july2.json', 'utf8').split('\n').slice(1).join('\n'));
const rawStats = JSON.parse(fs.readFileSync('pure.json', 'utf8'));

const shifts = rawShifts.shifts.sort((a,b) => a.date.localeCompare(b.date));
const dailyStats = rawStats.dailyStats.sort((a,b) => a.date.localeCompare(b.date));

let totalUnits = 0;
let output = [];

shifts.forEach(shift => {
  const date = shift.date;
  const station = shift.station;
  const roles = shift.specialRoles || [];
  const stat = dailyStats.find(s => s.date === date);
  
  if (!stat && !roles.includes('輔班') && !roles.includes('排班') && !roles.includes('開機') && station !== '未分配') {
    output.push(`${date}: 班表 ${station}, 但無工作量數據`);
    return;
  }
  
  let dayTotal = 0;
  let details = [];
  
  if (stat) {
    if (stat.mr > 0) { dayTotal += stat.mr; details.push(`MR=${stat.mr}`); }
    if (stat.mr_large_male > 0) { dayTotal += stat.mr_large_male * 1.5; details.push(`男大=${stat.mr_large_male}x1.5`); }
    if (stat.mr_large_female > 0) { dayTotal += stat.mr_large_female * 1.5; details.push(`女大=${stat.mr_large_female}x1.5`); }
    if (stat.mr_medium > 0) { dayTotal += stat.mr_medium * 1.3; details.push(`中胖=${stat.mr_medium}x1.3`); }
    if (stat.mr_small > 0) { dayTotal += stat.mr_small * 1.2; details.push(`幽閉=${stat.mr_small}x1.2`); }
    
    if (stat.us > 0) { dayTotal += stat.us; details.push(`US醫令=${stat.us}`); }
    if (stat.us_breast > 0) { dayTotal += stat.us_breast * 2; details.push(`乳超=${stat.us_breast}x2`); }
    if (stat.us_thy > 0) { dayTotal += stat.us_thy * 1.5; details.push(`甲狀=${stat.us_thy}x1.5`); }
    if (stat.us_heart > 0) { dayTotal += stat.us_heart * 3; details.push(`心超=${stat.us_heart}x3`); }
    if (stat.us_cca > 0) { dayTotal += stat.us_cca * 1.5; details.push(`頸動=${stat.us_cca}x1.5`); }
    if (stat.us_neck > 0) { dayTotal += stat.us_neck * 1.5; details.push(`頸部=${stat.us_neck}x1.5`); }
    if (stat.us_pelvis_female > 0) { dayTotal += stat.us_pelvis_female * 1.5; details.push(`女骨盆=${stat.us_pelvis_female}x1.5`); }
    if (stat.us_pelvis_male > 0) { dayTotal += stat.us_pelvis_male * 1.5; details.push(`男骨盆=${stat.us_pelvis_male}x1.5`); }
    if (stat.us_fibrosis > 0) { dayTotal += stat.us_fibrosis * 1.5; details.push(`肝纖=${stat.us_fibrosis}x1.5`); }
    if (stat.us_a > 0) { dayTotal += stat.us_a * 1.5; details.push(`超音波A=${stat.us_a}x1.5`); }
    
    if (stat.ct > 0) { dayTotal += stat.ct; details.push(`CT=${stat.ct}`); }
    if (stat.cta > 0) { dayTotal += stat.cta * 3; details.push(`CTA=${stat.cta}x3`); }
    if (stat.dx > 0) { dayTotal += stat.dx * 0.5; details.push(`DX=${stat.dx}x0.5`); }
    if (stat.mg > 0) { dayTotal += stat.mg * 1.5; details.push(`MG=${stat.mg}x1.5`); }
    if (stat.bmd > 0) { dayTotal += stat.bmd * 0.5; details.push(`BMD=${stat.bmd}x0.5`); }
    if (stat.cta_post_processing > 0) { dayTotal += stat.cta_post_processing * 5; details.push(`CTA後處理=${stat.cta_post_processing}x5`); }
    
    if (stat.report_entry > 0) { dayTotal += stat.report_entry * 0.1; details.push(`報表登打=${stat.report_entry}x0.1`); }
    if (stat.image_proofing > 0) { dayTotal += stat.image_proofing * 0.05; details.push(`影像校對=${stat.image_proofing}x0.05`); }
    if (stat.tsmc_report > 0) { dayTotal += stat.tsmc_report * 0.3; details.push(`台積電=${stat.tsmc_report}x0.3`); }
  }
  
  if (roles.includes('輔班')) {
    dayTotal += 6;
    details.push('輔班=6');
  }
  if (roles.includes('排班')) {
    dayTotal += 9;
    details.push('排班=9');
  }
  if (roles.includes('開機')) {
    dayTotal += 12;
    details.push('開機=12');
  }
  if (station.includes('場控')) {
    // We don't have the overall daily stats for floor control in this script easily.
    // The UI uses cycleDailyData's total_weighted_orders * 0.05 for this.
    // Let's mark it.
    details.push('場控=未知(看當日總業績x0.05)');
  }
  
  output.push(`${date} [${station}${roles.length ? `(${roles.join(',')})` : ''}]: ${details.join(', ')} => 總計: ${dayTotal.toFixed(2)}`);
  totalUnits += dayTotal;
});

console.log(output.join('\n'));
console.log(`\n總計單位: ${totalUnits.toFixed(2)}`);

