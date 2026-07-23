import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
import readline from "readline";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("缺少 Supabase 環境變數");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const askQuestion = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

// 取得該月份的第一天與最後一天 (格式: YYYY-MM-DD)
function getGeneralRange(yearStr, monthStr) {
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

// 取得報告區間 (上月 26 號至本月 25 號)
function getReportRange(yearStr, monthStr) {
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);

  // 計算上個月
  let prevY = y;
  let prevM = m - 1;
  if (prevM === 0) {
    prevM = 12;
    prevY--;
  }

  const startDate = `${prevY}-${String(prevM).padStart(2, "0")}-26`;
  const endDate = `${y}-${String(m).padStart(2, "0")}-25`;
  return { startDate, endDate };
}

async function syncAllWorkloads() {
  console.log(`\n🚀 開始同步放射師工作量與影像校對量...`);

  try {
    let input = await askQuestion(
      "📅 請輸入目標月份 (例如 2026-04 或 2026/04，留空則為本月): ",
    );
    let targetYear, targetMonth;
    let generalRange, reportRange;

    if (input) {
      const parts = input.split(/[-/]/);
      if (parts.length === 2) {
        targetYear = parseInt(parts[0], 10);
        targetMonth = parseInt(parts[1], 10);
      } else if (input.length === 6) {
        targetYear = parseInt(input.substring(0, 4), 10);
        targetMonth = parseInt(input.substring(4, 6), 10);
      }
    } else {
      targetYear = new Date().getFullYear();
      targetMonth = new Date().getMonth() + 1;
    }

    if (!targetYear || !targetMonth || targetMonth > 12) {
      throw new Error("日期格式輸入錯誤，請使用 YYYY-MM 格式");
    }

    generalRange = getGeneralRange(targetYear, targetMonth);
    reportRange = getReportRange(targetYear, targetMonth);

    const session = await getSalesforceSession();
    console.log("✅ Salesforce 認證成功。");

    // 建立 Supabase 人員名單對應 (因為 SOQL 返回的可能是別名或全名)
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, alias, learning_capabilities")
      .eq("is_radiographer", true)
      .eq("is_part_time", false);

    const validNamesMap = {};
    if (usersData) {
      usersData.forEach((u) => {
        validNamesMap[u.name.trim()] = u.name.trim();
        if (u.alias) validNamesMap[u.alias.trim()] = u.name.trim();
      });
    }

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

    const masterData = {}; // 以姓名為 Key
    if (usersData) {
      usersData.forEach((u) => {
        masterData[u.name] = {
          mr: 0,
          mrLargeMale: 0,
          mrLargeFemale: 0,
          mrMedium: 0,
          mrSmall: 0,
          us: 0,
          usA: 0,
          usBreast: 0,
          usHeart: 0,
          usThy: 0,
          usCCA: 0,
          usNeck: 0,
          usPelvisFemale: 0,
          usPelvisMale: 0,
          usFibrosis: 0,
          ct: 0,
          dx: 0,
          mg: 0,
          bmd: 0,
        mr_teaching: 0,
        us_teaching: 0,
        ct_teaching: 0,
        bmd_teaching: 0,
          proofreading: 0,
        };
      });
    }

    const ensureUser = (name) => {
      if (!masterData[name])
        masterData[name] = {
          mr: 0,
          mrLargeMale: 0,
          mrLargeFemale: 0,
          mrMedium: 0,
          mrSmall: 0,
          us: 0,
          usA: 0,
          usBreast: 0,
          usHeart: 0,
          usThy: 0,
          usCCA: 0,
          usNeck: 0,
          usPelvisFemale: 0,
          usPelvisMale: 0,
          ct: 0,
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
        us_fibrosis_teaching: 0,
        ct_teaching: 0,
        cta_teaching: 0,
        dx_teaching: 0,
        mg_teaching: 0,
        bmd_teaching: 0,
          proofreading: 0,
        };
      if (!masterData[name].usFibrosis) {
        masterData[name].usFibrosis = 0;
        masterData[name].us_fibrosis_teaching = 0;
      }
    };

    const normalizeCheckupName = (name = "") =>
      String(name || "")
        .trim()
        .toLowerCase();

    // MR 子分類：依同一 Order 的 MR 醫令數量決定大/中/小，性別從 Order__r.Gender__c
    // 大套 (≥7 項)：mrLargeMale / mrLargeFemale
    // 中套 (4-6 項)：mrMedium
    // 小套 (1-3 項)：mrSmall
    const classifyMrByOrderCount = (count, gender) => {
      if (count >= 7) {
        return gender === "女" || gender === "F" ? "mrLargeFemale" : "mrLargeMale";
      } else if (count >= 4) {
        return "mrMedium";
      } else {
        return "mrSmall";
      }
    };

    const parseUsSubtype = (name = "") => {
      const value = normalizeCheckupName(name);
      if (value.includes("肝纖維") || value.includes("fibro")) return "usFibrosis";
      if (
        value.includes("p女") ||
        (value.includes("骨盆") && value.includes("女")) ||
        value.includes("婦科")
      )
        return "usPelvisFemale";
      if (
        value.includes("p男") ||
        (value.includes("骨盆") && value.includes("男"))
      )
        return "usPelvisMale";
      if (value.includes("breast") || value.includes("乳房")) return "usBreast";
      if (value.includes("心臟") || value.includes("心")) return "usHeart";
      if (value.includes("thy") || value.includes("甲狀")) return "usThy";
      if (value.includes("cca") || value.includes("頸動脈")) return "usCCA";
      if (value.includes("neck") || value.includes("頸部") || value.includes("頸")) return "usNeck";
      if (value.includes("上腹")) return "usA";
      return null;
    };

    // 1a. 抓取非 MR 儀器工作量 (CT/US/BMD/MG/DX，可以 GROUP BY)
    console.log(
      `📊 正在抓取儀器工作量 (${generalRange.startDate} ~ ${generalRange.endDate})...`,
    );
    const nonMrSoql = `SELECT Radiologist__r.Name person, ResourceCategory__c category, CheckupName__c checkupName, COUNT(Id) cnt 
                       FROM CheckupReservation__c 
                       WHERE (Order__r.ReserveDate__c >= ${generalRange.startDate} AND Order__r.ReserveDate__c <= ${generalRange.endDate}) 
                       AND Radiologist__c != null 
                       AND ResourceCategory__c IN ('CT','US','BMD','MG','DX') 
                       AND (NOT Name LIKE '%報到%') 
                       AND Checkup_Status__c != '90' 
                       GROUP BY Radiologist__r.Name, ResourceCategory__c, CheckupName__c`;

    const nonMrData = await runSoqlQuery({ ...session, soql: nonMrSoql });
    (nonMrData.records || []).forEach((rec) => {
      const rawName = rec.person || rec.Radiologist__r?.Name;
      const category = (rec.category || rec.ResourceCategory__c || "").toLowerCase();
      const count = parseInt(rec.cnt || rec.expr0 || 0, 10);
      const checkupName = rec.checkupName || rec.CheckupName__c || "";
      const cleanName = findNameInPath([rawName], validNamesMap);
      const nameToUse = cleanName !== "Unknown" ? cleanName : rawName;
      if (!nameToUse) return;

      ensureUser(nameToUse);

      if (category === "us") {
        masterData[nameToUse].us += count;
        const subtype = parseUsSubtype(checkupName);
        if (subtype) masterData[nameToUse][subtype] += count;
      }
      if (category === "ct") masterData[nameToUse].ct += count;
      if (category === "dx") masterData[nameToUse].dx += count;
      if (category === "mg") masterData[nameToUse].mg += count;
      if (category === "bmd") masterData[nameToUse].bmd += count;
    });

    // 1b. 抓取 MR 工作量：逐筆拿，在 JS 側依 Order 的醫令數量分大/中/小
    console.log(`📊 正在抓取 MR 工作量並分析套別...`);
    const mrSoql = `SELECT Radiologist__r.Name, Order__c, Order__r.ReserveDate__c, Order__r.Gender__c 
                    FROM CheckupReservation__c 
                    WHERE (Order__r.ReserveDate__c >= ${generalRange.startDate} AND Order__r.ReserveDate__c <= ${generalRange.endDate}) 
                    AND Radiologist__c != null 
                    AND ResourceCategory__c = 'MR' 
                    AND (NOT Name LIKE '%報到%') 
                    AND Checkup_Status__c != '90'`;

    const mrData = await runSoqlQuery({ ...session, soql: mrSoql });

    // 先 group by Order__c → 計算每張 Order 的 MR 數量、性別、各放射師醫令數
    const mrOrderMap = {};
    (mrData.records || []).forEach((rec) => {
      const orderId = rec.Order__c;
      const gender = rec.Order__r?.Gender__c || "";
      const radiologist = rec.Radiologist__r?.Name;
      if (!orderId) return;
      if (!mrOrderMap[orderId]) {
        mrOrderMap[orderId] = { count: 0, gender, radiologistCounts: {} };
      }
      mrOrderMap[orderId].count++;
      if (radiologist) {
        mrOrderMap[orderId].radiologistCounts[radiologist] =
          (mrOrderMap[orderId].radiologistCounts[radiologist] || 0) + 1;
      }
    });

    // 依 Order 的醫令數分類，各放射師按「個人醫令數 / Order 總醫令數」比例分配
    Object.values(mrOrderMap).forEach(({ count, gender, radiologistCounts }) => {
      const subtype = classifyMrByOrderCount(count, gender);
      Object.entries(radiologistCounts).forEach(([rawName, itemCount]) => {
        const ratio = itemCount / count;
        const cleanName = findNameInPath([rawName], validNamesMap);
        const nameToUse = cleanName !== "Unknown" ? cleanName : rawName;
        if (!nameToUse) return;
        ensureUser(nameToUse);
        masterData[nameToUse].mr += itemCount;
        masterData[nameToUse][subtype] += ratio;
      });
    });

    // 2. 抓取影像校對量 (報告區間: 上月26號 ~ 本月25號)
    console.log(
      ` 正在抓取影像校對量 (${reportRange.startDate} ~ ${reportRange.endDate})...`,
    );
    const proofingSoql = `SELECT Image_Proofreader__r.Name person, COUNT(Id) cnt 
                          FROM Order__c 
                          WHERE (ReserveDate__c >= ${reportRange.startDate} AND ReserveDate__c <= ${reportRange.endDate}) 
                          AND Image_Proofreader__c != null 
                          GROUP BY Image_Proofreader__r.Name`;

    const proofingData = await runSoqlQuery({ ...session, soql: proofingSoql });
    (proofingData.records || []).forEach((rec) => {
      const rawName = rec.person || rec.Image_Proofreader__r?.Name;
      const value = parseInt(rec.cnt || rec.expr0 || 0, 10);
      const cleanName = findNameInPath([rawName], validNamesMap);
      const nameToUse = cleanName !== "Unknown" ? cleanName : rawName;

      if (!nameToUse) return;

      ensureUser(nameToUse);
      masterData[nameToUse].proofreading += value;
    });

    console.log(
      `✅ 解析完成，準備更新 ${Object.keys(masterData).length} 位人員數據...`,
    );

    // --- 寫入 Supabase ---
    for (const name of Object.keys(masterData)) {
      const stats = masterData[name];

      // 先查詢現有資料
      const { data: existing } = await supabase
        .from("radiographer_workload")
        .select("*")
        .eq("year", targetYear)
        .eq("month", targetMonth)
        .eq("radiographerName", name)
        .single();

      const round2 = (n) => Math.round(n * 100) / 100;

      const payload = {
        year: targetYear,
        month: targetMonth,
        radiographerName: name,
        mr: round2(stats.mr),
        mr_large_male: round2(stats.mrLargeMale),
        mr_large_female: round2(stats.mrLargeFemale),
        mr_medium: round2(stats.mrMedium),
        mr_small: round2(stats.mrSmall),
        us: stats.us,
        us_a: stats.usA,
        us_breast: stats.usBreast,
        us_heart: stats.usHeart,
        us_thy: stats.usThy,
        us_cca: stats.usCCA,
        us_neck: stats.usNeck,
        us_pelvis_female: stats.usPelvisFemale,
        us_pelvis_male: stats.usPelvisMale,
        us_fibrosis: stats.usFibrosis,
        ct: stats.ct,
        dx: stats.dx,
        mg: stats.mg,
        bmd: stats.bmd,
        imageProofing: stats.proofreading,
      };

      if (existing) {
        await supabase
          .from("radiographer_workload")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await supabase.from("radiographer_workload").insert(payload);
      }
    }

    console.log(
      `\n🎉 同步成功！已更新 ${targetYear} 年 ${targetMonth} 月的工作量。`,
    );
  } catch (error) {
    console.error("❌ 同步失敗:", error.message);
  } finally {
    rl.close();
  }
}

syncAllWorkloads();
