import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 抓取今天北投與大直的所有數據
    const soql = `
      SELECT CheckupName__c, Location__c
      FROM CheckupReservation__c 
      WHERE (Location__c = '北投' OR Location__c = '大直')
        AND CheckStartDate__c = TODAY
    `.trim();

    console.log('🚀 正在同步北投與大直的即時數據...');
    const result = await runSoqlQuery({ ...session, soql });
    
    const stats = {
      "北投": { "總人數": 0, "腸胃": 0, "CTA": 0, "MR": 0 },
      "大直": { "總人數": 0, "腸胃": 0, "CTA": 0, "MR": 0, "代謝總人數": 0 }
    };

    // 為了精準計算 MR 人數（避免重複加總），我們需要紀錄哪些項目是屬於 MR
    // 註：這裏假設每個人的項目是獨立列出的，我們暫時先以關鍵字搜尋，若有重複可再依據 ID 去重
    result.records.forEach(r => {
        const loc = r.Location__c;
        const name = r.CheckupName__c || '';

        if (loc === '北投') {
            if (name === '體檢總評') stats["北投"]["總人數"]++;
            if (name === '大腸鏡檢查') stats["北投"]["腸胃"]++;
            if (name === '心臟冠狀動脈血管電腦斷層(顯影)') stats["北投"]["CTA"]++;
            // 北投 MR 項目眾多，這裡先以「頭部磁振造影」作為基準，或可改為關鍵字
            if (name === '頭部磁振造影') stats["北投"]["MR"]++; 
        }

        if (loc === '大直') {
            if (name === '血壓') stats["大直"]["總人數"]++;
            if (name === '大腸鏡檢查') stats["大直"]["腸胃"]++;
            if (name === '營養門診(30)') stats["大直"]["代謝總人數"]++;
            if (name.includes('心臟冠狀動脈')) stats["大直"]["CTA"]++;
            if (name.includes('磁振造影')) stats["大直"]["MR"]++;
        }
    });

    displayStats(stats);

  } catch (error) {
    console.error('❌ 抓取失敗:', error.message);
  }
}

function displayStats(stats) {
    console.log('\n' + '★'.repeat(40));
    console.log(`📊 全院今日統計報告 [${new Date().toLocaleDateString()}]`);
    console.log('★'.repeat(40));

    ["北投", "大直"].forEach(loc => {
        console.log(`【${loc} 院區】`);
        for (const [key, value] of Object.entries(stats[loc])) {
            console.log(`  - ${key.padEnd(10)}: ${value} 人`);
        }
        console.log('-'.repeat(40));
    });
}

main();
