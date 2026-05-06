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
  });

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

      if (name === "體檢總評") stats.beitou_clients++;
      if (name === "大腸鏡檢查") stats.beitou_gi++;
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
      // 大直客戶數：有超音波、X光或骨密檢查的客人才計算 (依據 Order 去重)
      const cat = (r.ResourceCategory__c || "").toUpperCase();
      const isClientTarget =
        name.includes("超音波") ||
        name.includes("X光") ||
        name.includes("骨密") ||
        ["US", "DX", "BMD"].includes(cat);

      if (isClientTarget) {
        const clientKey = `${date}_${clientId}`;
        if (!seenDazhiClient.has(clientKey)) {
          stats.dazhi_clients++;
          seenDazhiClient.add(clientKey);
          dazhiTargetOrders.add(clientKey); // 記錄大直目標客戶
        }
      }

      if (name === "大腸鏡檢查") stats.dazhi_gi++;
      if (name === "營養門診(30)") stats.dazhi_metabolism_clients++;
      if (name.includes("超音波")) {
        stats.dazhi_ultrasound++;
        if (name.includes("心臟")) stats.dazhi_ultrasound_heart++;
        if (name.includes("肝纖維")) stats.dazhi_ultrasound_fibrosis++;
      }
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

// --- [2/3] 放射師工作量統計 ---
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

  // 第一階段：依照 日期 -> 醫令 (Order) 進行彙整，判斷該客戶的套裝類別
  const orderWorkload = {}; // { date: { orderId: { mrCount, hasSpecialCT, location, doctors: Set } } }

  records.forEach((r) => {
    const date = r.CheckStartDate__c;
    const orderId = r.Order__c;
    if (!orderId) return;

    if (!orderWorkload[date]) orderWorkload[date] = {};
    if (!orderWorkload[date][orderId]) {
      orderWorkload[date][orderId] = {
        mrCount: 0,
        hasSpecialCT: false,
        location: (r.Location__c || "").trim(),
        doctors: new Set(),
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

  // 第二階段：依照 醫師 進行統計 (計算該醫師負責了多少個 大套/小套 客戶)
  const doctorStats = {}; // { date: { docName: { categories: {}, totalMR: 0 } } }

  Object.entries(orderWorkload).forEach(([date, orders]) => {
    if (!doctorStats[date]) doctorStats[date] = {};

    Object.values(orders).forEach((data) => {
      const { mrCount, hasSpecialCT, location: rawLocation, doctors } = data;
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
        // 大直客戶統一為「大直1」
        category = "大直1";
      }

      doctors.forEach((doc) => {
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
        await syncRadiographerWorkload(session, s2, e2, rs2, re2);
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
