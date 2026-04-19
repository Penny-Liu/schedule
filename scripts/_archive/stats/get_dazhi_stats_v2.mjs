import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    const soql = `
      SELECT CheckupName__c
      FROM CheckupReservation__c 
      WHERE Location__c = '大直' 
        AND CheckStartDate__c = TODAY
    `.trim();

    const result = await runSoqlQuery({ ...session, soql });
    
    // 定義大直的專屬統計名稱
    const countMap = {
      "總人數": 0,    // 對應「血壓」
      "腸胃": 0,      // 對應「大腸鏡檢查」
      "代謝總人數": 0, // 對應「營養門診(30)」
      "MR": 0,
      "CTA": 0
    };

    result.records.forEach(r => {
      const name = r.CheckupName__c;
      if (name === '血壓') countMap["總人數"]++;
      if (name === '大腸鏡檢查') countMap["腸胃"]++;
      if (name === '營養門診(30)') countMap["代謝總人數"]++;
      
      // MR 與 CTA 判斷 (依照常見標籤)
      if (name.includes('MR')) countMap["MR"]++;
      if (name.includes('心臟冠狀動脈')) countMap["CTA"]++;
    });

    console.log('\n' + '★'.repeat(30));
    console.log(`📊 大直數據統計 (對應報告邏輯)`);
    console.log(`📅 日期：${new Date().toLocaleDateString()}`);
    console.log('★'.repeat(30));
    console.log(`總人數        : ${countMap["總人數"]} 人`);
    console.log(`腸　胃        : ${countMap["腸胃"]} 人`);
    console.log(`代謝總人數    : ${countMap["代謝總人數"]} 人`);
    console.log(`MR            : ${countMap["MR"]} 人`);
    console.log(`CTA           : ${countMap["CTA"]} 人`);
    console.log('★'.repeat(30));

  } catch (error) {
    console.error('❌ 抓取失敗:', error.message);
  }
}

main();
