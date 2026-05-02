import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getSalesforceSession } from './salesforce-utils.mjs';
import readline from 'readline';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('缺少 Supabase 環境變數');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 定義報表 ID
const REPORT_ID_WORKLOAD = '00O2t000000ueta';     // 影像個人工作報表 (儀器量)
const REPORT_ID_PROOFREADING = '00OTK000002o1HV'; // 影像校對報表

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// 取得該月份的第一天與最後一天 (格式: YYYY-MM-DD)
function getGeneralRange(yearStr, monthStr) {
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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

  const startDate = `${prevY}-${String(prevM).padStart(2, '0')}-26`;
  const endDate = `${y}-${String(m).padStart(2, '0')}-25`;
  return { startDate, endDate };
}

async function fetchReport(session, reportId, startDate, endDate, dateColumn = "CheckupReservation__c.Exam_Date__c") {
  const url = `${session.instanceUrl}/services/data/${session.apiVersion}/analytics/reports/${reportId}?includeDetails=false`;
  let fetchOptions = {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  };

  if (startDate && endDate) {
    fetchOptions.method = 'POST';
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify({
      reportMetadata: {
        standardDateFilter: {
          column: dateColumn,
          durationValue: "CUSTOM",
          startDate: startDate,
          endDate: endDate
        }
      }
    });
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json();
  if (!response.ok) throw new Error(`報表 ${reportId} 執行失敗: ${JSON.stringify(data)}`);
  return data;
}

async function syncAllWorkloads() {
  console.log(`\n🚀 開始同步放射師工作量與影像校對量...`);

  try {
    let input = await askQuestion('📅 請輸入目標月份 (例如 2026-04 或 2026/04，留空則為本月): ');
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
      throw new Error('日期格式輸入錯誤，請使用 YYYY-MM 格式');
    }

    generalRange = getGeneralRange(targetYear, targetMonth);
    reportRange = getReportRange(targetYear, targetMonth);

    const session = await getSalesforceSession();
    console.log('✅ Salesforce 認證成功。');

    // 1. 抓取儀器工作量 (標準月區間: 1號 ~ 月底)
    console.log(`📊 正在抓取儀器工作量 (${generalRange.startDate} ~ ${generalRange.endDate})...`);
    const workloadReport = await fetchReport(session, REPORT_ID_WORKLOAD, generalRange.startDate, generalRange.endDate, "CheckupReservation__c.Exam_Date__c");
    
    // 2. 抓取影像校對量 (報告區間: 上月26號 ~ 本月25號)
    console.log(`🔍 正在抓取影像校對量 (${reportRange.startDate} ~ ${reportRange.endDate})...`);
    const proofReport = await fetchReport(session, REPORT_ID_PROOFREADING, reportRange.startDate, reportRange.endDate, "Order__c.ReserveDate__c");

    const masterData = {}; // 以姓名為 Key

    // --- 解析儀器工作量 ---
    const wDown = workloadReport.groupingsDown.groupings;
    const wAcross = workloadReport.groupingsAcross.groupings;
    const wFact = workloadReport.factMap;

    wDown.forEach(row => {
      if (row.label === "-") return;
      const name = row.label;
      if (!masterData[name]) masterData[name] = { mr: 0, us: 0, ct: 0, dx: 0, mg: 0, bmd: 0, proofreading: 0 };
      
      wAcross.forEach(col => {
        const val = wFact[`${row.key}!${col.key}`]?.aggregates[0]?.value || 0;
        if (col.label === 'MR') masterData[name].mr = val;
        if (col.label === 'US') masterData[name].us = val;
        if (col.label === 'CT') masterData[name].ct = val;
        if (col.label === 'DX') masterData[name].dx = val;
        if (col.label === 'MG') masterData[name].mg = val;
        if (col.label === 'BMD') masterData[name].bmd = val;
      });
    });

    // --- 解析影像校對量 ---
    const pDown = proofReport.groupingsDown.groupings;
    const pFact = proofReport.factMap;

    pDown.forEach(row => {
      if (row.label === "-") return;
      const name = row.label;
      if (!masterData[name]) masterData[name] = { mr: 0, us: 0, ct: 0, dx: 0, mg: 0, bmd: 0, proofreading: 0 };
      // 影像校對報表通常是簡單彙總，取 Total (T) 即可
      masterData[name].proofreading = pFact[`${row.key}!T`]?.aggregates[0]?.value || 0;
    });

    console.log(`✅ 解析完成，準備更新 ${Object.keys(masterData).length} 位人員數據...`);

    // --- 寫入 Supabase ---
    for (const name of Object.keys(masterData)) {
      const stats = masterData[name];

      // 先查詢現有資料
      const { data: existing } = await supabase
        .from('radiographer_workload')
        .select('*')
        .eq('year', targetYear)
        .eq('month', targetMonth)
        .eq('radiographerName', name)
        .single();

      const payload = {
        year: targetYear,
        month: targetMonth,
        radiographerName: name,
        mr: stats.mr,
        us: stats.us,
        ct: stats.ct,
        dx: stats.dx,
        mg: stats.mg,
        bmd: stats.bmd,
        image_proofing: stats.proofreading,
        // 保留原本可能存在的 CTA 或 報告登打
        cta_post_processing: existing ? existing.cta_post_processing : 0,
        report_entry: existing ? existing.report_entry : 0,
      };

      if (existing) {
        await supabase.from('radiographer_workload').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('radiographer_workload').insert(payload);
      }
    }

    console.log(`\n🎉 同步成功！已更新 ${targetYear} 年 ${targetMonth} 月的工作量。`);

  } catch (error) {
    console.error('❌ 同步失敗:', error.message);
  } finally {
    rl.close();
  }
}

syncAllWorkloads();
