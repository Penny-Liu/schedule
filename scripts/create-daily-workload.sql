-- 建立每日工作量明細表
CREATE TABLE IF NOT EXISTS radiographer_daily_workload (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    radiographer_name TEXT NOT NULL,
    date DATE NOT NULL, -- 紀錄格式為 YYYY-MM-DD
    
    -- 各項檢查數量
    mr FLOAT DEFAULT 0,
    mr_large_male FLOAT DEFAULT 0,
    mr_large_female FLOAT DEFAULT 0,
    mr_medium FLOAT DEFAULT 0,
    mr_small FLOAT DEFAULT 0,
    us FLOAT DEFAULT 0,
    us_a FLOAT DEFAULT 0,
    us_breast FLOAT DEFAULT 0,
    us_heart FLOAT DEFAULT 0,
    us_thy FLOAT DEFAULT 0,
    us_cca FLOAT DEFAULT 0,
    us_neck FLOAT DEFAULT 0,
    us_pelvis_female FLOAT DEFAULT 0,
    us_pelvis_male FLOAT DEFAULT 0,
    ct FLOAT DEFAULT 0,
    cta FLOAT DEFAULT 0,
    dx FLOAT DEFAULT 0,
    mg FLOAT DEFAULT 0,
    bmd FLOAT DEFAULT 0,
    
    -- 其他工作量
    cta_post_processing FLOAT DEFAULT 0,
    report_entry FLOAT DEFAULT 0,
    image_proofing FLOAT DEFAULT 0,
    tsmc_report FLOAT DEFAULT 0,
    total FLOAT DEFAULT 0,
    
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    
    -- 確保同一天同一個人只有一筆紀錄
    UNIQUE(date, radiographer_name)
);

-- 設定權限 (假設有 RLS)
ALTER TABLE radiographer_daily_workload ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON radiographer_daily_workload
    FOR SELECT USING (true);

CREATE POLICY "Enable insert/update for authenticated users only" ON radiographer_daily_workload
    FOR ALL USING (auth.role() = 'authenticated');
