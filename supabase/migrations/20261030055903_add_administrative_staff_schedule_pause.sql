-- 暫停排班與刪除人員分開，保留所有既有班表與啟用狀態。
ALTER TABLE public.administrative_staff
  ADD COLUMN IF NOT EXISTS scheduling_paused boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.administrative_staff.scheduling_paused IS
  'Temporarily exclude this gene/H staff member from new assignments until manually resumed; existing shifts remain unchanged.';
