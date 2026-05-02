import 'dotenv/config';
import { getSalesforceSession } from './salesforce-utils.mjs';
import fs from 'fs';

async function testProofreadingReport() {
  try {
    const session = await getSalesforceSession();
    const reportId = '00OTK000002o1HV'; // 影像校對報表
    const url = `${session.instanceUrl}/services/data/${session.apiVersion}/analytics/reports/${reportId}?includeDetails=true`;
    
    console.log(`正在呼叫 Salesforce 影像校對報表 API (${reportId})...`);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    });
    
    const data = await response.json();
    if (!response.ok) {
      console.error('報表 API 呼叫失敗:', data);
      return;
    }

    fs.writeFileSync('proofreading-report-output.json', JSON.stringify(data, null, 2));
    console.log('✅ 影像校對報表資料已經成功下載並儲存到 proofreading-report-output.json！');
    
  } catch (error) {
    console.error('執行失敗:', error);
  }
}

testProofreadingReport();
