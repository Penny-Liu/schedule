import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 抓取北投與大直所有資料，包含關鍵的 Order__c 欄位用來去重
    const soql = `
      SELECT CheckupName__c, Location__c, Order__c
      FROM CheckupReservation__c 
      WHERE (Location__c = '北投' OR Location__c = '大直')
        AND CheckStartDate__c = TODAY
    `.trim();

    console.log('🚀 正在計算全院今日統計報告...');
    const result = await runSoqlQuery({ ...session, soql });
    
    const stats = {
      "北投": { "總人數": 0, "腸胃": 0, "CTA": 0, "MR": 0 },
      "大直": { "總人數": 0, "腸胃": 0, "CTA": 0, "MR": 0, "代謝總人數": 0 }
    };

    // 用來儲存已計算過的 OrderID，避免重複計算人數
    const seenMR_Beitou = new Set();
    const seenMR_Dazhi = new Set();

    result.records.forEach(r => {
        const loc = r.Location__c;
        const name = r.CheckupName__c || '';
        const orderId = r.Order__c;

        if (loc === '北投') {
            if (name === '體檢總評') stats["北投"]["總人數"]++;
            if (name === '大腸鏡檢查') stats["北投"]["腸胃"]++;
            if (name === '心臟冠狀動脈預後評估') stats["北投"]["CTA"]++; 
            if (name === '心臟冠狀動脈血管電腦斷層(顯影)') stats["北投"]["CTA"]++;
            
            // MR 去重邏輯：如果有磁振造影關鍵字，且這個 OrderID 沒出現過，就計為 1 人
            if (name.includes('磁振造影') || name.includes('M R I') || name.includes('MR')) {
                if (!seenMR_Beitou.has(orderId)) {
                    stats["北投"]["MR"]++;
                    seenMR_Beitou.add(orderId);
                }
            }
        }

        if (loc === '大直') {
            if (name === '血壓') stats["大直"]["總人數"]++;
            if (name === '大腸鏡檢查') stats["大直"]["腸胃"]++;
            if (name === '營養門診(30)') stats["大直"]["代謝總人數"]++;
            if (name.includes('心臟冠狀動脈')) stats["大直"]["CTA"]++;
            
            if (name.includes('磁振造影') || name.includes('MR')) {
                if (!seenMR_Dazhi.has(orderId)) {
                    stats["大直"]["MR"]++;
                    seenMR_Dazhi.add(orderId);
                }
            }
        }
    });

    displayStats(stats);

  } catch (error) {
    console.error('❌ 抓取失敗:', error.message);
  }
}

function displayStats(stats) {
    console.log('\n' + '★'.repeat(45));
    console.log(`📊 全院今日統計報告 [${new Date().toLocaleDateString()}]`);
    console.log('★'.repeat(45));

    ["北投", "大直"].forEach(loc => {
        console.log(`【${loc} 院區】`);
        console.log(`  - 總人數      : ${stats[loc]["總人數"]} 人`);
        console.log(`  - 腸　胃      : ${stats[loc]["腸胃"]} 人`);
        if (loc === '北投') {
            console.log(`  - C T A       : ${stats[loc]["CTA"]} 人`);
            console.log(`  - M R         : ${stats[loc]["MR"]} 人`);
        }
        if (loc === '大直') {
            console.log(`  - 代謝總人數  : ${stats[loc]["代謝總人數"]} 人`);
        }
        console.log('-'.repeat(45));
    });
}

main();
