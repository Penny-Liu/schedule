create table public.exam_duration_standards (
 key text primary key check(key in ('mrLargeMale','mrLargeFemale','mrLargeFemaleNoBreast','mrMedium','mrSmall','mrPostProcessing','usA','usBreast','usHeart','usThy','usCCA','usNeck','usPelvisFemale','usPelvisMale','ctGeneral','cta','ctaPostProcessing','dx','mg','bmd')),
 minutes numeric(6,1) not null check(minutes >= 0.1 and minutes <= 1440)
);
alter table public.exam_duration_standards enable row level security;
revoke all on public.exam_duration_standards from anon, authenticated;
grant select,insert,update on public.exam_duration_standards to authenticated;
grant all on public.exam_duration_standards to service_role;
create policy "Duration viewers read common standards" on public.exam_duration_standards
 for select to authenticated using (exists(select 1 from public.users u
 where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
 and (u.role in ('SYSTEM_ADMIN','SUPERVISOR') or 'workload_stats_view'=any(u.permissions))));
create policy "Duration managers insert common standards" on public.exam_duration_standards
 for insert to authenticated with check (exists(select 1 from public.users u
 where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
 and u.role in ('SYSTEM_ADMIN','SUPERVISOR') and not ('developer_sandbox'=any(coalesce(u.permissions,array[]::text[])))));
create policy "Duration managers update common standards" on public.exam_duration_standards
 for update to authenticated using (exists(select 1 from public.users u
 where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
 and u.role in ('SYSTEM_ADMIN','SUPERVISOR') and not ('developer_sandbox'=any(coalesce(u.permissions,array[]::text[])))))
 with check (exists(select 1 from public.users u
 where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
 and u.role in ('SYSTEM_ADMIN','SUPERVISOR') and not ('developer_sandbox'=any(coalesce(u.permissions,array[]::text[])))));
-- Fresh projects may not have Realtime configured; focus/refresh still reloads settings.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.exam_duration_standards;
 end if;
end $$;

insert into public.exam_duration_standards(key,minutes) values
('mrLargeMale',75),('mrLargeFemale',90),('mrLargeFemaleNoBreast',60),('mrMedium',55),('mrSmall',40),('mrPostProcessing',10),('usA',15),('usBreast',15),('usHeart',25),('usThy',10),('usCCA',10),('usNeck',10),('usPelvisFemale',7),('usPelvisMale',5),('ctGeneral',5),('cta',15),('ctaPostProcessing',45),('dx',5),('mg',15),('bmd',7);
