import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 抓取北投今天所有醫令
    const soql = `
      SELECT CheckupName__c
      FROM CheckupReservation__c 
      WHERE Location__c = '北投' 
        AND CheckStartDate__c = TODAY
    `.trim();

    const result = await runSoqlQuery({ ...session, soql });
    
    const nameCounts = {};
    result.records.forEach(r => {
      const name = r.CheckupName__c || '未知';
      nameCounts[name] = (nameCounts[name] || 0) + 1;
    });

    console.log('\n🔍 今日【北投】完整醫令清單：');
    Object.entries(nameCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => console.log(`- ${name}: ${count} 人`));

  } catch (error) {
    console.error('❌ 抓取失敗:', error.message);
  }
}

main();
