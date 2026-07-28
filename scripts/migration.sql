-- 北投超音波細項
ALTER TABLE daily_stats ADD COLUMN beitou_ultrasound_thyroid INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN beitou_ultrasound_cca INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN beitou_ultrasound_abdomen INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN beitou_ultrasound_breast INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN beitou_ultrasound_pelvic INTEGER DEFAULT 0;

-- 大直超音波細項
ALTER TABLE daily_stats ADD COLUMN dazhi_ultrasound_thyroid INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN dazhi_ultrasound_cca INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN dazhi_ultrasound_abdomen INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN dazhi_ultrasound_breast INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN dazhi_ultrasound_pelvic INTEGER DEFAULT 0;
