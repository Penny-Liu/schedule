-- Preserve the initial single-item data and explicitly separate instrument-flow snapshots.
alter table public.radiographer_exam_duration_daily
  add column metric_scope text not null default 'item' check (metric_scope in ('item','flow'));
alter table public.radiographer_exam_duration_daily drop constraint radiographer_exam_duration_daily_pkey;
alter table public.radiographer_exam_duration_daily add primary key
  (exam_date, metric_scope, radiographer_id, category, exam_name, location, resource_name);
create or replace function public.replace_radiographer_exam_duration_day(p_date date, p_rows jsonb, p_captured_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('exam-duration:' || p_date::text));
  if exists (select 1 from public.radiographer_exam_duration_sync_days where exam_date = p_date and synced_at > p_captured_at) then
    return false;
  end if;
  if jsonb_typeof(p_rows) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_rows) x where (x->>'exam_date')::date is distinct from p_date
  ) then raise exception 'Invalid duration snapshot'; end if;
  delete from public.radiographer_exam_duration_daily where exam_date = p_date;
  insert into public.radiographer_exam_duration_daily
    select * from jsonb_populate_recordset(null::public.radiographer_exam_duration_daily, p_rows);
  insert into public.radiographer_exam_duration_sync_days (exam_date, source_count, summary_count, algorithm, synced_at)
    values (p_date, coalesce((select sum(total_count) from public.radiographer_exam_duration_daily where exam_date = p_date), 0), jsonb_array_length(p_rows), 'actual-flow-v2', p_captured_at)
    on conflict (exam_date) do update set source_count = excluded.source_count,
      summary_count = excluded.summary_count, algorithm = excluded.algorithm, synced_at = excluded.synced_at;
  return true;
end;
$$;
revoke all on function public.replace_radiographer_exam_duration_day(date, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_radiographer_exam_duration_day(date, jsonb, timestamptz) to service_role;
