import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
import readline from "readline";
import { fileURLToPath } from "url";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- [1/2] 每日統計 (醫令數與客戶量) ---
async function syncDailyStats(session, startDate, endDate) {
  console.log(`\n[sync-stats] [1/2] 同步每日統計：${startDate} ~ ${endDate}`);

  // 一次性抓取整個區間的資料，取代原本跑 31 次報表的低效做法
  const soql = `
      SELECT CheckupName__c, Location__c, Order__c, CheckStartDate__c
      FROM CheckupReservation__c 
      WHERE (Location__c = '北投' OR Location__c = '大直')
        AND CheckStartDate__c >= ${startDate}
        AND CheckStartDate__c <= ${endDate}
      ORDER BY CheckStartDate__c ASC
  `.trim();

  const result = await runSoqlQuery({ ...session, soql });
  console.log(
    `[sync-stats] 📦 成功從雲端抓取 ${result.records.length} 筆原始項次。`,
  );

  const dailyResults = {};
  const seenMR = new Set();

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
  });

  result.records.forEach((r) => {
    const date = r.CheckStartDate__c;
    const loc = r.Location__c;
    const name = r.CheckupName__c || "";
    const orderId = r.Order__c;

    if (!dailyResults[date]) dailyResults[date] = initStats();
    const stats = dailyResults[date];

    if (loc === "北投") {
      if (name === "體檢總評") stats.beitou_clients++;
      if (name === "大腸鏡檢查") stats.beitou_gi++;
      if (name.includes("電腦斷層(顯影)")) stats.beitou_cta++;
      if (name.includes("磁振造影") || name.includes("MR")) {
        stats.beitou_mr_orders++;
        const mrKey = `${date}_${orderId}`;
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
      if (name === "血壓") stats.dazhi_clients++;
      if (name === "大腸鏡檢查") stats.dazhi_gi++;
      if (name === "營養門診(30)") stats.dazhi_metabolism_clients++;
      if (name.includes("超音波")) {
        stats.dazhi_ultrasound++;
        if (name.includes("心臟")) stats.dazhi_ultrasound_heart++;
        if (name.includes("肝纖維")) stats.dazhi_ultrasound_fibrosis++;
      }
    }
  });

  if (Object.keys(dailyResults).length === 0) {
    console.log("[sync-stats] ⚠️ 此區間內沒有查獲任何每日統計數據。");
    return;
  }

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

// --- [2/2] 放射師工作量統計 ---
// --- 放射師工作量統計 ---
// --- 放射師工作量統計 ---
async function syncRadiographerWorkload(
  session,
  startDate,
  endDate,
  reportStartDate,
  reportEndDate,
) {
  console.log(
    `\n[sync-stats] [2/2] 同步放射師工作量：檢查量 ${startDate} ~ ${endDate}；報告/校對 ${reportStartDate} ~ ${reportEndDate}`,
    `\n[sync-stats] 同步放射師工作量：檢查量 ${startDate} ~ ${endDate}；報告/校對 ${reportStartDate} ~ ${reportEndDate}`,
  );
  console.log(`[sync-stats] [SF API] 開始同步 (API 模式)...`);

  const { data: usersData } = await supabase
    .from("users")
    .select("name, alias")
    .eq("is_radiographer", true)
    .eq("is_part_time", false);
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

  const [year, month] = endDate.split("-");
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const dateStr = `${year}-${month}`;

  const workloadMap = {};
  usersData.forEach((u) => {
    workloadMap[u.name] = {
      radiographerName: u.name,
      year: yearNum,
      month: monthNum,
      mr: 0,
      us: 0,
      ct: 0,
      dx: 0,
      mg: 0,
      bmd: 0,
      ctaPostProcessing: 0,
      reportEntry: 0,
      imageProofing: 0,
    };
  });

  // 1. 各檢查量 (捨棄 00O2t 報表，改用 SOQL)
  console.log(
    `[sync-stats]   - [SOQL] 正在查詢 '各檢查量' (CheckupReservation__c)...`,
  );
  const checkupSoql = `SELECT Radiologist__r.Name person, ResourceCategory__c category, COUNT(Id) cnt 
                       FROM CheckupReservation__c 
                       WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                       AND Radiologist__c != null 
                       AND ResourceCategory__c IN ('MR','CT','US','BMD','MG','DX') 
                       AND (NOT Name LIKE '%報到%') 
                       AND Checkup_Status__c = '10' 
                       GROUP BY Radiologist__r.Name, ResourceCategory__c`;
  const checkupData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: checkupSoql,
  });
  (checkupData.records || []).forEach((rec) => {
    const rawName = rec.person || rec.Radiologist__r?.Name;
    const category = (
      rec.category ||
      rec.ResourceCategory__c ||
      ""
    ).toLowerCase();
    const count = parseInt(rec.cnt || rec.expr0 || 0, 10);
    const cleanName = findNameInPath([rawName], validNamesMap);
    if (cleanName !== "Unknown" && workloadMap[cleanName]) {
      if (category === "mr") workloadMap[cleanName].mr += count;
      if (category === "us") workloadMap[cleanName].us += count;
      if (category === "ct") workloadMap[cleanName].ct += count;
      if (category === "dx") workloadMap[cleanName].dx += count;
      if (category === "mg") workloadMap[cleanName].mg += count;
      if (category === "bmd") workloadMap[cleanName].bmd += count;
    }
  });

  // 2. CTA後處理
  console.log(
    `[sync-stats]   - [SOQL] 正在查詢 'CTA後處理' (CheckupReservation__c)...`,
  );
  const ctaSoql = `SELECT Radiologist__r.Name person, COUNT_DISTINCT(Order__c) cnt 
                   FROM CheckupReservation__c 
                   WHERE (Order__r.ReserveDate__c >= ${startDate} AND Order__r.ReserveDate__c <= ${endDate}) 
                   AND Radiologist__c != null 
                   AND Checkup_Status__c = '10'
                   AND CTAUseTime__c != null 
                   GROUP BY Radiologist__r.Name`;
  const ctaData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: ctaSoql,
  });
  (ctaData.records || []).forEach((rec) => {
    const rawName = rec.person || rec.Radiologist__r?.Name;
    const cleanName = findNameInPath([rawName], validNamesMap);
    if (cleanName !== "Unknown" && workloadMap[cleanName]) {
      workloadMap[cleanName].ctaPostProcessing += parseInt(rec.cnt || 0, 10);
    }
  });

  // 3. 影像校對
  console.log(`[sync-stats]   - [SOQL] 正在查詢 '影像校對' (Order__c)...`);
  const proofingSoql = `SELECT Image_Proofreader__r.Name person, COUNT(Id) cnt 
                        FROM Order__c 
                        WHERE (ReserveDate__c >= ${reportStartDate} AND ReserveDate__c <= ${reportEndDate}) 
                        AND Image_Proofreader__c != null 
                        GROUP BY Image_Proofreader__r.Name`;
  const proofingData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: proofingSoql,
  });
  (proofingData.records || []).forEach((rec) => {
    const rawName = rec.person || rec.Image_Proofreader__r?.Name;
    const value = parseInt(rec.cnt || rec.expr0 || 0, 10);
    const cleanName = findNameInPath([rawName], validNamesMap);
    if (cleanName !== "Unknown" && workloadMap[cleanName]) {
      workloadMap[cleanName].imageProofing += value;
    }
  });

  // 4. 影像報告登打 (使用 JS 記憶體分組法，避開字串無法 GROUP BY 的雷)
  console.log(
    `[sync-stats]   - [SOQL] 正在查詢 '影像報告登打' (CheckupReservation__c)...`,
  );
  const reportSoql = `SELECT Image_Report__c 
                      FROM CheckupReservation__c 
                      WHERE (Order__r.ReserveDate__c >= ${reportStartDate} AND Order__r.ReserveDate__c <= ${reportEndDate}) 
                      AND Image_Report__c != null`;
  const reportData = await runSoqlQuery({
    instanceUrl: session.instanceUrl,
    accessToken: session.accessToken,
    soql: reportSoql,
  });
  const reportStats = {};
  (reportData.records || []).forEach((rec) => {
    const rawText = (rec.Image_Report__c || "").trim();
    if (rawText) reportStats[rawText] = (reportStats[rawText] || 0) + 1;
  });
  Object.entries(reportStats).forEach(([rawName, value]) => {
    const cleanName = findNameInPath([rawName], validNamesMap);
    if (cleanName !== "Unknown" && workloadMap[cleanName]) {
      workloadMap[cleanName].reportEntry += value;
    }
  });

  // 寫入 Supabase
  console.log(
    `[sync-stats] [SF API] 正在清理 Supabase 舊資料 (${yearNum}/${monthNum})...`,
  );
  await supabase
    .from("radiographer_workload")
    .delete()
    .eq("year", yearNum)
    .eq("month", monthNum);

  const updates = Object.values(workloadMap);
  console.log(`[sync-stats] [SF API] 正在寫入 ${updates.length} 筆最新資料...`);
  const { error } = await supabase
    .from("radiographer_workload")
    .insert(updates);
  if (error) throw error;
  console.log(`[sync-stats] [SF API] ✅ 同步成功！`);
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

  (async () => {
    console.log("\n--- 🏥 Salesforce 數據同步工具 (CLI 版) ---");
    console.log("\n--- 🏥 放射師工作量同步工具 (CLI 版) ---");

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(currentYear, today.getMonth() + 1, 0).getDate();

    let startDate = await askQuestion(
      `📅 請輸入一般區間開始日期 (預設 ${currentYear}-${currentMonth}-01): `,
    );
    if (!startDate) startDate = `${currentYear}-${currentMonth}-01`;

    let endDate = await askQuestion(
      `📅 請輸入一般區間結束日期 (預設 ${currentYear}-${currentMonth}-${String(lastDay).padStart(2, "0")}): `,
    );
    if (!endDate)
      endDate = `${currentYear}-${currentMonth}-${String(lastDay).padStart(2, "0")}`;

    // 自動推算報告區間
    const [sY, sM] = startDate.split("-");
    let prevM = parseInt(sM, 10) - 1;
    let prevY = parseInt(sY, 10);
    if (prevM === 0) {
      prevM = 12;
      prevY--;
    }

    let reportStartDate = await askQuestion(
      `📅 請輸入報告校對開始日期 (預設 ${prevY}-${String(prevM).padStart(2, "0")}-26): `,
    );
    if (!reportStartDate)
      reportStartDate = `${prevY}-${String(prevM).padStart(2, "0")}-26`;

    let reportEndDate = await askQuestion(
      `📅 請輸入報告校對結束日期 (預設 ${sY}-${sM}-25): `,
    );
    if (!reportEndDate) reportEndDate = `${sY}-${sM}-25`;

    rl.close();
    console.log(`\n🚀 準備同步...`);

    try {
      await syncWorkloadForWeb(
        startDate,
        endDate,
        reportStartDate,
        reportEndDate,
      );
      console.log("\n✨ 所有同步作業已順利完成！");
      process.exit(0);
    } catch (err) {
      console.error("\n❌ 執行失敗:", err);
      process.exit(1);
    }
  })();
}
