-- Prepare for deployment with the US weighted algorithm; do not mix v3 equal shares with v4 weighted shares.
create or replace function public.replace_radiographer_exam_duration_day(p_date date, p_rows jsonb, p_captured_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare snapshot_algorithm text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('exam-duration:' || p_date::text));
  if exists (select 1 from public.radiographer_exam_duration_sync_days where exam_date = p_date and synced_at > p_captured_at) then
    return false;
  end if;
  if jsonb_typeof(p_rows) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_rows) x where (x->>'exam_date')::date is distinct from p_date
  ) then raise exception 'Invalid duration snapshot'; end if;
  snapshot_algorithm := coalesce(nullif(p_rows->0->>'algorithm',''),'actual-flow-v4');
  if snapshot_algorithm not in ('actual-flow-v3','actual-flow-v4') or exists (
    select 1 from jsonb_array_elements(p_rows) x where x->>'algorithm' is distinct from snapshot_algorithm
  ) then raise exception 'Invalid or mixed duration algorithms'; end if;
  delete from public.radiographer_exam_duration_daily where exam_date = p_date;
  insert into public.radiographer_exam_duration_daily
    select * from jsonb_populate_recordset(null::public.radiographer_exam_duration_daily, p_rows);
  insert into public.radiographer_exam_duration_sync_days (exam_date, source_count, summary_count, algorithm, synced_at)
    values (p_date, coalesce((select sum(total_count) from public.radiographer_exam_duration_daily where exam_date = p_date), 0), jsonb_array_length(p_rows), snapshot_algorithm, p_captured_at)
    on conflict (exam_date) do update set source_count = excluded.source_count,
      summary_count = excluded.summary_count, algorithm = excluded.algorithm, synced_at = excluded.synced_at;
  return true;
end;
$$;
revoke all on function public.replace_radiographer_exam_duration_day(date, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_radiographer_exam_duration_day(date, jsonb, timestamptz) to service_role;

-- Capability check prevents an unpublished v4 writer replacing snapshots used by a v3 deployment.
create or replace function public.supports_exam_duration_algorithm(p_algorithm text)
returns boolean language sql stable security invoker set search_path = ''
as $$ select p_algorithm in ('actual-flow-v3','actual-flow-v4'); $$;
revoke all on function public.supports_exam_duration_algorithm(text) from public, anon, authenticated;
grant execute on function public.supports_exam_duration_algorithm(text) to service_role;
