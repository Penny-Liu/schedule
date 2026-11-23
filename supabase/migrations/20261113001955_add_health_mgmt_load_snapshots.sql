create table public.health_mgmt_load_daily (
 exam_date date not null,
 location text not null check(location in ('北投','大直','未辨識')),
 counts jsonb not null check(jsonb_typeof(counts)='object'),
 customer_count integer not null check(customer_count>=0),
 source_count integer not null check(source_count>=0),
 unmapped_count integer not null check(unmapped_count>=0),
 missing_identity_count integer not null check(missing_identity_count>=0),
 fallback_identity_count integer not null check(fallback_identity_count>=0),
 items jsonb not null check(jsonb_typeof(items)='array'),
 algorithm text not null check(algorithm='hm-slots-v1'),
 synced_at timestamptz not null,
 primary key(exam_date,location)
);
create table public.health_mgmt_load_sync_days(exam_date date primary key,algorithm text not null check(algorithm='hm-slots-v1'),synced_at timestamptz not null);
alter table public.health_mgmt_load_daily enable row level security;
alter table public.health_mgmt_load_sync_days enable row level security;
revoke all on public.health_mgmt_load_daily,public.health_mgmt_load_sync_days from anon,authenticated;
grant select on public.health_mgmt_load_daily,public.health_mgmt_load_sync_days to authenticated;
grant all on public.health_mgmt_load_daily,public.health_mgmt_load_sync_days to service_role;
create policy "Health management viewers read daily load" on public.health_mgmt_load_daily for select to authenticated using(exists(
 select 1 from public.users u where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
 and (u.role in ('SYSTEM_ADMIN','HM_SUPERVISOR','HM_STAFF') or 'health_mgmt_view'=any(u.permissions))
 and (u.role='SYSTEM_ADMIN' or coalesce(nullif(u.health_mgmt_location,''),'全部')='全部' or u.health_mgmt_location=health_mgmt_load_daily.location)
));
create policy "Health management viewers read load sync days" on public.health_mgmt_load_sync_days for select to authenticated using(exists(
 select 1 from public.users u where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
 and (u.role in ('SYSTEM_ADMIN','HM_SUPERVISOR','HM_STAFF') or 'health_mgmt_view'=any(u.permissions))
));
create function public.replace_health_mgmt_load_day(p_date date,p_rows jsonb,p_captured_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('hm-load:'||p_date::text));
 if exists(select 1 from public.health_mgmt_load_sync_days where exam_date=p_date and synced_at>p_captured_at) then return false;end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or exists(select 1 from jsonb_array_elements(p_rows) x where (x->>'exam_date')::date is distinct from p_date or x->>'algorithm' is distinct from 'hm-slots-v1') then raise exception 'Invalid health-management snapshot';end if;
 delete from public.health_mgmt_load_daily where exam_date=p_date;
 insert into public.health_mgmt_load_daily select * from jsonb_populate_recordset(null::public.health_mgmt_load_daily,p_rows);
 insert into public.health_mgmt_load_sync_days values(p_date,'hm-slots-v1',p_captured_at) on conflict(exam_date) do update set algorithm=excluded.algorithm,synced_at=excluded.synced_at;
 return true;
end $$;
revoke all on function public.replace_health_mgmt_load_day(date,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.replace_health_mgmt_load_day(date,jsonb,timestamptz) to service_role;
