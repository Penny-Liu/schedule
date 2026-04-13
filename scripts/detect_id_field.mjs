import { getSalesforceSession, runSoqlQuery, describeSObject } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    
    // 1. 先抓出所有欄位名
    const meta = await describeSObject({...session, objectApiName: 'CheckupReservation__c'});
    const allFieldNames = meta.fields.map(f => f.name);
    
    // 2. 抓取今天北投 MR 相關的資料（我們只抓前 5 筆來分析 ID 結構）
    const soql = `
      SELECT ${allFieldNames.slice(0, 50).join(',')} 
      FROM CheckupReservation__c 
      WHERE Location__c = '北投' 
        AND CheckStartDate__c = TODAY
        AND (CheckupName__c LIKE '%磁振造影%')
      LIMIT 10
    `.trim();

    console.log('🚀 正在深度分析北投 MR 資料結構...');
    const result = await runSoqlQuery({ ...session, soql });
    
    if (result.records.length > 0) {
        console.log('\n🔍 資料樣本分析：');
        result.records.forEach((r, idx) => {
            console.log(`--- [紀錄 ${idx + 1}] ---`);
            // 我們特別找那些看起來像 ID 的欄位 (通常是 15 或 18 位字串)
            for (const [key, value] of Object.entries(r)) {
                if (key !== 'attributes' && (typeof value === 'string' && (value.length === 15 || value.length === 18))) {
                    console.log(`💡 可能的 ID 欄位 [${key}]: ${value}`);
                }
            }
            console.log(`醫令名稱: ${r.CheckupName__c}`);
        });
    }

  } catch (error) {
    console.error('❌ 分析失敗:', error.message);
  }
}

main();
