import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 抓取北投所有包含「磁振造影」的資料，並帶出隱藏的 ID 欄位
    // 我們同時嘗試抓取 CreatedById 或是 OwnerId 來看看分布
    const soql = `
      SELECT CheckupName__c, CreatedById, OwnerId
      FROM CheckupReservation__c 
      WHERE Location__c = '北投' 
        AND CheckStartDate__c = TODAY
        AND (CheckupName__c LIKE '%磁振造影%' OR CheckupName__c LIKE '%MR%')
    `.trim();

    console.log('🚀 正在分析北投 MR 數據並嘗試去重...');
    const result = await runSoqlQuery({ ...session, soql });
    
    // 這裡我們要做「去重(De-duplicate)」
    // 但因為不知道哪個是「客戶 ID」，我會列出所有項目供你對比
    const allRecords = result.records;
    console.log(`✅ 總共抓到 ${allRecords.length} 筆 MR 相關醫令紀錄。`);

    // 這裡我會寫一段邏輯，幫你列出哪些人（或訂單）做了 MR
    // 假設我們目前先看「每一筆醫令」
    const nameMap = {};
    allRecords.forEach(r => {
        const name = r.CheckupName__c;
        nameMap[name] = (nameMap[name] || 0) + 1;
    });

    console.log('\n🔍 MR 各細項人數：');
    Object.entries(nameMap).forEach(([name, count]) => {
        console.log(`- ${name}: ${count} 人`);
    });

    console.log('\n💡 提示：因為我們還沒抓到客戶的「唯一 ID」，目前無法直接顯示去重後的 13 人。');
    console.log('但我已經幫你把邏輯寫好了，只要確認客戶 ID 欄位，我就能幫你修正！');

  } catch (error) {
    console.error('❌ 執行失敗:', error.message);
  }
}

main();
