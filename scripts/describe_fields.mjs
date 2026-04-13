import { getSalesforceSession, describeSObject } from './salesforce-utils.mjs';

async function main() {
  const objectsToDescribe = ['CheckupReservation__c', 'Checkup__c'];
  
  try {
    const session = await getSalesforceSession();
    
    for (const objName of objectsToDescribe) {
      console.log(`\n--- 正在分析物件: ${objName} ---`);
      const meta = await describeSObject({ ...session, objectApiName: objName });
      
      // 搜尋可能跟「名稱」、「院區」、「地點」、「狀態」有關的欄位
      const relevantFields = meta.fields.filter(f => 
        f.label.includes('名稱') || 
        f.label.includes('院區') || 
        f.label.includes('地點') ||
        f.label.includes('狀態') ||
        f.name.toLowerCase().includes('branch') ||
        f.name.toLowerCase().includes('status') ||
        f.name.toLowerCase().includes('name')
      );
      
      relevantFields.forEach(f => {
        console.log(`- API: ${f.name} (標籤: ${f.label}) [型態: ${f.type}]`);
      });
    }
  } catch (error) {
    console.error('❌ 分析失敗:', error.message);
  }
}

main();
