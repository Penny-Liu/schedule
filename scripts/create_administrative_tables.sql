-- 行政人員表
CREATE TABLE IF NOT EXISTS administrative_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('客服', '智基', '資訊', '報告', '行政')),
  is_active BOOLEAN DEFAULT true,
  hire_date DATE,
  termination_date DATE,
  display_order INTEGER DEFAULT 0,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 強制更新分類限制 (處理舊版 '總務' 變更為 '智基' 的情況)
ALTER TABLE administrative_staff DROP CONSTRAINT IF EXISTS administrative_staff_category_check;
ALTER TABLE administrative_staff ADD CONSTRAINT administrative_staff_category_check CHECK (category IN ('客服', '智基', '資訊', '報告', '行政'));

-- 行政排班表
CREATE TABLE IF NOT EXISTS administrative_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES administrative_staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('北投', '大直')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(staff_id, date, location)
);

-- 索引優化
CREATE INDEX IF NOT EXISTS idx_administrative_staff_active ON administrative_staff(is_active);
CREATE INDEX IF NOT EXISTS idx_administrative_shifts_date ON administrative_shifts(date);
CREATE INDEX IF NOT EXISTS idx_administrative_shifts_staff_date ON administrative_shifts(staff_id, date);

-- RLS 政策 (如果需要)
ALTER TABLE administrative_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE administrative_shifts ENABLE ROW LEVEL SECURITY;

-- 允許所有認證用戶訪問
DROP POLICY IF EXISTS "Allow administrative_staff writes from web app" ON administrative_staff;
CREATE POLICY "Allow administrative_staff writes from web app" ON administrative_staff
  FOR ALL TO public
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

DROP POLICY IF EXISTS "Allow administrative_shifts writes from web app" ON administrative_shifts;
CREATE POLICY "Allow administrative_shifts writes from web app" ON administrative_shifts
  FOR ALL TO public
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');