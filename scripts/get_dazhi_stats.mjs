import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 改為直接抓取所有欄位，不再使用 GROUP BY
    const soql = `
      SELECT CheckupName__c
      FROM CheckupReservation__c 
      WHERE Location__c = '大直' 
        AND CheckStartDate__c = TODAY
    `.trim();

    console.log('🚀 正在下載大直今日原始數據進行統計...');
    const result = await runSoqlQuery({ ...session, soql });
    console.log(`✅ 成功抓取 ${result.records.length} 筆醫令資料。`);

    const stats = {
      "大直客戶量": 0,
      "MR量": 0,
      "CTA量": 0,
      "GI量": 0,
      "代謝客戶數": 0
    };

    const nameCounts = {};

    result.records.forEach(r => {
      const name = r.CheckupName__c || '未知項目';
      
      // 記錄所有名稱出現次數以便除錯
      nameCounts[name] = (nameCounts[name] || 0) + 1;

      // 統計分類
      if (name === '客戶報到') stats["大直客戶量"]++;
      if (name.includes('MR')) stats["MR量"]++;
      if (name.includes('CTA')) stats["CTA量"]++;
      if (name.toLowerCase().includes('gi') || name.includes('腸胃鏡')) stats["GI量"]++;
      if (name.includes('代謝') || name.includes('肥胖')) stats["代謝客戶數"]++;
    });

    console.log('\n' + '★'.repeat(30));
    console.log(`📊 大直數據統計 [${new Date().toLocaleDateString()}]`);
    console.log('★'.repeat(30));
    for (const [key, value] of Object.entries(stats)) {
      console.log(`${key.padEnd(10)} : ${value} 人`);
    }
    console.log('★'.repeat(30));
    
    console.log('\n🔍 今日完整醫令清單：');
    Object.entries(nameCounts)
      .sort((a, b) => b[1] - a[1]) // 照人數排序
      .forEach(([name, count]) => console.log(`- ${name}: ${count} 人`));

  } catch (error) {
    console.error('❌ 抓取或解析失敗:', error.message);
  }
}

main();
