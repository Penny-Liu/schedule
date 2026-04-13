import { getSalesforceSession, listSObjects } from './salesforce-utils.mjs';

async function main() {
  try {
    console.log('正在連線並搜尋包含「檢查」或「醫令」的物件...');
    const session = await getSalesforceSession();
    const objects = await listSObjects(session);
    
    // 搜尋標籤 (label) 包含「檢查」或「醫令」的物件
    const filtered = objects.filter(obj => 
      (obj.label && obj.label.includes('檢查')) || 
      (obj.label && obj.label.includes('醫令')) ||
      (obj.name && obj.name.toLowerCase().includes('check')) ||
      (obj.name && obj.name.toLowerCase().includes('exam'))
    );
    
    if (filtered.length > 0) {
      console.log(`\n🔍 在 ${objects.length} 個物件中找到了 ${filtered.length} 個可能相關的物件：`);
      filtered.forEach(obj => {
        console.log(`- API 名稱: ${obj.name} (標籤: ${obj.label})`);
      });
    } else {
      console.log('\n❌ 找不到標籤包含「檢查」的物件。');
      console.log('請確認此連線帳號是否擁有該物件的「存取權限」。');
    }
  } catch (error) {
    console.error('❌ 執行失敗:', error.message);
  }
}

main();
