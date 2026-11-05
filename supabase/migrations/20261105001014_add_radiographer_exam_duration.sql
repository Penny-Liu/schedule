-- Only daily aggregate histograms are retained. No patient/order identifiers or timestamps.
create table public.radiographer_exam_duration_daily (
  exam_date date not null,
  radiographer_id text not null,
  radiographer_name text not null,
  category text not null check (category in ('MR','CT','US','BMD','MG','DX')),
  exam_name text not null,
  location text not null,
  resource_name text not null,
  total_count integer not null check (total_count >= 0),
  valid_count integer not null check (valid_count >= 0),
  missing_time_count integer not null check (missing_time_count >= 0),
  invalid_time_count integer not null check (invalid_time_count >= 0),
  zero_count integer not null check (zero_count >= 0),
  negative_count integer not null check (negative_count >= 0),
  shared_interval_count integer not null check (shared_interval_count >= 0),
  duplicate_count integer not null check (duplicate_count >= 0),
  outlier_count integer not null check (outlier_count >= 0),
  missing_staff_count integer not null check (missing_staff_count >= 0),
  duration_histogram jsonb not null default '{}'::jsonb check (jsonb_typeof(duration_histogram) = 'object'),
  algorithm text not null,
  synced_at timestamptz not null,
  primary key (exam_date, radiographer_id, category, exam_name, location, resource_name),
  check (total_count = valid_count + missing_time_count + invalid_time_count + zero_count + negative_count + shared_interval_count + duplicate_count + outlier_count + missing_staff_count)
);
create table public.radiographer_exam_duration_sync_days (
  exam_date date primary key,
  source_count integer not null check (source_count >= 0),
  summary_count integer not null check (summary_count >= 0),
  algorithm text not null,
  synced_at timestamptz not null
);
alter table public.radiographer_exam_duration_daily enable row level security;
alter table public.radiographer_exam_duration_sync_days enable row level security;
revoke all on public.radiographer_exam_duration_daily, public.radiographer_exam_duration_sync_days from anon, authenticated;
grant select on public.radiographer_exam_duration_daily, public.radiographer_exam_duration_sync_days to authenticated;
grant all on public.radiographer_exam_duration_daily, public.radiographer_exam_duration_sync_days to service_role;
create policy "Workload viewers read exam duration" on public.radiographer_exam_duration_daily
  for select to authenticated using (exists (
    select 1 from public.users u where u.auth_user_id = (select auth.uid())
      and coalesce(u.is_active, u."isActive", true)
      and (u.role = 'SYSTEM_ADMIN' or 'workload_stats_view' = any(u.permissions))
  ));
create policy "Workload viewers read duration sync status" on public.radiographer_exam_duration_sync_days
  for select to authenticated using (exists (
    select 1 from public.users u where u.auth_user_id = (select auth.uid())
      and coalesce(u.is_active, u."isActive", true)
      and (u.role = 'SYSTEM_ADMIN' or 'workload_stats_view' = any(u.permissions))
  ));

-- Each day's replacement and its completion marker commit together, including zero-result days.
create function public.replace_radiographer_exam_duration_day(p_date date, p_rows jsonb, p_captured_at timestamptz)
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
    values (p_date, coalesce((select sum(total_count) from public.radiographer_exam_duration_daily where exam_date = p_date), 0), jsonb_array_length(p_rows), 'actual-item-v1', p_captured_at)
    on conflict (exam_date) do update set source_count = excluded.source_count,
      summary_count = excluded.summary_count, algorithm = excluded.algorithm, synced_at = excluded.synced_at;
  return true;
end;
$$;
revoke all on function public.replace_radiographer_exam_duration_day(date, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_radiographer_exam_duration_day(date, jsonb, timestamptz) to service_role;
