-- Schema already applied for the allocated duration trial; retain for reproducible installs.
ALTER TABLE public.radiographer_exam_duration_daily DROP CONSTRAINT radiographer_exam_duration_daily_metric_scope_check;
ALTER TABLE public.radiographer_exam_duration_daily ADD CONSTRAINT radiographer_exam_duration_daily_metric_scope_check CHECK (metric_scope IN ('item', 'flow', 'allocated'));
