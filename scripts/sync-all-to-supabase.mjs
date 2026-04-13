import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
    try {
        console.log('🚀 開始抓取今日 + 未來一個月 (30天) 的數據...');
        const session = await getSalesforceSession();

        // 查詢未來 30 天 (含今天) 的所有相關醫令
        const soql = `
            SELECT CheckupName__c, Location__c, Order__c, CheckStartDate__c
            FROM CheckupReservation__c 
            WHERE (Location__c = '北投' OR Location__c = '大直')
              AND CheckStartDate__c >= TODAY 
              AND CheckStartDate__c <= NEXT_N_DAYS:30
            ORDER BY CheckStartDate__c ASC
        `.trim();

        const result = await runSoqlQuery({ ...session, soql });
        console.log(`✅ 成功抓取 ${result.records.length} 筆原始醫令資料。`);

        // 用來存放按日期分組的統計結果
        const dailyResults = {};

        // 初始化統計物件的函數
        const initStats = () => ({
            beitou_clients: 0, beitou_gi: 0, beitou_cta: 0, beitou_mr: 0,
            dazhi_clients: 0, dazhi_gi: 0, dazhi_metabolism_clients: 0
        });

        // 追蹤 MR 去重用的 Set
        const seenMR = new Set(); // Key 格式: "日期_OrderID"

        result.records.forEach(r => {
            const date = r.CheckStartDate__c; // YYYY-MM-DD
            const loc = r.Location__c;
            const name = r.CheckupName__c || '';
            const orderId = r.Order__c;

            if (!dailyResults[date]) dailyResults[date] = initStats();
            const stats = dailyResults[date];

            if (loc === '北投') {
                if (name === '體檢總評') stats.beitou_clients++;
                if (name === '大腸鏡檢查') stats.beitou_gi++;
                if (name.includes('電腦斷層(顯影)')) stats.beitou_cta++;
                if (name.includes('磁振造影') || name.includes('MR')) {
                    const mrKey = `${date}_${orderId}`;
                    if (!seenMR.has(mrKey)) {
                        stats.beitou_mr++;
                        seenMR.add(mrKey);
                    }
                }
            } else if (loc === '大直') {
                if (name === '血壓') stats.dazhi_clients++;
                if (name === '大腸鏡檢查') stats.dazhi_gi++;
                if (name === '營養門診(30)') stats.dazhi_metabolism_clients++;
            }
        });

        // --- 寫入 Supabase ---
        console.log('📝 正在更新資料庫...');
        const { data: row, error: fetchError } = await supabase
            .from('settings')
            .select('id, data')
            .limit(1)
            .maybeSingle();

        if (fetchError) throw fetchError;

        const settingsId = row?.id || 1;
        const settingsData = row?.data || {};
        const dailyStats = settingsData.dailyStats || {};

        // 併入原本的資料，不刪除過去的紀錄，只更新這 15 天
        settingsData.dailyStats = {
            ...dailyStats,
            ...dailyResults,
            updated_at: new Date().toISOString()
        };

        const { error: upsertError } = await supabase
            .from('settings')
            .upsert({ id: settingsId, data: settingsData });

        if (upsertError) throw upsertError;

        console.log(`✨ 大功告成！已同步 ${Object.keys(dailyResults).length} 天的數據。`);
        console.log('同步日期範圍:', Object.keys(dailyResults)[0], '~', Object.keys(dailyResults).pop());

    } catch (err) {
        console.error('❌ 同步失敗:', err.message);
    }
}

sync();
