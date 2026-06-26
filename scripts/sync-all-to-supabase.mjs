import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
import readline from "readline";
import { fileURLToPath } from "url";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- [1/3] 每日統計 (醫令數與客戶量) ---
async function syncDailyStats(session, startDate, endDate) {
  console.log(`\n[sync-stats] [1/2] 同步每日統計：${startDate} ~ ${endDate}`);

  // 一次性抓取整個區間的資料，取代原本跑 31 次報表的低效做法
  const soql = `
      SELECT CheckupName__c, Location__c, Order__c, MedicalRecordNo__c, CheckStartDate__c, ResourceCategory__c
      FROM CheckupReservation__c 
      WHERE (Location__c = '北投' OR Location__c = '大直')
        AND CheckStartDate__c >= ${startDate}
        AND CheckStartDate__c <= ${endDate}
        AND Checkup_Status__c = '10'
      ORDER BY CheckStartDate__c ASC
  `.trim();

  const result = await runSoqlQuery({ ...session, soql });
  console.log(
    `[sync-stats] 📦 成功從雲端抓取 ${result.records.length} 筆原始項次。`,
  );

  const dailyResults = {};
  const seenMR = new Set();
  const seenDazhiClient = new Set(); // 追蹤大直已計數客戶 (日期+Order)
  const seenBeitouClient = new Set(); // 追蹤北投已計數客戶 (日期+Order)
  const seenBeitouGI = new Set();
  const seenDazhiGI = new Set();

  const beitouOrders = new Set(); // 追蹤北投所有客戶 (日期+Order)
  const dazhiTargetOrders = new Set(); // 追蹤大直符合條件的客戶 (日期+Order)

  const initStats = () => ({
    beitou_clients: 0,
    beitou_gi: 0,
    beitou_cta: 0,
    beitou_mr: 0,
    beitou_mr_orders: 0,
    beitou_ultrasound: 0,
    beitou_ultrasound_heart: 0,
    beitou_ultrasound_fibrosis: 0,
    dazhi_clients: 0,
    dazhi_gi: 0,
    dazhi_metabolism_clients: 0,
    dazhi_ultrasound: 0,
    dazhi_ultrasound_heart: 0,
    dazhi_ultrasound_fibrosis: 0,
    dazhi_beitou_overlap: 0, // 新增：同時有大直與北投檢查的重疊人數
    total_weighted_orders: 0, // 新增：供場控動態加權使用的總醫令量 (CTA 算 3 份)
  });

  // 確保區間內每一天都有預設值 0，這樣如果某天完全沒有預約，才能蓋掉舊資料
  const dStart = new Date(startDate.replace(/'/g, ''));
  const dEnd = new Date(endDate.replace(/'/g, ''));
  for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dailyResults[dateStr] = initStats();
  }

  result.records.forEach((r) => {
    const date = r.CheckStartDate__c;
    const loc = r.Location__c;
    const name = r.CheckupName__c || "";
    // 使用病歷號來識別唯一客戶，若無病歷號則退回使用醫令單號
    const clientId = r.MedicalRecordNo__c || r.Order__c;

    if (!dailyResults[date]) dailyResults[date] = initStats();
    const stats = dailyResults[date];

    if (loc === "北投") {
      // 記錄北投的 Client
      beitouOrders.add(`${date}_${clientId}`);

      if (name.includes("解說") || name.includes("總評")) {
        const clientKey = `${date}_${clientId}`;
        if (!seenBeitouClient.has(clientKey)) {
          stats.beitou_clients++;
          seenBeitouClient.add(clientKey);
        }
      }
      
      if (name.includes("腸鏡") || name.includes("胃鏡") || name.includes("消化道內視鏡")) {
        const clientKey = `${date}_${clientId}`;
        if (!seenBeitouGI.has(clientKey)) {
          stats.beitou_gi++;
          seenBeitouGI.add(clientKey);
        }
      }

      if (name.includes("電腦斷層(顯影)")) stats.beitou_cta++;
      if (name.includes("磁振造影") || name.includes("MR")) {
        stats.beitou_mr_orders++;
        const mrKey = `${date}_${clientId}`;
        if (!seenMR.has(mrKey)) {
          stats.beitou_mr++;
          seenMR.add(mrKey);
        }
      }
      if (name.includes("超音波")) {
        if (!stats.beitou_ultrasound) stats.beitou_ultrasound = 0;
        stats.beitou_ultrasound++;
        if (name.includes("心臟")) stats.beitou_ultrasound_heart++;
        if (name.includes("肝纖維")) stats.beitou_ultrasound_fibrosis++;
      }
    } else if (loc === "大直") {
      // 大直客戶數：和北投一樣抓有體檢總評/解說的客人
      if (name.includes("解說") || name.includes("總評")) {
        const clientKey = `${date}_${clientId}`;
        if (!seenDazhiClient.has(clientKey)) {
          stats.dazhi_clients++;
          seenDazhiClient.add(clientKey);
          dazhiTargetOrders.add(clientKey); // 記錄大直目標客戶
        }
      }

      if (name.includes("腸鏡") || name.includes("胃鏡") || name.includes("消化道內視鏡")) {
        const clientKey = `${date}_${clientId}`;
        if (!seenDazhiGI.has(clientKey)) {
          stats.dazhi_gi++;
          seenDazhiGI.add(clientKey);
        }
      }

      if (name === "營養門診(30)") stats.dazhi_metabolism_clients++;
      if (name.includes("超音波")) {
        stats.dazhi_ultrasound++;
        if (name.includes("心臟")) stats.dazhi_ultrasound_heart++;
        if (name.includes("肝纖維")) stats.dazhi_ultrasound_fibrosis++;
      }
    }

    // 計算 total_weighted_orders (包含北投與大直所有影像檢查，CTA算3份)
    if (name.includes("磁振造影") || name.includes("MR")) {
      stats.total_weighted_orders += 1;
    } else if (name.includes("電腦斷層")) {
      if (name.includes("顯影") || name.includes("CTA") || r.CTAUseTime__c) {
        stats.total_weighted_orders += 3; // CTA 算 3 份
      } else {
        stats.total_weighted_orders += 1;
      }
    } else if (name.includes("X光") || name.includes("DX") || name.includes("數位攝影")) {
      stats.total_weighted_orders += 1;
    } else if (name.includes("乳房攝影") || name.includes("MG")) {
      stats.total_weighted_orders += 1;
    } else if (name.includes("骨質密度") || name.includes("BMD")) {
      stats.total_weighted_orders += 1;
    } else if (name.includes("超音波") || name.includes("US")) {
      stats.total_weighted_orders += 1;
    }

  });

  // 計算大直與北投的重疊人數
  dazhiTargetOrders.forEach((clientKey) => {
    if (beitouOrders.has(clientKey)) {
      const date = clientKey.split("_")[0];
      if (dailyResults[date]) {
        dailyResults[date].dazhi_beitou_overlap++;
      }
    }
  });

  // 移除 Object.keys === 0 的判斷，即使全空也要覆蓋為 0

  console.log("[sync-stats] 📝 正在更新 Supabase 設定表 (每日統計)...");
  const { data: row, error: fetchError } = await supabase
    .from("settings")
    .select("id, data")
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const settingsId = row?.id || 1;
  const settingsData = row?.data || {};
  const dailyStats = settingsData.dailyStats || {};

  settingsData.dailyStats = {
    ...dailyStats,
    ...dailyResults,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("settings")
    .upsert({ id: settingsId, data: settingsData });
  if (upsertError) throw upsertError;

  console.log(`[sync-stats] ✅ 每日統計同步完成！`);
}

// --- [2/3] 放射師工作量統計 ---
// --- 放射師工作量統計 ---
// --- 放射師工作量統計 ---
export async function syncRadiographerWorkload(
  session,
  startDate,
  endDate,
  reportStartDate,
  reportEndDate,
  targetMonthOverride,
) {
  console.log(
    `\n[sync-stats] [2/2] 同步放射師工作量：檢查量 ${startDate} ~ ${endDate}；報告/校對 ${reportStartDate} ~ ${reportEndDate}`,
    `\n[sync-stats] 同步放射師工作量：檢查量 ${startDate} ~ ${endDate}；報告/校對 ${reportStartDate} ~ ${reportEndDate}`,
  );
  console.log(`[sync-stats] [SF API] 開始同步 (API 模式)...`);

  const { data: usersData } = await supabase
    .from("users")
    .select("id, name, alias, learning_capabilities")
    
  
  const validNamesMap = {};
  usersData.forEach((u) => {
    validNamesMap[u.name.trim()] = u.name.trim();
    if (u.alias) validNamesMap[u.alias.trim()] = u.name.trim();
  });

  function findNameInPath(pathArr, validMap) {
    for (let str of pathArr) {
      if (!str || str === "-" || str === "Unknown") continue;
      let n = str.split("(")[0].split("（")[0].trim();
      if (n.includes("-")) {
        const parts = n.split("-").map((p) => p.trim());
        n = parts.find((p) => !/^[a-zA-Z0-9]+$/.test(p)) || parts[0];
      }
      if (validMap[n]) return validMap[n];
      for (const key in validMap) {
        if (key.length >= 2 && (n.endsWith(key) || key.endsWith(n))) {
          return validMap[key];
        }
      }
    }
    return "Unknown";
  }

  const [year, month] = (targetMonthOverride || startDate).split("-");
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);

  // MR 分類：依同一 Order 的 MR 醫令數量
  // ≥7 → mrLargeMale / mrLargeFemale；4-6 → mrMedium；1-3 → mrSmall
  // 回傳 snake_case key，直接對應 Supabase 欄位名
  const classifyMrByOrderCount = (count, gender) => {
    if (count >= 7) {
      return gender === "女" || gender === "F" ? "mr_large_female" : "mr_large_male";
    } else if (count >= 4) {
      return "mr_medium";
    } else {
      return "mr_small";
    }
  };

  // US 子分類，回傳 snake_case key
  const parseUsSubtype = (name = "") => {
    const value = String(name || "").trim().toLowerCase();
    if (
      value.includes("p女") ||
      (value.includes("骨盆") && value.includes("女")) ||
      value.includes("婦科")
    )
      return "us_pelvis_female";
    if (value.includes("p男") || (value.includes("骨盆") && value.includes("男")))
      return "us_pelvis_male";
    if (value.includes("breast") || value.includes("乳房")) return "us_breast";
    if (value.includes("心臟") || value.includes("心")) return "us_heart";
    if (value.includes("thy") || value.includes("甲狀")) return "us_thy";
    if (value.includes("cca") || value.includes("頸動脈")) return "us_cca";
    if (value.includes("neck") || value.includes("頸部") || value.includes("頸")) return "us_neck";
    if (value.includes("上腹")) return "us_a";
    return null;
  };

  const workloadMap = {};
  const ensureUser = (name) => {
    if (!workloadMap[name]) {
      workloadMap[name] = {
        radiographerName: name,
        year: yearNum,
        month: monthNum,
        mr: 0,
        mr_large_male: 0,
        mr_large_female: 0,
        mr_medium: 0,
        mr_small: 0,
        us: 0,
        us_a: 0,
        us_breast: 0,
        us_heart: 0,
        us_thy: 0,
        us_cca: 0,
        us_neck: 0,
        us_pelvis_female: 0,
        us_pelvis_male: 0,
        ct: 0,
        cta: 0,          // CTA 檢查量（由 CTAUseTime__c 查詢寫入）
        dx: 0,
        mg: 0,
        bmd: 0,
        mr_teaching: 0,
        mr_large_male_teaching: 0,
        mr_large_female_teaching: 0,
        mr_medium_teaching: 0,
        mr_small_teaching: 0,
        us_teaching: 0,
        us_a_teaching: 0,
        us_breast_teaching: 0,
        us_heart_teaching: 0,
        us_thy_teaching: 0,
        us_cca_teaching: 0,
        us_neck_teaching: 0,
        us_pelvis_female_teaching: 0,
        us_pelvis_male_teaching: 0,
        ct_teaching: 0,
        cta_teaching: 0,
        dx_teaching: 0,
        mg_teaching: 0,
        bmd_teaching: 0,
        imageProofing: 0,
        cta_post_processing: 0,
        report_entry: 0,
      };
    }
  };
  usersData.forEach((u) => ensureUser(u.name));

  const dailyWorkloadMap = {};
  const ensureDailyUser = (dateStr, name) => {
    if (!dateStr) return null;
    const formattedDate = dateStr.split("T")[0]; // ensure YYYY-MM-DD
    if (!dailyWorkloadMap[formattedDate]) {
      dailyWorkloadMap[formattedDate] = {};
    }
    if (!dailyWorkloadMap[formattedDate][name]) {
      dailyWorkloadMap[formattedDate][name] = {
        date: formattedDate,
        radiographer_name: name,
        mr: 0,
        mr_large_male: 0,
        mr_large_female: 0,
        mr_medium: 0,
        mr_small: 0,
        us: 0,
        us_a: 0,
        us_breast: 0,
        us_heart: 0,
        us_thy: 0,
        us_cca: 0,
        us_neck: 0,
        us_pelvis_female: 0,
        us_pelvis_male: 0,
        ct: 0,
        cta: 0,
        dx: 0,
        mg: 0,
        bmd: 0,
        image_proofing: 0,
        cta_post_processing: 0,
        report_entry: 0,
        tsmc_report: 0
      };
    }
    return dailyWorkloadMap[formattedDate][name];
  };

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
    .gte("date", startDate)
    .lte("date", endDate);
  
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
                  if (!dailyTeachers[date][modality][lName]) dailyTeachers[date][modality][lName] = new Set();
                  teachers.forEach(t => {
                    const tUser = usersData.find(u => u.id === t.userId);
                    if (tUser) {
                      const tName = validNamesMap[tUser.name] || tUser.name;
                      dailyTeachers[date][modality][lName].add(tName);
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

  const round2 = (n) => Math.round(n * 10) / 10;

  // 1a-i. CT/BMD/MG/DX（可以 GROUP BY，不需要 CheckupName）
  console.log(
    `[sync-stats]   - [SOQL] 正在查詢 'CT/BMD/MG/DX 檢查量'...`,
  );
  const ctDxSoql = `SELECT Radiologist__r.Name, ResourceCategory__c, Order__r.ReserveDate__c 
                    FROM CheckupReservation__c 
                    WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                    AND Radiologist__c != null 
                    AND ResourceCategory__c IN ('CT','BMD','MG','DX') 
                    AND (NOT Name LIKE '%報到%') 
                    AND Checkup_Status__c = '10'`;
  const ctDxData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: ctDxSoql,
  });
  (ctDxData.records || []).forEach((rec) => {
    const rawName = rec.person || rec.Radiologist__r?.Name;
    const category = (rec.category || rec.ResourceCategory__c || "").toLowerCase();
    const date = rec.date || rec.Order__r?.ReserveDate__c;
    const cleanName = findNameInPath([rawName], validNamesMap);
    
    if (cleanName === "Unknown") return;
    ensureUser(cleanName);
    const dWorkload = ensureDailyUser(date, cleanName);

    if (category === "ct") {
      workloadMap[cleanName].ct += 1;
      if (dWorkload) dWorkload.ct += 1;
      if (date && dailyTeachers[date]?.ct?.[cleanName]) {
        dailyTeachers[date].ct[cleanName].forEach(tName => { 
          ensureUser(tName); 
          workloadMap[tName].ct_teaching += 1; 
          // 每日明細中目前沒有紀錄 teaching 欄位，但若未來需要可於此處擴充
        });
      }
    }
    if (category === "dx") {
      workloadMap[cleanName].dx += 1;
      if (dWorkload) dWorkload.dx += 1;
      if (date && dailyTeachers[date]?.bmd?.[cleanName]) { // DX 和 BMD 同一崗位 (modality = bmd)
        dailyTeachers[date].bmd[cleanName].forEach(tName => { ensureUser(tName); workloadMap[tName].dx_teaching += 1; });
      }
    }
    if (category === "mg") {
      workloadMap[cleanName].mg += 1;
      if (dWorkload) dWorkload.mg += 1;
      if (date && dailyTeachers[date]?.bmd?.[cleanName]) {
        dailyTeachers[date].bmd[cleanName].forEach(tName => { ensureUser(tName); workloadMap[tName].mg_teaching += 1; });
      }
    }
    if (category === "bmd") {
      workloadMap[cleanName].bmd += 1;
      if (dWorkload) dWorkload.bmd += 1;
      if (date && dailyTeachers[date]?.bmd?.[cleanName]) {
        dailyTeachers[date].bmd[cleanName].forEach(tName => { ensureUser(tName); workloadMap[tName].bmd_teaching += 1; });
      }
    }
  });

  // 1a-ii. US：CheckupName__c 是 textarea 不能 GROUP BY，逐筆抓後 JS 側分類
  console.log(
    `[sync-stats]   - [SOQL] 正在查詢 'US 超音波檢查量' (逐筆分類)...`,
  );
  const usSoql = `SELECT Radiologist__r.Name, CheckupName__c, Order__r.ReserveDate__c 
                  FROM CheckupReservation__c 
                  WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                  AND Radiologist__c != null 
                  AND ResourceCategory__c = 'US' 
                  AND (NOT Name LIKE '%報到%') 
                  AND Checkup_Status__c = '10'`;
  const usData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: usSoql,
  });
  (usData.records || []).forEach((rec) => {
    const rawName = rec.Radiologist__r?.Name;
    const checkupName = rec.CheckupName__c || "";
    const date = rec.Order__r?.ReserveDate__c;
    const cleanName = findNameInPath([rawName], validNamesMap);
    
    if (cleanName === "Unknown") return;
    ensureUser(cleanName);
    const dWorkload = ensureDailyUser(date, cleanName);

    workloadMap[cleanName].us += 1;
    if (dWorkload) dWorkload.us += 1;
    
    const subtype = parseUsSubtype(checkupName);
    if (subtype) {
      workloadMap[cleanName][subtype] += 1;
      if (dWorkload) dWorkload[subtype] += 1;
    }
    
    if (date && dailyTeachers[date]?.us?.[cleanName]) {
      dailyTeachers[date].us[cleanName].forEach(tName => { 
        ensureUser(tName); 
        workloadMap[tName].us_teaching += 1; 
        if (subtype) workloadMap[tName][`${subtype}_teaching`] += 1;
      });
    }
  });


  // 1b. MR：逐筆抓，依 Order 醫令數分大/中/小，按比例分配給各放射師
  console.log(
    `[sync-stats]   - [SOQL] 正在查詢 'MR 工作量' (按 Order 醫令數分套別)...`,
  );
  const mrSoql = `SELECT Radiologist__r.Name, Order__c, Order__r.Gender__c, Order__r.ReserveDate__c 
                  FROM CheckupReservation__c 
                  WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                  AND Radiologist__c != null 
                  AND ResourceCategory__c = 'MR' 
                  AND (NOT Name LIKE '%報到%') 
                  AND Checkup_Status__c = '10'`;
  const mrData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: mrSoql,
  });

  // group by Order__c → 計算每張 Order 的 MR 數量、性別、各放射師醫令數
  const mrOrderMap = {};
  (mrData.records || []).forEach((rec) => {
    const orderId = rec.Order__c;
    const gender = rec.Order__r?.Gender__c || "";
    const radiologist = rec.Radiologist__r?.Name;
    if (!orderId) return;
    if (!mrOrderMap[orderId]) {
      mrOrderMap[orderId] = { count: 0, gender, date: rec.Order__r?.ReserveDate__c, radiologistCounts: {} };
    }
    mrOrderMap[orderId].count++;
    if (radiologist) {
      mrOrderMap[orderId].radiologistCounts[radiologist] =
        (mrOrderMap[orderId].radiologistCounts[radiologist] || 0) + 1;
    }
  });

  // 依 Order 的醫令數分類，各放射師按「個人醫令數 / Order 總醫令數」比例分配
  Object.values(mrOrderMap).forEach(({ count, gender, date, radiologistCounts }) => {
    const subtype = classifyMrByOrderCount(count, gender);
    Object.entries(radiologistCounts).forEach(([rawName, itemCount]) => {
      const ratio = itemCount / count;
      const cleanName = findNameInPath([rawName], validNamesMap);
    
      if (cleanName === "Unknown") return;
      ensureUser(cleanName);
      const dWorkload = ensureDailyUser(date, cleanName);

      workloadMap[cleanName].mr += itemCount;
      workloadMap[cleanName][subtype] += ratio;

      if (dWorkload) {
        dWorkload.mr += itemCount;
        dWorkload[subtype] += ratio;
      }

      if (date && dailyTeachers[date]?.mr?.[cleanName]) {
        dailyTeachers[date].mr[cleanName].forEach(tName => { 
          ensureUser(tName); 
          workloadMap[tName].mr_teaching += itemCount; 
          workloadMap[tName][`${subtype}_teaching`] += ratio;
        });
      }
    });
  });

  // 2. CTA後處理
  console.log(
    `[sync-stats]   - [SOQL] 正在查詢 'CTA後處理' (CheckupReservation__c)...`,
  );
  const ctaSoql = `SELECT CTA_Further_Rad__r.Name, Order__c, Order__r.ReserveDate__c 
                   FROM CheckupReservation__c 
                   WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                   AND CTA_Further_Rad__c != null 
                   AND Checkup_Status__c = '10'`;
  const ctaData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: ctaSoql,
  });
  
  
  const ctaOrders = new Set();
  (ctaData.records || []).forEach((rec) => {
    const rawName = rec.CTA_Further_Rad__r?.Name;
    const orderId = rec.Order__c;
    const date = rec.Order__r?.ReserveDate__c;
    const cleanName = findNameInPath([rawName], validNamesMap);
    
    
    if (cleanName === "Unknown" || !workloadMap[cleanName] || !orderId) return;
    
    // We want COUNT_DISTINCT(Order__c) per person
    const key = `${cleanName}_${orderId}`;
    if (!ctaOrders.has(key)) {
      ctaOrders.add(key);
      workloadMap[cleanName].cta += 1;
      
      const dWorkload = ensureDailyUser(date, cleanName);
      if (dWorkload) dWorkload.cta += 1;
      
      // CTA teaching uses the CT modality station
      if (date && dailyTeachers[date] && dailyTeachers[date]["ct"] && dailyTeachers[date]["ct"][cleanName]) {
         dailyTeachers[date]["ct"][cleanName].forEach(tName => {
           if (workloadMap[tName]) {
             workloadMap[tName].cta_teaching += 1;
           }
         });
      }
    }
  });

  // 3. 影像校對
  console.log(`[sync-stats]   - [SOQL] 正在查詢 '影像校對' (Order__c)...`);
  const proofingSoql = `SELECT ReserveDate__c date, Image_Proofreader__r.Name person, COUNT(Id) cnt 
                        FROM Order__c 
                        WHERE (ReserveDate__c >= ${reportStartDate} AND ReserveDate__c <= ${reportEndDate}) 
                        AND Image_Proofreader__c != null 
                        GROUP BY ReserveDate__c, Image_Proofreader__r.Name`;
  const proofingData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: proofingSoql,
  });
  (proofingData.records || []).forEach((rec) => {
    const rawName = rec.person || rec.Image_Proofreader__r?.Name;
    const value = parseInt(rec.cnt || rec.expr0 || 0, 10);
    const date = rec.date || rec.ReserveDate__c;
    const cleanName = findNameInPath([rawName], validNamesMap);
    
    if (cleanName !== "Unknown" && workloadMap[cleanName]) {
      workloadMap[cleanName].imageProofing += value;
      const dWorkload = ensureDailyUser(date, cleanName);
      if (dWorkload) dWorkload.image_proofing += value;
    }
  });

  // 4. 報告登打 (影像報告助理)
  console.log(`[sync-stats]   - [SOQL] 正在查詢 '報告登打' (Order__c)...`);
  const assistantSoql = `SELECT ReserveDate__c date, Image_Assistant__r.Name person, COUNT(Id) cnt 
                        FROM Order__c 
                        WHERE (ReserveDate__c >= ${reportStartDate} AND ReserveDate__c <= ${reportEndDate}) 
                        AND Image_Assistant__c != null 
                        GROUP BY ReserveDate__c, Image_Assistant__r.Name`;
  const assistantData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: assistantSoql,
  });
  
  (assistantData.records || []).forEach((rec) => {
    const rawName = rec.person || rec.Image_Assistant__r?.Name;
    const value = parseInt(rec.cnt || rec.expr0 || 0, 10);
    const date = rec.date || rec.ReserveDate__c;
    const cleanName = findNameInPath([rawName], validNamesMap);
    
    
    if (cleanName !== "Unknown") {
      ensureUser(cleanName);
      workloadMap[cleanName].report_entry += value;
      const dWorkload = ensureDailyUser(date, cleanName);
      if (dWorkload) dWorkload.report_entry += value;
    }
  });

  // 5. 備份手動填寫的欄位（tsmc_report），同步後恢復
  console.log(`[sync-stats] [SF API] 備份手動欄位 (tsmc_report)...`);
  const { data: existingRows } = await supabase
    .from("radiographer_workload")
    .select("radiographerName, tsmc_report")
    .eq("year", yearNum)
    .eq("month", monthNum);
  const manualFieldsMap = {};
  (existingRows || []).forEach((r) => {
    manualFieldsMap[r.radiographerName] = {
      tsmc_report: r.tsmc_report ?? null,
    };
  });

  console.log(
    `[sync-stats] [SF API] 正在清理 Supabase 舊資料 (${yearNum}/${monthNum})...`,
  );
  await supabase
    .from("radiographer_workload")
    .delete()
    .eq("year", yearNum)
    .eq("month", monthNum);

  // round2 MR 相關欄位，並恢復手動欄位
  const updates = Object.values(workloadMap).map((w) => ({
    ...w,
    mr: Math.round(w.mr),
    mr_large_male: round2(w.mr_large_male),
    mr_large_female: round2(w.mr_large_female),
    mr_medium: round2(w.mr_medium),
    mr_small: round2(w.mr_small),
    mr_teaching: Math.round(w.mr_teaching),
    mr_large_male_teaching: round2(w.mr_large_male_teaching),
    mr_large_female_teaching: round2(w.mr_large_female_teaching),
    mr_medium_teaching: round2(w.mr_medium_teaching),
    mr_small_teaching: round2(w.mr_small_teaching),
    // 恢復手動填寫的值，不讓同步覆蓋
    tsmc_report: manualFieldsMap[w.radiographerName]?.tsmc_report ?? null,
  }));

  console.log(`[sync-stats] [SF API] 正在寫入 ${updates.length} 筆最新資料...`);
  const { error } = await supabase
    .from("radiographer_workload")
    .insert(updates);
  if (error) throw error;
  
  // 寫入每日明細
  const minDate = startDate < reportStartDate ? startDate : reportStartDate;
  const maxDate = endDate > reportEndDate ? endDate : reportEndDate;
  console.log(`[sync-stats] [SF API] 正在清理每日明細舊資料 (${minDate} ~ ${maxDate})...`);
  await supabase
    .from("radiographer_daily_workload")
    .delete()
    .gte("date", minDate)
    .lte("date", maxDate);

  const dailyUpdates = [];
  Object.values(dailyWorkloadMap).forEach(usersMap => {
    Object.values(usersMap).forEach(w => {
        const cleanW = { ...w };
        // Remove teaching columns as they don't exist in radiographer_daily_workload
        Object.keys(cleanW).forEach(k => {
          if (k.endsWith('_teaching')) {
            delete cleanW[k];
          }
        });
        dailyUpdates.push({
            ...cleanW,
            mr: Math.round(w.mr),
            mr_large_male: round2(w.mr_large_male),
            mr_large_female: round2(w.mr_large_female),
            mr_medium: round2(w.mr_medium),
            mr_small: round2(w.mr_small)
        });
    });
  });

  if (dailyUpdates.length > 0) {
    console.log(`[sync-stats] [SF API] 正在寫入 ${dailyUpdates.length} 筆每日明細資料...`);
    // 分批寫入避免 payload 過大
    for (let i = 0; i < dailyUpdates.length; i += 100) {
      const batch = dailyUpdates.slice(i, i + 100);
      const { error: dailyErr } = await supabase
        .from("radiographer_daily_workload")
        .insert(batch);
      if (dailyErr) console.error("[sync-stats] [SF API] 每日明細寫入失敗:", dailyErr);
    }
  }

  console.log(`[sync-stats] [SF API] ✅ 同步成功！`);
}

// --- [1/3] 每日統計 (醫令數與客戶量) ---
async function syncPhysicianWorkload(session, startDate, endDate) {
  console.log(
    `\n[sync-stats] [3/3] 同步影像醫師工作量分類：${startDate} ~ ${endDate}`,
  );

  const soql = `
      SELECT 
        Image_assignment__r.Name, 
        Order__r.Image_assignment__r.Name,
        Order__c,
        MedicalRecordNo__c,
        Image_Report__c, 
        ResourceCategory__c, 
        CheckupName__c,
        CheckStartDate__c,
        Location__c
      FROM CheckupReservation__c 
      WHERE CheckStartDate__c >= ${startDate}
        AND CheckStartDate__c <= ${endDate}
        AND Checkup_Status__c = '10'
        AND (Location__c LIKE '北投%' OR Location__c LIKE '大直%')
  `.trim();

  const result = await runSoqlQuery({ ...session, soql });
  const records = result.records || [];
  console.log(
    `[sync-stats] 🔍 雲端原始抓取到 ${records.length} 筆項次 (進行客戶/醫師分類解析...)`,
  );

  // --- 前置：從 Supabase 撈遠班排班，建立「日期 → 遠班醫師名稱 Set」對應表 ---
  // 大直院區的預約在 Salesforce 不記錄判讀醫師，需從排班系統補齊
  const { data: doctorShiftsData } = await supabase
    .from("doctor_shifts")
    .select("date, doctor_id, station")
    .gte("date", startDate)
    .lte("date", endDate)
    .or("station.eq.遠,station.eq.遠班,station.eq.遠距");

  const { data: doctorsData } = await supabase
    .from("doctors")
    .select("id, name");

  const doctorIdToName = {};
  (doctorsData || []).forEach((d) => {
    doctorIdToName[d.id] = d.name;
  });

  // { date: Set<doctorName> }
  const remoteDoctorsByDate = {};
  (doctorShiftsData || []).forEach((s) => {
    const docName = doctorIdToName[s.doctor_id];
    if (!docName) return;
    if (!remoteDoctorsByDate[s.date]) remoteDoctorsByDate[s.date] = new Set();
    remoteDoctorsByDate[s.date].add(docName);
  });
  console.log(
    `[sync-stats] 📅 從排班表取得 ${Object.keys(remoteDoctorsByDate).length} 天的遠班醫師資料，用於補充大直判讀量。`,
  );

  // 第一階段：依照 日期 -> 醫令 (Order) 進行彙整，判斷該客戶的套裝類別
  const orderWorkload = {}; // { date: { orderId: { mrCount, hasSpecialCT, location, doctors: Set } } }

  records.forEach((r) => {
    const date = r.CheckStartDate__c;
    const orderId = r.Order__c;
    if (!orderId) return;

    if (!orderWorkload[date]) orderWorkload[date] = {};
    if (!orderWorkload[date][orderId]) {
      // patientKey: 病歷號優先，否則用醫令號（同一客戶不同院區的聯結鍵）
      const patientKey = (r.MedicalRecordNo__c || orderId).trim();
      orderWorkload[date][orderId] = {
        mrCount: 0,
        hasSpecialCT: false,
        location: (r.Location__c || "").trim(),
        doctors: new Set(),
        patientKey,
      };
    }

    const item = orderWorkload[date][orderId];
    const name = (r.CheckupName__c || "").toUpperCase();
    const cat = (r.ResourceCategory__c || "").toUpperCase();

    // 統計該 Order 下的 MR 數量
    if (cat === "MR") item.mrCount++;

    // 判斷該 Order 是否含有低劑量或 CTA
    if (
      name.includes("低劑量") ||
      name.includes("CTA") ||
      name.includes("顯影")
    ) {
      item.hasSpecialCT = true;
    }

    // 取得該 Order 關聯的醫師 (去重)
    let docName =
      r.Image_assignment__r?.Name ||
      r.Order__r?.Image_assignment__r?.Name ||
      r.Image_Report__c ||
      "";
    docName = docName.trim();
    if (docName && !docName.includes("<a") && docName !== "登打") {
      item.doctors.add(docName);
    }
  });

  // 第一階段後：建立「北投客戶鍵 Set」供大直重疊判斷使用
  // { date: Set<patientKey> } - 記錄當天有北投預約的病歷號
  const beitouPatientsByDate = {};
  Object.entries(orderWorkload).forEach(([date, orders]) => {
    Object.values(orders).forEach((data) => {
      if (data.location.slice(0, 2) === "北投") {
        if (!beitouPatientsByDate[date]) beitouPatientsByDate[date] = new Set();
        beitouPatientsByDate[date].add(data.patientKey);
      }
    });
  });

  // 第二階段：依照 醫師 進行統計 (計算該醫師負責了多少個 大套/小套 客戶)
  const doctorStats = {}; // { date: { docName: { categories: {}, totalMR: 0 } } }

  Object.entries(orderWorkload).forEach(([date, orders]) => {
    if (!doctorStats[date]) doctorStats[date] = {};

    Object.values(orders).forEach((data) => {
      const { mrCount, hasSpecialCT, location: rawLocation, doctors, patientKey } = data;
      const location = rawLocation.slice(0, 2); // 統一取前兩字：北投、大直
      let category = "";

      // 套裝規則分類 (以 Order 為單位) - 僅限北投
      if (location === "北投") {
        if (mrCount >= 6 && hasSpecialCT) {
          category = "大套5";
        } else if (mrCount >= 1 && mrCount <= 5 && hasSpecialCT) {
          category = "小套4";
        } else if (mrCount >= 1 && mrCount <= 5 && !hasSpecialCT) {
          category = "小套3";
        } else if (mrCount === 0 && hasSpecialCT) {
          category = "無2";
        } else if (mrCount === 0 && !hasSpecialCT) {
          category = "無1";
        } else if (mrCount >= 6 && !hasSpecialCT) {
          category = "大套5(無特檢)";
        }
      } else if (location === "大直") {
        // 大直：若同一客戶當天在北投也有預約 → 重疊，不計入大直1
        const isBeitouOverlap = beitouPatientsByDate[date]?.has(patientKey) ?? false;
        if (!isBeitouOverlap) {
          category = "大直1";
        }
      }

      // 大直：若 Salesforce 記錄上沒有醫師名字，改用當天遠班醫師（來自排班系統）
      const effectiveDoctors =
        location === "大直" && doctors.size === 0
          ? (remoteDoctorsByDate[date] || new Set())
          : doctors;

      effectiveDoctors.forEach((doc) => {
        if (!doctorStats[date][doc]) {
          doctorStats[date][doc] = { categories: {}, totalMR: 0 };
        }
        const s = doctorStats[date][doc];
        s.totalMR += mrCount; // 醫師當天判讀的總 MR 醫令數
        if (category) {
          s.categories[category] = (s.categories[category] || 0) + 1;
        }
      });
    });
  });

  const updates = [];
  Object.entries(doctorStats).forEach(([date, docs]) => {
    Object.entries(docs).forEach(([name, stats]) => {
      // 將分類統計轉換為字串，例如 "大套5:3, 小套4:1"
      const categorySummary = Object.entries(stats.categories)
        .map(([cat, count]) => `${cat}:${count}`)
        .join(", ");

      updates.push({
        date,
        doctor_name: name,
        mr_count: stats.totalMR,
        has_special_ct: categorySummary.includes("套"),
        category: categorySummary,
        count_da_tao_5: stats.categories["大套5"] || 0,
        count_xiao_tao_4: stats.categories["小套4"] || 0,
        count_xiao_tao_3: stats.categories["小套3"] || 0,
        count_wu_2: stats.categories["無2"] || 0,
        count_wu_1: stats.categories["無1"] || 0,
        count_dazhi_1: stats.categories["大直1"] || 0,
        updated_at: new Date().toISOString(),
      });
    });
  });

  if (updates.length > 0) {
    console.log(
      `[sync-stats] 📝 正在寫入 ${updates.length} 筆影像醫師工作量數據 (以客戶為單位)...`,
    );
    const { error } = await supabase
      .from("physician_workload_daily")
      .upsert(updates, { onConflict: "date,doctor_name" });

    if (error) {
      console.warn(
        `[sync-stats] ⚠️ 寫入失敗 (請確認資料表 'physician_workload_daily' 是否已建立或欄位是否正確):`,
        error.message,
      );
    } else {
      console.log(`[sync-stats] ✅ 影像醫師工作量同步完成！`);
    }
  }
}

// --- 主函式：供 Web 與 CLI 共同呼叫 ---
export async function syncWorkloadForWeb(
  startDate,
  endDate,
  reportStartDate,
  reportEndDate,
) {
  const session = await getSalesforceSession();
  await syncDailyStats(session, startDate, endDate);
  await syncRadiographerWorkload(
    session,
    startDate,
    endDate,
    reportStartDate,
    reportEndDate,
  );
  await syncPhysicianWorkload(session, startDate, endDate);
}

// --- CLI 執行邏輯 ---
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const askQuestion = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const ensureIsoDate = (dateStr) => {
    const parts = dateStr.split(/[-/]/);
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  };

  const askDate = async (label, defaultVal) => {
    const input = await askQuestion(`  📅 ${label} (預設 ${defaultVal}): `);
    return ensureIsoDate(input.trim() || defaultVal);
  };

  const askYesNo = async (label) => {
    const input = await askQuestion(`${label} [Y/n]: `);
    return input.trim().toLowerCase() !== "n";
  };

  (async () => {
    console.log("\n--- 🏥 Salesforce → Supabase 同步工具 (CLI 版) ---\n");

    const today = new Date();
    const todayStr = formatDate(today);

    let session;
    try {
      session = await getSalesforceSession();
    } catch (err) {
      console.error(
        `\n❌ 無法取得 Salesforce 連線憑證 (可能為網路超時或伺服器無回應): ${err.message}`,
      );
      rl.close();
      process.exit(1);
    }

    // --- [自動排程/遠端觸發] 偵測到環境變數時，自動執行指定區塊 ---
    if (process.env.SYNC_PAYLOAD || process.env.SYNC_BLOCKS) {
      try {
        let tasks = [];
        if (process.env.SYNC_PAYLOAD) {
          tasks = JSON.parse(process.env.SYNC_PAYLOAD);
        } else {
          console.log(
            "\n[自動排程] 使用舊版 SYNC_BLOCKS 參數，轉換為預設任務...",
          );
          const blocks = process.env.SYNC_BLOCKS.split(",").map(Number);
          if (blocks.includes(1)) tasks.push({ id: 1, selected: true });
          if (blocks.includes(2)) tasks.push({ id: 2, selected: true });
          if (blocks.includes(3)) tasks.push({ id: 3, selected: true });
        }

        console.log(`\n[自動排程/遠端觸發] 接收到同步任務，開始執行...`);

        for (const task of tasks) {
          if (!task.selected) continue;

          if (task.id === 1) {
            const end1 = new Date(today);
            end1.setDate(today.getDate() + 30);
            await syncDailyStats(
              session,
              task.start || todayStr,
              task.end || formatDate(end1),
            );
          }
          if (task.id === 2) {
            const y = today.getFullYear();
            const mo = today.getMonth() + 1;
            const firstDay = `${y}-${String(mo).padStart(2, "0")}-01`;
            const lastDay = formatDate(new Date(y, mo, 0));
            let prevY = y;
            let prevMo = mo - 1;
            if (prevMo === 0) {
              prevMo = 12;
              prevY--;
            }
            const rs = `${prevY}-${String(prevMo).padStart(2, "0")}-26`;
            const re = `${y}-${String(mo).padStart(2, "0")}-25`;

            await syncRadiographerWorkload(
              session,
              task.start || firstDay,
              task.end || lastDay,
              task.reportStart || rs,
              task.reportEnd || re,
              task.targetMonth || null
            );
          }
          if (task.id === 3) {
            const end3 = new Date(today);
            end3.setDate(today.getDate() + 5);
            await syncPhysicianWorkload(
              session,
              task.start || todayStr,
              task.end || formatDate(end3),
            );
          }
        }
        rl.close();
        console.log("\n✨ 自動排程同步作業已順利完成！");
        process.exit(0);
      } catch (err) {
        console.error("\n❌ 自動排程執行失敗:", err);
        rl.close();
        process.exit(1);
      }
      return; // 結束執行
    }

    // ─── [1/3] 每日統計 ───────────────────────────────────────────
    console.log("\n--- [1/3] 每日統計 (醫令數與客戶量) ---");
    const doBlock1 = await askYesNo("要同步此區塊嗎？");
    if (doBlock1) {
      const fiveDaysLater = new Date(today);
      fiveDaysLater.setDate(today.getDate() + 30);
      const defaultEnd1 = formatDate(fiveDaysLater);

      const s1 = await askDate("開始日期", todayStr);
      const e1 = await askDate("結束日期", defaultEnd1);

      try {
        await syncDailyStats(session, s1, e1);
      } catch (err) {
        console.error("\n❌ [1/3] 執行失敗:", err);
      }
    } else {
      console.log("  ⏭️  已略過。");
    }

    // ─── [2/3] 放射師工作量統計 ──────────────────────────────────
    console.log("\n--- [2/3] 放射師工作量統計 ---");
    const doBlock2 = await askYesNo("要同步此區塊嗎？");
    if (doBlock2) {
      // 預設：本月 (第一天到最後一天)
      const y = today.getFullYear();
      const mo = today.getMonth() + 1;
      const firstDay = `${y}-${String(mo).padStart(2, "0")}-01`;
      const lastDay = formatDate(new Date(y, mo, 0)); // month 0-indexed trick

      // 報告校對預設：上個月26號 ~ 本月25號
      let prevY = y;
      let prevMo = mo - 1;
      if (prevMo === 0) {
        prevMo = 12;
        prevY--;
      }
      const defaultReportStart = `${prevY}-${String(prevMo).padStart(2, "0")}-26`;
      const defaultReportEnd = `${y}-${String(mo).padStart(2, "0")}-25`;

      console.log(`  (各檢查量預設：本月 ${firstDay} ~ ${lastDay})`);
      console.log(
        `  (影像報告校對預設：${defaultReportStart} ~ ${defaultReportEnd})`,
      );

      const s2 = await askDate("各檢查量開始日期", firstDay);
      const e2 = await askDate("各檢查量結束日期", lastDay);
      const rs2 = await askDate("影像報告校對開始日期", defaultReportStart);
      const re2 = await askDate("影像報告校對結束日期", defaultReportEnd);

      try {
        await syncRadiographerWorkload(session, s2, e2, rs2, re2, s2);
      } catch (err) {
        console.error("\n❌ [2/3] 執行失敗:", err);
      }
    } else {
      console.log("  ⏭️  已略過。");
    }

    // ─── [3/3] 影像醫師工作量分類 ────────────────────────────────
    console.log("\n--- [3/3] 影像醫師工作量分類 (大套/小套) ---");
    const doBlock3 = await askYesNo("要同步此區塊嗎？");
    if (doBlock3) {
      const fiveDaysLater = new Date(today);
      fiveDaysLater.setDate(today.getDate() + 5);
      const defaultEnd3 = formatDate(fiveDaysLater);

      const s3 = await askDate("開始日期", todayStr);
      const e3 = await askDate("結束日期", defaultEnd3);

      try {
        await syncPhysicianWorkload(session, s3, e3);
      } catch (err) {
        console.error("\n❌ [3/3] 執行失敗:", err);
      }
    } else {
      console.log("  ⏭️  已略過。");
    }

    rl.close();
    console.log("\n✨ 所有選擇的同步作業已完成！");
    process.exit(0);
  })();
}
