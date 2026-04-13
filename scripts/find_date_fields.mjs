import { getSalesforceSession, describeSObject } from './salesforce-utils.mjs';

async function main() {
  try {
    const session = await getSalesforceSession();
    const meta = await describeSObject({ ...session, objectApiName: 'CheckupReservation__c' });
    
    console.log('📅 正在尋找日期欄位...');
    const dateFields = meta.fields.filter(f => 
      f.type === 'date' || 
      f.type === 'datetime' || 
      f.label.includes('日期') || 
      f.label.includes('時間')
    );
    
    dateFields.forEach(f => {
      console.log(`- API: ${f.name} (標籤: ${f.label}) [型態: ${f.type}]`);
    });
  } catch (error) {
    console.error('❌ 分失敗:', error.message);
  }
}

main();
