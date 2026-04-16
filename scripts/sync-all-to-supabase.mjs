
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';
import readline from 'readline';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function sync() {
    try {
        console.log('\n--- 🏥 Salesforce 數據同步工具 (CLI 版) ---');
        
        let startDate = await askQuestion('📅 請輸入開始日期 (YYYY-MM-DD，留空則為今天): ');
        if (!startDate) startDate = new Date().toISOString().split('T')[0];
        
        let endDate = await askQuestion('📅 請輸入結束日期 (YYYY-MM-DD，留空則為今天): ');
        if (!endDate) endDate = startDate;

        console.log(`\n🚀 準備同步區間: ${startDate} ~ ${endDate}`);
        
        const session = await getSalesforceSession();
        console.log('✅ Salesforce 認證成功。');

        // 查詢指定日期範圍的所有相關醫令
        const soql = `
            SELECT CheckupName__c, Location__c, Order__c, CheckStartDate__c
            FROM CheckupReservation__c 
            WHERE (Location__c = '北投' OR Location__c = '大直')
              AND CheckStartDate__c >= ${startDate}
              AND CheckStartDate__c <= ${endDate}
            ORDER BY CheckStartDate__c ASC
        `.trim();

        const result = await runSoqlQuery({ ...session, soql });
        console.log(`📦 成功從雲端抓取 ${result.records.length} 筆原始項次。`);

        // 用來存放按日期分組的統計結果
        const dailyResults = {};
        const seenMR = new Set(); // Key 格式: "日期_OrderID"

        const initStats = () => ({
            beitou_clients: 0, beitou_gi: 0, beitou_cta: 0, beitou_mr: 0,
            dazhi_clients: 0, dazhi_gi: 0, dazhi_metabolism_clients: 0, dazhi_ultrasound: 0
        });

        result.records.forEach(r => {
            const date = r.CheckStartDate__c;
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
                if (name.includes('超音波')) stats.dazhi_ultrasound++;
            }
        });

        if (Object.keys(dailyResults).length === 0) {
            console.log('⚠️ 此區間內沒有查獲任何數據。');
            rl.close();
            return;
        }

        // --- 寫入 Supabase ---
        console.log('📝 正在更新 Supabase 資料庫...');
        const { data: row, error: fetchError } = await supabase
            .from('settings')
            .select('id, data')
            .limit(1)
            .maybeSingle();

        if (fetchError) throw fetchError;

        const settingsId = row?.id || 1;
        const settingsData = row?.data || {};
        const dailyStats = settingsData.dailyStats || {};

        // 併入原本的資料，進行覆蓋更新
        settingsData.dailyStats = {
            ...dailyStats,
            ...dailyResults,
            updated_at: new Date().toISOString()
        };

        const { error: upsertError } = await supabase
            .from('settings')
            .upsert({ id: settingsId, data: settingsData });

        if (upsertError) throw upsertError;

        console.log(`\n✨ 同步成功！`);
        console.log(`📊 統計摘要:`);
        Object.keys(dailyResults).forEach(d => {
            const s = dailyResults[d];
            console.log(`   - [${d}] 北投:${s.beitou_clients}人 | 大直:${s.dazhi_clients}人`);
        });

    } catch (err) {
        console.error('\n❌ 同步失敗:', err.message);
    } finally {
        rl.close();
    }
}

sync();
