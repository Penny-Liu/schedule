create function public.can_access_health_mgmt_cycle(p_campus text,p_edit boolean default false)
returns boolean language sql stable security invoker set search_path='' as $$
 select p_campus in ('北投','大直') and exists(
  select 1 from public.users u where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
  and (u.role='SYSTEM_ADMIN' or ((u.role in ('HM_SUPERVISOR','HM_STAFF') or 'health_mgmt_view'=any(u.permissions))
   and (not p_edit or 'health_mgmt_edit'=any(u.permissions))
   and coalesce(nullif(u.health_mgmt_location,''),'全部') in ('全部',p_campus)))
 );
$$;
revoke all on function public.can_access_health_mgmt_cycle(text,boolean) from public,anon;
grant execute on function public.can_access_health_mgmt_cycle(text,boolean) to authenticated,service_role;

create table public.health_mgmt_personal_cycles(
 staff_id uuid not null references public.health_mgmt_staff(id),
 campus text not null check(campus in ('北投','大直')),
 cycle_id text not null check(length(cycle_id) between 1 and 100),
 start_date date not null,end_date date not null,
 memo text not null default '' check(length(memo)<=500),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 primary key(staff_id,campus,cycle_id),check(end_date-start_date between 0 and 366)
);
create index health_mgmt_personal_cycles_campus_cycle on public.health_mgmt_personal_cycles(campus,cycle_id,staff_id);
create index health_mgmt_personal_cycles_editor on public.health_mgmt_personal_cycles(updated_by);
alter table public.health_mgmt_personal_cycles enable row level security;
revoke all on public.health_mgmt_personal_cycles from public,anon,authenticated;
grant select,insert,update,delete on public.health_mgmt_personal_cycles to authenticated;
grant all on public.health_mgmt_personal_cycles to service_role;
create policy "View own campus health management cycles" on public.health_mgmt_personal_cycles for select to authenticated
 using(public.can_access_health_mgmt_cycle(campus,false));
create policy "Create own campus health management cycles" on public.health_mgmt_personal_cycles for insert to authenticated
 with check(public.can_access_health_mgmt_cycle(campus,true) and updated_by=(select auth.uid())
  and exists(select 1 from public.health_mgmt_staff s where s.id=staff_id and coalesce(nullif(s.location,''),'全部') in ('全部',campus))
  and exists(select 1 from public.settings s,jsonb_array_elements(coalesce(s.data->'healthMgmtCycles','[]'::jsonb)) c where c->>'id'=cycle_id and c->>'location'=campus));
create policy "Update own campus health management cycles" on public.health_mgmt_personal_cycles for update to authenticated
 using(public.can_access_health_mgmt_cycle(campus,true))
 with check(public.can_access_health_mgmt_cycle(campus,true) and updated_by=(select auth.uid())
  and exists(select 1 from public.health_mgmt_staff s where s.id=staff_id and coalesce(nullif(s.location,''),'全部') in ('全部',campus))
  and exists(select 1 from public.settings s,jsonb_array_elements(coalesce(s.data->'healthMgmtCycles','[]'::jsonb)) c where c->>'id'=cycle_id and c->>'location'=campus));
create policy "Reset own campus health management cycles" on public.health_mgmt_personal_cycles for delete to authenticated
 using(public.can_access_health_mgmt_cycle(campus,true));
create function public.stamp_health_mgmt_personal_cycle() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and (NEW.staff_id,NEW.campus,NEW.cycle_id) is distinct from (OLD.staff_id,OLD.campus,OLD.cycle_id) then
  raise exception '個人週期不可變更人員或院區識別';
 end if;
 NEW.updated_by=auth.uid();NEW.updated_at=now();return NEW;
end $$;
revoke all on function public.stamp_health_mgmt_personal_cycle() from public,anon,authenticated;
create trigger stamp_health_mgmt_personal_cycle before insert or update on public.health_mgmt_personal_cycles for each row execute function public.stamp_health_mgmt_personal_cycle();

create function public.guard_health_mgmt_default_cycles() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_old jsonb;v_new jsonb;v_id text;v_before jsonb;v_after jsonb;v_loc text;
begin
 v_before=case when TG_OP='UPDATE' then coalesce(OLD.data->'healthMgmtCycles','[]'::jsonb) else '[]'::jsonb end;
 v_after=coalesce(NEW.data->'healthMgmtCycles','[]'::jsonb);
 if v_before=v_after then return NEW;end if;
 if not (public.can_access_health_mgmt_cycle('北投',true) or public.can_access_health_mgmt_cycle('大直',true)) then raise exception '沒有健管預設週期編輯權限' using errcode='42501';end if;
 if jsonb_typeof(v_after)<>'array' then raise exception '週期資料格式錯誤';end if;
 if exists(select 1 from jsonb_array_elements(v_after) c group by c->>'id' having count(*)>1) then raise exception '週期識別不可重複';end if;
 for v_id in select distinct c->>'id' from jsonb_array_elements(v_before||v_after) c loop
  if v_id is null or length(v_id) not between 1 and 100 then raise exception '週期識別錯誤';end if;
  select c into v_old from jsonb_array_elements(v_before) c where c->>'id'=v_id limit 1;
  select c into v_new from jsonb_array_elements(v_after) c where c->>'id'=v_id limit 1;
  if v_old is not distinct from v_new then continue;end if;
  if v_id is null or length(v_id) not between 1 and 100 then raise exception '週期識別錯誤';end if;
  if v_old is not null and not public.can_access_health_mgmt_cycle(v_old->>'location',true) then raise exception '不可修改其他院區預設週期' using errcode='42501';end if;
  if v_new is not null then
   v_loc=v_new->>'location';
   if v_loc is null or not public.can_access_health_mgmt_cycle(v_loc,true) then raise exception '不可修改其他院區預設週期' using errcode='42501';end if;
   if v_old is not null and v_old->>'location' is distinct from v_loc then raise exception '既有週期不可轉移院區';end if;
   if coalesce(length(trim(v_new->>'name')),0) not between 1 and 100 or not coalesce((v_new->>'startDate')~'^\d{4}-\d{2}-\d{2}$',false) or not coalesce((v_new->>'endDate')~'^\d{4}-\d{2}-\d{2}$',false) then raise exception '請確認週期名稱與日期';end if;
   if ((v_new->>'endDate')::date-(v_new->>'startDate')::date) not between 0 and 366 then raise exception '週期日期範圍不正確';end if;
   if coalesce((v_old->>'isConfirmed')::boolean,false) and ((v_old->>'startDate',v_old->>'endDate') is distinct from (v_new->>'startDate',v_new->>'endDate')) then raise exception '週期已鎖定，請先解除鎖定';end if;
  elsif exists(select 1 from public.health_mgmt_personal_cycles p where p.cycle_id=v_id and p.campus=v_old->>'location') then raise exception '週期已有個人調整，不可刪除';
  end if;
 end loop;
 return NEW;
end $$;
revoke all on function public.guard_health_mgmt_default_cycles() from public,anon,authenticated;
create trigger guard_health_mgmt_default_cycles before insert or update of data on public.settings for each row execute function public.guard_health_mgmt_default_cycles();

create function public.set_health_mgmt_default_cycle(p_cycle jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare v_settings public.settings%rowtype;v_old jsonb;v_others jsonb;v_cycle jsonb;
begin
 if p_cycle->>'location' is null or not public.can_access_health_mgmt_cycle(p_cycle->>'location',true) then raise exception '沒有此院區的週期編輯權限' using errcode='42501';end if;
 select * into v_settings from public.settings order by id limit 1 for update;
 if not found then raise exception '尚未建立系統設定';end if;
 select c into v_old from jsonb_array_elements(coalesce(v_settings.data->'healthMgmtCycles','[]'::jsonb)) c where c->>'id'=p_cycle->>'id' limit 1;
 v_cycle=coalesce(v_old,'{}'::jsonb)||p_cycle;
 select coalesce(jsonb_agg(c.value order by c.ordinality),'[]'::jsonb) into v_others from jsonb_array_elements(coalesce(v_settings.data->'healthMgmtCycles','[]'::jsonb)) with ordinality c where c.value->>'id' is distinct from p_cycle->>'id';
 update public.settings set data=jsonb_set(coalesce(data,'{}'::jsonb),'{healthMgmtCycles}',jsonb_build_array(v_cycle)||v_others) where id=v_settings.id;
end $$;
revoke all on function public.set_health_mgmt_default_cycle(jsonb) from public,anon;
grant execute on function public.set_health_mgmt_default_cycle(jsonb) to authenticated;
