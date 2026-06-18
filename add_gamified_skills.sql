-- 增加技能闖關系統所需的資料欄位
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS unlocked_skills JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS learning_skills JSONB DEFAULT '[]'::jsonb;
