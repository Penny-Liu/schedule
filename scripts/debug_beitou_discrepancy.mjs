import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 這次我們不只 count，我們把狀態抓出來分析
    const soql = `
      SELECT Checkup_Status__c, count(Id) total
      FROM CheckupReservation__c 
      WHERE CheckupName__c = '客戶報到' 
        AND Location__c = '北投' 
        AND CreatedDate = TODAY
      GROUP BY Checkup_Status__c
    `.trim();

    console.log('🔍 正在依照「狀態」分析這 41 筆資料...');
    const result = await runSoqlQuery({ ...session, soql });
    
    console.log('\n--- 狀態統計分析 ---');
    result.records.forEach(r => {
      console.log(`- 狀態 [${r.Checkup_Status__c || '空白'}]: ${r.total} 筆`);
    });
    console.log('------------------');

  } catch (error) {
    console.error('❌ 分析失敗:', error.message);
  }
}

main();
