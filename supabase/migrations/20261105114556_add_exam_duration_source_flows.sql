-- 來源流程用於樣本參考程度；不包含病患或醫令識別資料。
ALTER TABLE public.radiographer_exam_duration_daily DROP CONSTRAINT IF EXISTS radiographer_exam_duration_daily_metric_scope_check;
ALTER TABLE public.radiographer_exam_duration_daily ADD CONSTRAINT radiographer_exam_duration_daily_metric_scope_check CHECK (metric_scope IN ('item', 'flow', 'allocated', 'allocation_flow'));
