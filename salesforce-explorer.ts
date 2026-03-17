import 'dotenv/config'; // 讀取 .env 檔案

// 步驟 1: 請在 .env 檔案中補上這四個變數
// 範例 .env 內容:
// SALESFORCE_CLIENT_ID=你的_Consumer_Key
// SALESFORCE_CLIENT_SECRET=你的_Consumer_Secret
// SALESFORCE_USERNAME=你的_登入帳號
// SALESFORCE_PASSWORD=密碼加上SecurityToken

const clientId = process.env.SALESFORCE_CLIENT_ID;
const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
const username = process.env.SALESFORCE_USERNAME;
const password = process.env.SALESFORCE_PASSWORD;

// 如果是正式環境請用 login.salesforce.com，若是 Sandbox 請改成 test.salesforce.com
const loginUrl = 'https://login.salesforce.com/services/oauth2/token';

async function main() {
    if (!clientId || !clientSecret || !username || !password) {
        console.error("❌ 錯誤: 請確認 .env 檔案中已設定 SALESFORCE 的四個變數 (CLIENT_ID, CLIENT_SECRET, USERNAME, PASSWORD)");
        return;
    }

    console.log("正在取得 Access Token...");
    
    // 1. 取得 Access Token
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('username', username);
    params.append('password', password);

    try {
        const tokenResponse = await fetch(loginUrl, {
            method: 'POST',
            body: params
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error("❌ 登入失敗:", tokenData.error_description || tokenData.error);
            console.error("原始錯誤資訊:", JSON.stringify(tokenData, null, 2));
            
            if (tokenData.error === 'invalid_grant' && !password?.includes(tokenData.error_description)) {
                console.log("\n💡 小提醒：");
                console.log("1. 如果你是第一次連線，請確認密碼後面有『緊接著』加上 Security Token (中間不要有空格或點)。");
                console.log("2. 如果你是在 .env 裡面的密碼中間加了點 (.) 或是空格，請嘗試把它拿掉。");
                console.log("3. 請確認該帳號在 Salesforce 網頁版是可以正常登入的。");
            }
            return;
        }

        const accessToken = tokenData.access_token;
        const instanceUrl = tokenData.instance_url;
        console.log("✅ 成功取得 Token!");
        console.log(`你的 Instance URL 是: ${instanceUrl}\n`);

        // =========== 2. 搜尋你有興趣的物件 (Object) ===========
        // 你說你想找 "北投客戶數", "MR", "GI", "CTA"
        // 這些資料通常落在 "Opportunity (商機)", "Event (活動/行程)", "Lead (潛在客戶)", 或是自訂物件表 (結尾是 __c) 裡面
        //
        // 我們先寫一個簡單的查詢，看看你的系統裡面有哪些「自訂物件」，因為這些業績/排程數字很高機率是你們公司客製化的表
        
        console.log("🔍 正在列出你的 Salesforce 中的所有物件 (Object)...");

        // 這支 API 會回傳你所有的資料表結構
        const describeResponse = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const describeData = await describeResponse.json();

        // 過濾出 "自訂" 的物件 (通常公司自己建的表會以 __c 結尾)
        const customObjects = describeData.sobjects
            .filter((obj: any) => obj.custom === true)
            .map((obj: any) => obj.name);

        console.log(`\n🎉 找到了 ${customObjects.length} 個自訂物件(資料表):`);
        // 我們印出前 30 個就好，免得洗版
        console.log(customObjects.slice(0, 30).join('\n'));
        if (customObjects.length > 30) {
            console.log(`...以及其他 ${customObjects.length - 30} 個物件`);
        }

        console.log("\n💡 提示：");
        console.log("請看看印出來的列表中，有沒有名稱看起來像 'Appointment__c', 'Schedule__c', 'DailyStats__c', 'Exam__c' 的物件？");
        console.log("如果你找到了疑似目標，我們下一步就可以把裡面的欄位 (Columns) 全部印出來看看有沒有你要的北投/大直 GI 或是 MR 數！");

    } catch (error) {
        console.error("執行過程中發生錯誤:", error);
    }
}

main();
