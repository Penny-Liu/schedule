-- 為 radiographer_workload 資料表新增 MR 子分類欄位（小數，因為有比例分配）
ALTER TABLE radiographer_workload
  ADD COLUMN IF NOT EXISTS mr_large_male   NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_large_female NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_medium       NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mr_small        NUMERIC(8,2) DEFAULT 0;

-- 新增 US 超音波子分類欄位（整數）
ALTER TABLE radiographer_workload
  ADD COLUMN IF NOT EXISTS us_a            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_breast       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_heart        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_thy          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_cca          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_neck         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_pelvis_female INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS us_pelvis_male   INTEGER DEFAULT 0;
