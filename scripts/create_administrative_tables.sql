-- 行政人員表
-- 刪除舊版關聯表
DROP TABLE IF EXISTS administrative_shifts CASCADE;
DROP TABLE IF EXISTS administrative_staff CASCADE;

-- 行政排班表 (新版：無需維護個別人員，直接以部門+日期儲存打字輸入的名字)
CREATE TABLE administrative_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('客服', '智基', '資訊', '報告', '行政', '基因')),
  date DATE NOT NULL,
  staff_names TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('北投', '大直')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category, date, location)
);

-- 為了兼容已建立的資料表，加入 ALTER TABLE 放寬限制
ALTER TABLE administrative_shifts DROP CONSTRAINT IF EXISTS administrative_shifts_category_check;
ALTER TABLE administrative_shifts ADD CONSTRAINT administrative_shifts_category_check CHECK (category IN ('客服', '智基', '資訊', '報告', '行政', '基因'));

-- 索引優化
CREATE INDEX IF NOT EXISTS idx_administrative_shifts_date ON administrative_shifts(date);

-- RLS 政策 (如果需要)
ALTER TABLE administrative_shifts ENABLE ROW LEVEL SECURITY;

-- 允許所有認證用戶訪問
DROP POLICY IF EXISTS "Allow administrative_shifts writes from web app" ON administrative_shifts;
CREATE POLICY "Allow administrative_shifts writes from web app" ON administrative_shifts
  FOR ALL TO public
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');