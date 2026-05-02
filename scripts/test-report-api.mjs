import 'dotenv/config';
import fs from 'fs';
import { getSalesforceSession } from './salesforce-utils.mjs';

async function testReport() {
  try {
    const session = await getSalesforceSession();
    const reportId = '00O2t000000ueta';
    const url = `${session.instanceUrl}/services/data/${session.apiVersion}/analytics/reports/${reportId}?includeDetails=true`;
    
    console.log(`使用系統整合身分登入成功！正在呼叫 Salesforce 報表 API (${reportId})...`);
    console.log(`請確保此報表位於「公用報表資料夾 (Public Reports)」，否則 API 會回傳 NOT_FOUND。`);
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    });
    
    const data = await response.json();
    if (!response.ok) {
      console.error('報表 API 呼叫失敗:', data);
      return;
    }

    fs.writeFileSync('report-output.json', JSON.stringify(data, null, 2));
    console.log('✅ 報表資料已經成功下載並儲存到 report-output.json！');
    
  } catch (error) {
    console.error('執行失敗:', error);
  }
}

testReport();
