import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 建立 SOQL 查詢：計算今天、院區為北投、且名稱為客戶報到的數量
    const soql = `
      SELECT count(Id) total
      FROM CheckupReservation__c 
      WHERE CheckupName__c = '客戶報到' 
        AND Location__c = '北投' 
        AND CreatedDate = TODAY
    `.trim();

    console.log('🚀 開始計算北投今日報到人數...');
    const result = await runSoqlQuery({ ...session, soql });
    
    const count = result.records[0].total;
    
    console.log('\n' + '★'.repeat(30));
    console.log(`📊 統計結果 [${new Date().toLocaleDateString()}]`);
    console.log(`📍 院區：北投`);
    console.log(`📝 項目：客戶報到`);
    console.log(`🔢 總量：${count} 人`);
    console.log('★'.repeat(30) + '\n');

  } catch (error) {
    console.error('❌ 抓取失敗:', error.message);
  }
}

main();
