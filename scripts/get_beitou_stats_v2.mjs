import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 將 CreatedDate 改為 CheckStartDate__c
    const soql = `
      SELECT count(Id) total
      FROM CheckupReservation__c 
      WHERE CheckupName__c = '客戶報到' 
        AND Location__c = '北投' 
        AND CheckStartDate__c = TODAY
    `.trim();

    console.log('🚀 使用「健檢日期 (CheckStartDate__c)」重新計算...');
    const result = await runSoqlQuery({ ...session, soql });
    
    const count = result.records[0].total;
    
    console.log('\n' + '★'.repeat(30));
    console.log(`📊 統計結果 [${new Date().toLocaleDateString()}]`);
    console.log(`🔢 總量：${count} 人`);
    console.log('★'.repeat(30) + '\n');

    if (count === 34) {
      console.log('✅ 數字對上了！這就是報告所使用的邏輯。');
    } else {
      console.log(`⚠️ 數字仍為 ${count}，嘗試檢查其它日期欄位（如 Reservationdate_Order__c）...`);
    }

  } catch (error) {
    console.error('❌ 抓取失敗:', error.message);
  }
}

main();
