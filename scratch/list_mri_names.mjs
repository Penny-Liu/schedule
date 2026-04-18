
import 'dotenv/config';
import { getSalesforceSession, runSoqlQuery } from '../scripts/salesforce-utils.mjs';

async function listMRINames() {
    try {
        console.log('🔍 正在從 Salesforce 抓取包含「磁振造影」的醫令名稱...');
        const session = await getSalesforceSession();
        
        // 抓取最近 30 天的資料
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

        const soql = `
            SELECT CheckupName__c, Location__c
            FROM CheckupReservation__c 
            WHERE (CheckupName__c LIKE '%磁振造影%' OR CheckupName__c LIKE '%MR%')
              AND CheckStartDate__c >= ${dateStr}
            LIMIT 2000
        `.trim();

        const result = await runSoqlQuery({ ...session, soql });
        
        const names = new Set();
        result.records.forEach(r => {
            if (r.CheckupName__c) names.add(r.CheckupName__c);
        });

        console.log('\n✅ 抓取完成！以下是最近 30 天出現過的相關醫令名稱：');
        console.log('--------------------------------------------------');
        Array.from(names).sort().forEach(name => {
            console.log(`- ${name}`);
        });
        console.log('--------------------------------------------------');
        console.log(`共計 ${names.size} 種不同的名稱。`);

    } catch (error) {
        console.error('❌ 抓取失敗:', error.message);
    }
}

listMRINames();
