-- Null means this snapshot predates care-note capture; never backfill unknown as zero.
alter table public.radiographer_exam_duration_daily
  add column if not exists claustrophobia_count integer
  check (claustrophobia_count >= 0 and claustrophobia_count <= valid_count);
comment on column public.radiographer_exam_duration_daily.claustrophobia_count is
  'Valid timing samples with current-order Care option 幽閉. For MR comparisons use unique full-session/source flows, not allocated order counts. Null means not captured. No patient identifiers or care text stored.';

create or replace function public.supports_exam_duration_care_notes()
returns boolean language sql stable security invoker set search_path = ''
as $$ select true; $$;
revoke all on function public.supports_exam_duration_care_notes() from public, anon, authenticated;
grant execute on function public.supports_exam_duration_care_notes() to service_role;
