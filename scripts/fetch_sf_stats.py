
import requests
import json
from datetime import datetime
from simple_salesforce import Salesforce

import os
from dotenv import load_dotenv

# 讀取 .env 檔案
load_dotenv()

# --- 設定區 ---
DOMAIN = os.getenv("SALESFORCE_LOGIN_BASE_URL", "tpehealth.my").replace("https://", "").replace(".salesforce.com", "")
CLIENT_ID = os.getenv("SALESFORCE_CLIENT_ID")
CLIENT_SECRET = os.getenv("SALESFORCE_CLIENT_SECRET")

def get_sf_connection():
    """使用 Client Credentials Flow 建立連線"""
    endpoint = f'https://{DOMAIN}.salesforce.com/services/oauth2/token'
    
    payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }

    try:
        response = requests.post(endpoint, data=payload)
        auth_data = response.json()

        if "access_token" not in auth_data:
            print("❌ Salesforce 認證失敗，訊息:", auth_data)
            return None

        sf = Salesforce(
            instance_url=auth_data['instance_url'], 
            session_id=auth_data['access_token']
        )
        return sf
    except Exception as e:
        print(f"❌ 連線例外錯誤: {str(e)}")
        return None

def fetch_data(sf, date_str):
    """抓取指定日期的數據"""
    # 這裡的欄位名是從你的 salesforce-daily-stats.config.json 抓出來的
    soql = f"""
        SELECT 
            Beitou_Clients__c, 
            Beitou_MR__c, 
            Beitou_CTA__c, 
            Beitou_GI__c,
            Dazhi_Clients__c, 
            Dazhi_Metabolism_Clients__c, 
            Dazhi_GI__c
        FROM Daily_Stats__c 
        WHERE Stats_Date__c = '{date_str}'
        LIMIT 1
    """
    
    try:
        print(f"🔍 正在抓取日期: {date_str} 的數據...")
        result = sf.query(soql)
        
        if result['totalSize'] > 0:
            record = result['records'][0]
            # 整理成易讀格式
            stats = {
                "日期": date_str,
                "北投客戶量": record.get('Beitou_Clients__c', 0),
                "北投 MR": record.get('Beitou_MR__c', 0),
                "北投 CTA": record.get('Beitou_CTA__c', 0),
                "北投 GI": record.get('Beitou_GI__c', 0),
                "大直客戶量": record.get('Dazhi_Clients__c', 0),
                "大直代謝": record.get('Dazhi_Metabolism_Clients__c', 0),
                "大直 GI": record.get('Dazhi_GI__c', 0)
            }
            return stats
        else:
            print(f"⚠️ {date_str} 這天在 Salesforce 裡沒有任何數據。")
            return None
    except Exception as e:
        print(f"❌ 抓取數據失敗: {str(e)}")
        return None

if __name__ == "__main__":
    # 預設抓取今天日期，格式 YYYY-MM-DD
    today = datetime.now().strftime("%Y-%m-%d")
    
    sf = get_sf_connection()
    if sf:
        print("✅ Salesforce 連線成功!")
        data = fetch_data(sf, today)
        if data:
            print("\n" + "="*30)
            print("📊 數據統計結果")
            print("="*30)
            for key, value in data.items():
                print(f"{key}: {value}")
            print("="*30)
